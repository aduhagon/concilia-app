import { describe, it, expect } from "vitest"
import { conciliar } from "@/lib/motor-conciliacion"
import type { MovimientoNorm, PlantillaProveedor } from "@/types"

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
    comprobante_raw: null,
    importe_usd: 0,
    raw: {},
    ...overrides,
  }
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
        clave_compania: ["comprobante"],
        clave_contraparte: ["comprobante"],
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
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC",  importe_ars: 150000, comprobante_raw: "0001-00001234" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",   importe_ars: 150000, comprobante_raw: "0001-00001234" }),
    ]
    const r = conciliar(movs, plantilla())
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    const x1 = r.movimientos.find(m => m.id_unico === "x1")!

    expect(c1.estado).toBe("conciliado")
    expect(x1.estado).toBe("conciliado")
    expect(c1.match_id).toBe("x1")
    expect(x1.match_id).toBe("c1")
  })

  it("no concilia movimientos con clave diferente", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante_raw: "0001-00001234" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000, comprobante_raw: "0001-00009999" }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("pendiente")
    expect(r.movimientos.find(m => m.id_unico === "x1")!.estado).toBe("pendiente")
  })

  it("concilia con diferencia de importe dentro de tolerancia → conciliado_dif_ars", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000,    comprobante_raw: "0001-0001" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150000.50, comprobante_raw: "0001-0001" }),
    ]
    const r = conciliar(movs, plantilla())
    // Diferencia de $0.50 < tolerancia $1 → conciliado_dif_ars
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(["conciliado", "conciliado_dif_ars"]).toContain(c1.estado)
  })

  it("marca diferencia de importe cuando supera la tolerancia", () => {
    const p = plantilla()
    p.config.tolerancia_importe = 0.01
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 150000, comprobante_raw: "0001-0001" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 150010, comprobante_raw: "0001-0001" }),
    ]
    const r = conciliar(movs, p)
    const c1 = r.movimientos.find(m => m.id_unico === "c1")!
    expect(c1.estado).toBe("dif_importe")
  })

  it("no hace match doble — el segundo movimiento queda pendiente", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante_raw: "0001-0001" }),
      mov({ id_unico: "c2", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante_raw: "0001-0001" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, comprobante_raw: "0001-0001" }),
    ]
    const r = conciliar(movs, plantilla())
    const conciliados = r.movimientos.filter(m => m.estado === "conciliado")
    const pendientes  = r.movimientos.filter(m => m.estado === "pendiente")
    // Solo un match posible: c1 con x1 (o c2 con x1), el otro queda pendiente
    expect(conciliados.length).toBe(2) // par conciliado
    expect(pendientes.length).toBe(1)  // uno sin par
  })
})

// ─── Suite 2: Match por importe + fecha (Nivel 3) ────────────────────────────

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
})

// ─── Suite 3: Tipos sin contraparte (AJUSTE_PROPIO) ──────────────────────────

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
})

// ─── Suite 4: Tipos no clasificados ──────────────────────────────────────────

describe("Motor — tipos no clasificados", () => {
  it("marca como tipo_no_clasificado cuando el tipo no encaja en ninguna regla", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania", tipo_original: "TIPO_DESCONOCIDO_XYZ", importe_ars: 10000 }),
    ]
    const r = conciliar(movs, plantilla())
    expect(r.movimientos.find(m => m.id_unico === "c1")!.estado).toBe("tipo_no_clasificado")
  })
})

// ─── Suite 5: Match agrupado (Nivel 4) ───────────────────────────────────────

describe("Motor — match agrupado (nivel 4)", () => {
  it("detecta combinación N-a-1 cuando múltiples movimientos suman al importe del lado 1", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "PAGO", importe_ars: 60000, fecha: new Date("2024-05-10") }),
      mov({ id_unico: "c2", origen: "compania",    tipo_original: "PAGO", importe_ars: 90000, fecha: new Date("2024-05-11") }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "PAGO", importe_ars: 150000,fecha: new Date("2024-05-12") }),
    ]
    const r = conciliar(movs, plantilla())
    // c1 y c2 no concilian individualmente con x1 (importe diferente)
    // Pero debería aparecer una sugerencia agrupada
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
    // tolerancia de $1 — diferencia de $2000 → no debe sugerir
    const r = conciliar(movs, plantilla())
    const sugConX1 = r.sugerencias_agrupadas.filter(s => s.mov_lado_1 === "x1")
    expect(sugConX1.length).toBe(0)
  })
})

// ─── Suite 6: Resumen ─────────────────────────────────────────────────────────

describe("Motor — resumen de conciliación", () => {
  it("el resumen cuenta correctamente conciliados y pendientes", () => {
    const movs: MovimientoNorm[] = [
      mov({ id_unico: "c1", origen: "compania",    tipo_original: "FAC", importe_ars: 100000, comprobante_raw: "F001" }),
      mov({ id_unico: "x1", origen: "contraparte", tipo_original: "FC",  importe_ars: 100000, comprobante_raw: "F001" }),
      mov({ id_unico: "c2", origen: "compania",    tipo_original: "FAC", importe_ars: 200000, comprobante_raw: "F002" }),
      // x2 no existe → c2 queda pendiente
    ]
    const r = conciliar(movs, plantilla())
    expect(r.resumen.conciliados).toBe(2)   // c1 + x1
    expect(r.resumen.pendientes_compania).toBe(1)  // c2
    expect(r.resumen.pendientes_contraparte).toBe(0)
  })

  it("resultado vacío cuando no hay movimientos", () => {
    const r = conciliar([], plantilla())
    expect(r.movimientos.length).toBe(0)
    expect(r.sugerencias_agrupadas.length).toBe(0)
  })
})
