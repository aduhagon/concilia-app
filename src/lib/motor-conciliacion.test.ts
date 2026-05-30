import { describe, it, expect } from "vitest"
import { conciliar } from "@/lib/motor-conciliacion"
import type { MovimientoNorm, PlantillaProveedor, ConstructorClave } from "@/types"

// ─── Helpers de fixtures ──────────────────────────────────────────────────────

function mov(overrides: Partial<MovimientoNorm> & {
  id_unico: string
  origen: "compania" | "contraparte"
  tipo_original: string
  importe_ars: number
}): MovimientoNorm {
  return {
    fecha: new Date("2024-05-15"),
    tipo_normalizado: null,
    regla_id: null,
    clave_calculada: null,
    comprobante_raw: "",
    importe_usd: 0,
    moneda: "ARS",
    descripcion: "",
    raw: {},
    ...overrides,
  }
}

// Constructor de clave en el formato REAL que espera el motor:
// { tipo: "visual", operaciones: [...] }. La operacion "campo" lee de m.raw,
// asi que el fixture pone el valor del comprobante en raw.comprobante.
const CLAVE_COMPROBANTE: ConstructorClave = {
  tipo: "visual",
  operaciones: [{ op: "campo", valor: "comprobante" }],
}

// Helper para crear un movimiento con clave: setea raw.comprobante para que
// construirClave lo lea, y tambien comprobante_raw para trazabilidad.
function movClave(overrides: Partial<MovimientoNorm> & {
  id_unico: string
  origen: "compania" | "contraparte"
  tipo_original: string
  importe_ars: number
  comprobante: string
}): MovimientoNorm {
  const { comprobante, ...resto } = overrides
  return mov({
    ...resto,
    comprobante_raw: comprobante,
    raw: { comprobante },
  })
}

function plantilla(overrides: Partial<PlantillaProveedor> = {}): PlantillaProveedor {
  return {
    id: "plantilla-test",
    contraparte_id: "contra-test",
    mapeo_compania: {} as any,
    mapeo_contraparte: {} as any,
    tipos_sin_contraparte_compania: [],
    tipos_sin_contraparte_externa: [],
    config: {
      tolerancia_importe: 1,
      ventana_dias_default: 5,
      moneda_separada: false,
    },
    reglas_tipos: [
      {
        id: "factura",
        label: "Facturas",
        tipo_compania: ["FAC", "FACTURA"],
        tipo_contraparte: ["FC", "FAC"],
        metodo_match: "clave",
        clave_compania: CLAVE_COMPROBANTE,
        clave_contraparte: CLAVE_COMPROBANTE,
        ventana_dias: 5,
        prioridad: 1,
      },
      {
        id: "pago",
        label: "Pagos",
        tipo_compania: ["PAGO", "TRANSF"],
        tipo_contraparte: ["PAGO", "TRANSF"],
        metodo_match: "importe_fecha",
        ventana_dias: 3,
        prioridad: 2,
      },
    ],
    ...overrides,
  }
}

// ─── Suite 1: Match por clave (Nivel 1) ───────────────────────────────────────

describe("Motor — match por clave (nivel 1)", () => {
  it("concilia dos movimientos con la misma clave e importe exacto", () => {
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante: "0001-00001234" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000, comprobante: "0001-00001234" }),
    ]
    const r = conciliar(movs, plantilla())
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    const x1 = r.movimientos.find(m => m.id_unico === "x1")!

    expect(c1.estado).toBe("conciliado")
    expect(x1.estado).toBe("conciliado")
    expect(c1.match_id).toBe("x1")
    expect(x1.match_id).toBe("c1")
  })

  it("construye la clave correctamente (no queda vacia)", () => {
    // Test de regresion: asegura que el fixture usa el formato ConstructorClave
    // correcto. Si la clave queda vacia, este test falla.
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante: "ABC-123" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000, comprobante: "ABC-123" }),
    ]
    const r = conciliar(movs, plantilla())
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(c1.clave_calculada).toBe("ABC-123")
    expect(c1.estado).toBe("conciliado")
  })

  it("no concilia movimientos con clave diferente", () => {
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante: "0001-00001234" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000, comprobante: "0001-00009999" }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("pendiente")
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("pendiente")
  })

  it("concilia con diferencia de importe dentro de tolerancia → conciliado", () => {
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000,    comprobante: "0001-0001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000.50, comprobante: "0001-0001" }),
    ]
    const r = conciliar(movs, plantilla())
    // Diferencia de $0.50 < tolerancia $1 → conciliado (dentro de tolerancia)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(c1.estado).toBe("conciliado")
    expect(c1.match_id).toBe("x1")
  })

  it("misma clave con importe fuera de tolerancia → matchea como conciliado_dif_real", () => {
    const p = plantilla()
    p.config.tolerancia_importe = 0.01
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante: "0001-0001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150010, comprobante: "0001-0001" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    // La clave coincide → matchea igual, pero con estado de diferencia real
    expect(c1.estado).toBe("conciliado_dif_real")
    expect(c1.match_id).toBe("x1")
    expect(c1.diferencia_ars).toBeCloseTo(-10, 2)
  })

  it("no hace match doble — el segundo movimiento queda pendiente", () => {
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante: "0001-0001" }),
      movClave({ id_unico: "c2", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante: "0001-0001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, comprobante: "0001-0001" }),
    ]
    const r = conciliar(movs, plantilla())
    const conciliados = r.movimientos.filter(m => m.estado === "conciliado")
    const pendientes  = r.movimientos.filter(m => m.estado === "pendiente")
    // Solo un match posible: una factura de compania con x1, la otra pendiente
    expect(conciliados.length).toBe(2) // par conciliado
    expect(pendientes.length).toBe(1)  // uno sin par
  })

  it("clave vacia no matchea (movimiento sin comprobante en raw)", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, raw: {} }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000, raw: {} }),
    ]
    const r = conciliar(movs, plantilla())
    // Sin comprobante en raw, la clave es "" y no debe matchear
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("pendiente")
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("pendiente")
  })
})

// ─── Suite 2: Diferencia de cambio (USD) ──────────────────────────────────────

describe("Motor — match con dolares y diferencia de cambio", () => {
  it("misma clave, USD coincide y ARS coincide → conciliado", () => {
    const p = plantilla()
    p.config.moneda_separada = true
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, importe_usd: 100, moneda: "USD", comprobante: "U-1" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, importe_usd: 100, moneda: "USD", comprobante: "U-1" }),
    ]
    const r = conciliar(movs, p)
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("conciliado")
  })

  it("misma clave, USD coincide pero ARS difiere → conciliado_dif_ars (diferencia de cambio)", () => {
    const p = plantilla()
    p.config.moneda_separada = true
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, importe_usd: 100, moneda: "USD", comprobante: "U-2" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 105000, importe_usd: 100, moneda: "USD", comprobante: "U-2" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    // USD igual (100=100), ARS difiere por tipo de cambio → conciliado_dif_ars
    expect(c1.estado).toBe("conciliado_dif_ars")
    expect(c1.match_id).toBe("x1")
  })

  it("misma clave pero USD difiere → conciliado_dif_real", () => {
    const p = plantilla()
    p.config.moneda_separada = true
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, importe_usd: 100, moneda: "USD", comprobante: "U-3" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, importe_usd: 120, moneda: "USD", comprobante: "U-3" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(c1.estado).toBe("conciliado_dif_real")
  })
})

// ─── Suite 3: Tolerancia por regla (override) ─────────────────────────────────

describe("Motor — tolerancia por regla", () => {
  it("el override de la regla pisa la tolerancia global", () => {
    const p = plantilla()
    p.config.tolerancia_importe = 0.01            // global muy estricta
    p.reglas_tipos[0].tolerancia_importe_override = 100  // regla factura mas laxa
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante: "0001-0001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150050, comprobante: "0001-0001" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    // Diferencia $50 < override $100 → conciliado (no dif_real)
    expect(c1.estado).toBe("conciliado")
  })

  it("con override en 0 exige match exacto", () => {
    const p = plantilla()
    p.reglas_tipos[0].tolerancia_importe_override = 0
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000,    comprobante: "0001-0001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000.50, comprobante: "0001-0001" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    // Diferencia $0.50 > override 0 → conciliado_dif_real
    expect(c1.estado).toBe("conciliado_dif_real")
  })
})

// ─── Suite 4: Match por importe + fecha (Nivel 3) ────────────────────────────

describe("Motor — match por importe y fecha (nivel 3)", () => {
  it("concilia pagos con mismo importe dentro de la ventana de días", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 50000, fecha: new Date("2024-05-10") }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 50000, fecha: new Date("2024-05-12") }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("conciliado")
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("conciliado")
  })

  it("no concilia pagos fuera de la ventana de días", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 50000, fecha: new Date("2024-05-01") }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 50000, fecha: new Date("2024-05-10") }),
    ]
    const r = conciliar(movs, plantilla())
    // Ventana es 3 días, diferencia es 9 días → no concilia
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("pendiente")
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("pendiente")
  })

  it("elige el candidato más cercano en fecha cuando hay varios con el mismo importe", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1",    origen: "compania",    tipo_original: "PAGO", importe_ars: 75000, fecha: new Date("2024-05-15") }),
      mov({ id_unico: "x_cer", origen: "contraparte", tipo_original: "PAGO", importe_ars: 75000, fecha: new Date("2024-05-16") }), // 1 día
      mov({ id_unico: "x_lej", origen: "contraparte", tipo_original: "PAGO", importe_ars: 75000, fecha: new Date("2024-05-17") }), // 2 días
    ]
    const r = conciliar(movs, plantilla())
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(c1.match_id).toBe("x_cer")
  })

  it("no matchea por importe+fecha si falta la fecha en un lado", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 50000, fecha: null }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 50000, fecha: new Date("2024-05-12") }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("pendiente")
  })
})

// ─── Suite 5: Prioridad de reglas ─────────────────────────────────────────────

describe("Motor — prioridad de reglas", () => {
  it("un tipo que matchea dos reglas cae en la de mayor prioridad (menor numero)", () => {
    // Armamos dos reglas que ambas matchean el tipo "FAC", con prioridades distintas.
    const p = plantilla({
      reglas_tipos: [
        {
          id: "regla_baja",
          label: "Baja prioridad",
          tipo_compania: ["FAC"],
          tipo_contraparte: ["FC"],
          metodo_match: "clave",
          clave_compania: CLAVE_COMPROBANTE,
          clave_contraparte: CLAVE_COMPROBANTE,
          prioridad: 50,
        },
        {
          id: "regla_alta",
          label: "Alta prioridad",
          tipo_compania: ["FAC"],
          tipo_contraparte: ["FC"],
          metodo_match: "clave",
          clave_compania: CLAVE_COMPROBANTE,
          clave_contraparte: CLAVE_COMPROBANTE,
          prioridad: 1,
        },
      ],
    })
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania", tipo_original: "FAC", importe_ars: 100000, comprobante: "F-1" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    // Debe clasificarse en la regla de prioridad 1
    expect(c1.regla_id).toBe("regla_alta")
  })
})

// ─── Suite 6: Tipos sin contraparte (AJUSTE_PROPIO) ──────────────────────────

describe("Motor — tipos sin contraparte", () => {
  it("marca como ajuste_propio los tipos excluidos de compañía", () => {
    const p = plantilla()
    p.tipos_sin_contraparte_compania = ["NOTA_CREDITO_INTERNA"]
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania", tipo_original: "NOTA_CREDITO_INTERNA", importe_ars: 5000 }),
    ]
    const r = conciliar(movs, p)
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("ajuste_propio")
  })

  it("marca como ajuste_propio los tipos excluidos de contraparte", () => {
    const p = plantilla()
    p.tipos_sin_contraparte_externa = ["AJUSTE_INTERNO"]
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "AJUSTE_INTERNO", importe_ars: 3000 }),
    ]
    const r = conciliar(movs, p)
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("ajuste_propio")
  })

  it("clasifica por startsWith (prefijo del tipo)", () => {
    const p = plantilla()
    p.tipos_sin_contraparte_compania = ["DIF.CAMBIO"]
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania", tipo_original: "DIF.CAMBIO DEBITO", importe_ars: 200 }),
    ]
    const r = conciliar(movs, p)
    // "DIF.CAMBIO DEBITO" empieza con "DIF.CAMBIO" → ajuste_propio
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("ajuste_propio")
  })
})

// ─── Suite 7: Tipos no clasificados ──────────────────────────────────────────

describe("Motor — tipos no clasificados", () => {
  it("marca como tipo_no_clasificado cuando el tipo no encaja en ninguna regla", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania", tipo_original: "TIPO_DESCONOCIDO_XYZ", importe_ars: 10000 }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("tipo_no_clasificado")
  })
})

// ─── Suite 8: Match agrupado (Nivel 4) ───────────────────────────────────────

describe("Motor — match agrupado (nivel 4)", () => {
  it("detecta combinación N-a-1 cuando múltiples movimientos suman al importe del lado 1", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 60000, fecha: new Date("2024-05-10") }),
      mov({ id_unico: "c2", origen: "compania",    tipo_original: "PAGO", importe_ars: 90000, fecha: new Date("2024-05-11") }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 150000,fecha: new Date("2024-05-12") }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.sugerencias_agrupadas.length).toBeGreaterThan(0)
    const sug = r.sugerencias_agrupadas[0]
    expect(sug.movs_lado_n).toContain("c1")
    expect(sug.movs_lado_n).toContain("c2")
    expect(sug.mov_lado_1).toBe("x1")
  })

  it("no genera sugerencia agrupada si la diferencia supera la tolerancia", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 60000, fecha: new Date("2024-05-10") }),
      mov({ id_unico: "c2", origen: "compania",    tipo_original: "PAGO", importe_ars: 90000, fecha: new Date("2024-05-11") }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 152000,fecha: new Date("2024-05-12") }),
    ]
    const r = conciliar(movs, plantilla())
    const sugConX1 = r.sugerencias_agrupadas.filter(s => s.mov_lado_1 === "x1")
    expect(sugConX1.length).toBe(0)
  })
})

// ─── Suite 9: Resumen ─────────────────────────────────────────────────────────

describe("Motor — resumen de conciliación", () => {
  it("el resumen cuenta correctamente conciliados y pendientes", () => {
    const movs: MovimientoNorm[] = [
      movClave({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante: "F001" }),
      movClave({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, comprobante: "F001" }),
      movClave({ id_unico: "c2", origen: "compania",    tipo_original: "FAC", importe_ars: 200000, comprobante: "F002" }),
      // x2 no existe → c2 queda pendiente
    ]
    const r = conciliar(movs, plantilla())
    expect(r.resumen.conciliados).toBe(1)   // un PAR conciliado (el resumen divide /2)
    expect(r.resumen.pendientes_compania).toBe(1)  // c2
    expect(r.resumen.pendientes_contraparte).toBe(0)
  })

  it("resultado vacío cuando no hay movimientos", () => {
    const r = conciliar([], plantilla())
    expect(r.movimientos.length).toBe(0)
    expect(r.sugerencias_agrupadas.length).toBe(0)
  })
})
