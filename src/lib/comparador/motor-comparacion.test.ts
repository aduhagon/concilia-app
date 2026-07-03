import { describe, it, expect } from "vitest"
import {
  compararBases,
  parsearNumeroComparacion,
  parsearFechaComparacion,
  homologarColumnas,
  sugerirTipo,
} from "./motor-comparacion"
import type { ConfigComparacion, ColumnaComparacion } from "@/types/comparador"
import type { ConstructorClave } from "@/types"

// ── Helpers ──────────────────────────────────────────────────

const clavePorCampo = (campo: string): ConstructorClave => ({
  tipo: "visual",
  operaciones: [{ op: "campo", valor: campo }],
})

const colTexto = (o: string, d = o): ColumnaComparacion => ({
  columna_origen: o,
  columna_destino: d,
  comparar: true,
  tipo: "texto",
})

function config(columnas: ColumnaComparacion[], claveO = "ID", claveD = "ID"): ConfigComparacion {
  return {
    clave_origen: clavePorCampo(claveO),
    clave_destino: clavePorCampo(claveD),
    columnas,
  }
}

// ── Suite 1: matching básico ─────────────────────────────────

describe("matching básico por clave", () => {
  it("detecta fila idéntica como sin cambios", () => {
    const r = compararBases(
      [{ ID: "1", Nombre: "Juan" }],
      [{ ID: "1", Nombre: "Juan" }],
      config([colTexto("Nombre")])
    )
    expect(r.resumen.sin_cambios).toBe(1)
    expect(r.resumen.con_diferencias).toBe(0)
    expect(r.matches[0].diferencias).toHaveLength(0)
  })

  it("detecta diferencia de texto con valores origen/destino", () => {
    const r = compararBases(
      [{ ID: "1", Nombre: "Juan" }],
      [{ ID: "1", Nombre: "Pedro" }],
      config([colTexto("Nombre")])
    )
    expect(r.resumen.con_diferencias).toBe(1)
    expect(r.matches[0].diferencias).toEqual([
      {
        columna_origen: "Nombre",
        columna_destino: "Nombre",
        valor_origen: "Juan",
        valor_destino: "Pedro",
      },
    ])
  })

  it("clasifica solo_origen y solo_destino", () => {
    const r = compararBases(
      [{ ID: "1" }, { ID: "2" }],
      [{ ID: "2" }, { ID: "3" }],
      config([])
    )
    expect(r.resumen.solo_origen).toBe(1)
    expect(r.solo_origen[0].clave).toBe("1")
    expect(r.resumen.solo_destino).toBe(1)
    expect(r.solo_destino[0].clave).toBe("3")
    expect(r.matches).toHaveLength(1)
  })

  it("filas sin clave no matchean y se cuentan aparte", () => {
    const r = compararBases(
      [{ ID: "", Nombre: "x" }, { ID: "1", Nombre: "y" }],
      [{ ID: "1", Nombre: "y" }],
      config([colTexto("Nombre")])
    )
    expect(r.resumen.sin_clave_origen).toBe(1)
    expect(r.resumen.solo_origen).toBe(1)
    expect(r.resumen.sin_cambios).toBe(1)
  })
})

// ── Suite 2: homologación y exclusión de columnas ────────────

describe("homologación y exclusión de columnas", () => {
  it("compara columnas con nombres distintos (homologación)", () => {
    const r = compararBases(
      [{ ID: "1", Razon_Social: "ACME SA" }],
      [{ ID: "1", "Razón Social": "ACME SRL" }],
      config([
        { columna_origen: "Razon_Social", columna_destino: "Razón Social", comparar: true, tipo: "texto" },
      ])
    )
    expect(r.matches[0].diferencias).toHaveLength(1)
    expect(r.matches[0].diferencias[0].valor_destino).toBe("ACME SRL")
  })

  it("ignora columnas excluidas del análisis", () => {
    const r = compararBases(
      [{ ID: "1", Nombre: "Juan", Notas: "aaa" }],
      [{ ID: "1", Nombre: "Juan", Notas: "bbb" }],
      config([
        colTexto("Nombre"),
        { ...colTexto("Notas"), comparar: false },
      ])
    )
    expect(r.resumen.sin_cambios).toBe(1)
    expect(r.resumen.columnas_analizadas).toBe(1)
  })

  it("homologarColumnas auto-matchea nombres normalizados", () => {
    const cols = homologarColumnas(
      ["Razón Social", "CUIT", "Observaciones"],
      ["razon_social", "Cuit", "Otra"],
      { "Razón Social": "ACME", CUIT: 30123456789, Observaciones: "x" }
    )
    expect(cols[0].columna_destino).toBe("razon_social")
    expect(cols[1].columna_destino).toBe("Cuit")
    expect(cols[1].tipo).toBe("numero")
    expect(cols[2].columna_destino).toBe("")
    expect(cols[2].comparar).toBe(false)
  })
})

// ── Suite 3: comparación numérica ────────────────────────────

describe("comparación numérica", () => {
  const colNum = (tolerancia = 0): ColumnaComparacion => ({
    columna_origen: "Importe",
    columna_destino: "Importe",
    comparar: true,
    tipo: "numero",
    tolerancia,
  })

  it("número nativo vs string formato AR son iguales", () => {
    const r = compararBases(
      [{ ID: "1", Importe: 1234.56 }],
      [{ ID: "1", Importe: "1.234,56" }],
      config([colNum()])
    )
    expect(r.resumen.sin_cambios).toBe(1)
  })

  it("respeta la tolerancia numérica", () => {
    const conTol = compararBases(
      [{ ID: "1", Importe: 100 }],
      [{ ID: "1", Importe: 100.4 }],
      config([colNum(0.5)])
    )
    expect(conTol.resumen.sin_cambios).toBe(1)

    const sinTol = compararBases(
      [{ ID: "1", Importe: 100 }],
      [{ ID: "1", Importe: 100.4 }],
      config([colNum(0)])
    )
    expect(sinTol.resumen.con_diferencias).toBe(1)
  })

  it("parsearNumeroComparacion maneja formatos AR, US y paréntesis contables", () => {
    expect(parsearNumeroComparacion("1.234,56")).toBeCloseTo(1234.56)
    expect(parsearNumeroComparacion("1234.56")).toBeCloseTo(1234.56)
    expect(parsearNumeroComparacion("(1.000,00)")).toBeCloseTo(-1000)
    expect(parsearNumeroComparacion("abc")).toBeNull()
    expect(parsearNumeroComparacion("")).toBeNull()
  })
})

// ── Suite 4: comparación de fechas ───────────────────────────

describe("comparación de fechas", () => {
  const colFecha: ColumnaComparacion = {
    columna_origen: "Fecha",
    columna_destino: "Fecha",
    comparar: true,
    tipo: "fecha",
  }

  it("dd/mm/yyyy vs yyyy-mm-dd son iguales", () => {
    const r = compararBases(
      [{ ID: "1", Fecha: "15/03/2026" }],
      [{ ID: "1", Fecha: "2026-03-15" }],
      config([colFecha])
    )
    expect(r.resumen.sin_cambios).toBe(1)
  })

  it("serial de Excel vs string son iguales", () => {
    // 2026-03-15 = serial 46096
    expect(parsearFechaComparacion(46096)).toBe("2026-03-15")
    const r = compararBases(
      [{ ID: "1", Fecha: 46096 }],
      [{ ID: "1", Fecha: "15/03/2026" }],
      config([colFecha])
    )
    expect(r.resumen.sin_cambios).toBe(1)
  })

  it("fechas distintas generan diferencia", () => {
    const r = compararBases(
      [{ ID: "1", Fecha: "15/03/2026" }],
      [{ ID: "1", Fecha: "16/03/2026" }],
      config([colFecha])
    )
    expect(r.resumen.con_diferencias).toBe(1)
  })
})

// ── Suite 5: duplicados y claves compuestas ──────────────────

describe("duplicados y claves compuestas", () => {
  it("reporta claves duplicadas y solo la primera participa del match", () => {
    const r = compararBases(
      [
        { ID: "1", Nombre: "A" },
        { ID: "1", Nombre: "B" },
      ],
      [{ ID: "1", Nombre: "A" }],
      config([colTexto("Nombre")])
    )
    expect(r.duplicados_origen).toEqual([{ clave: "1", cantidad: 2 }])
    expect(r.resumen.sin_cambios).toBe(1)
    expect(r.resumen.solo_origen).toBe(1) // el duplicado sobrante
  })

  it("clave compuesta con padding matchea correctamente", () => {
    const cfg: ConfigComparacion = {
      clave_origen: {
        tipo: "visual",
        operaciones: [
          { op: "campo", valor: "Sucursal", padding: 4 },
          { op: "campo", valor: "Numero", padding: 8 },
        ],
      },
      clave_destino: {
        tipo: "visual",
        operaciones: [{ op: "campo", valor: "Comprobante" }, { op: "limpiar", quitar: ["-"] }],
      },
      columnas: [
        { columna_origen: "Estado", columna_destino: "Estado", comparar: true, tipo: "texto" },
      ],
    }
    const r = compararBases(
      [{ Sucursal: 33, Numero: 59579, Estado: "OK" }],
      [{ Comprobante: "0033-00059579", Estado: "OK" }],
      cfg
    )
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].clave).toBe("003300059579")
    expect(r.resumen.sin_cambios).toBe(1)
  })
})

// ── Suite 6: heurística de tipos ─────────────────────────────

describe("sugerirTipo", () => {
  it("sugiere tipos razonables", () => {
    expect(sugerirTipo(1234.5)).toBe("numero")
    expect(sugerirTipo(46096)).toBe("fecha") // serial Excel
    expect(sugerirTipo("15/03/2026")).toBe("fecha")
    expect(sugerirTipo("1.234,56")).toBe("numero")
    expect(sugerirTipo("ACME SA")).toBe("texto")
  })
})
