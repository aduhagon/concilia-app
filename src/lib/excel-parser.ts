import * as XLSX from "xlsx"
import { MapeoColumnas, MovimientoNormalizado, Equivalencia } from "@/types"

export function leerExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[]
}

export function detectarColumnas(filas: Record<string, unknown>[]): string[] {
  if (!filas.length) return []
  return Object.keys(filas[0])
}

function parsearFecha(valor: unknown): string {
  if (!valor) return ""
  if (valor instanceof Date) return valor.toISOString().split("T")[0]
  const str = String(valor).trim()
  // DD/MM/YYYY
  const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (ddmm) {
    const [, d, m, y] = ddmm
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) return str.slice(0, 10)
  return str
}

function parsearImporte(fila: Record<string, unknown>, mapeo: MapeoColumnas): number {
  if (mapeo.importe) {
    const val = fila[mapeo.importe]
    const num = parseFloat(String(val).replace(/[.,\s$]/g, (m) => (m === "," || m === "." ? (String(val).lastIndexOf(m) === String(val).length - 3 ? "." : "") : "")))
    return isNaN(num) ? 0 : num
  }
  if (mapeo.debe && mapeo.haber) {
    const debe = parseFloat(String(fila[mapeo.debe] || "0").replace(/[^0-9.-]/g, "")) || 0
    const haber = parseFloat(String(fila[mapeo.haber] || "0").replace(/[^0-9.-]/g, "")) || 0
    return debe - haber
  }
  return 0
}

function aplicarEquivalencia(tipo_original: string, equivalencias: Equivalencia[], origen: "compania" | "contraparte"): string | null {
  if (!tipo_original) return null
  const texto = tipo_original.toUpperCase().trim()
  const eq = equivalencias.find(
    (e) =>
      e.activo &&
      (e.origen === origen || e.origen === "ambos") &&
      texto.includes(e.texto_original.toUpperCase().trim())
  )
  return eq ? eq.tipo_normalizado : null
}

export function normalizarMovimientos(
  filas: Record<string, unknown>[],
  mapeo: MapeoColumnas,
  origen: "compania" | "contraparte",
  equivalencias: Equivalencia[]
): { movimientos: MovimientoNormalizado[]; no_clasificados: string[] } {
  const noClasificados = new Set<string>()
  const movimientos: MovimientoNormalizado[] = []

  for (const fila of filas) {
    const fecha = parsearFecha(fila[mapeo.fecha])
    const comprobante = String(fila[mapeo.comprobante] || "").trim()
    const descripcion = String(fila[mapeo.descripcion] || "").trim()
    const tipo_original = descripcion
    const importe = parsearImporte(fila, mapeo)
    const tipo_normalizado = aplicarEquivalencia(tipo_original, equivalencias, origen)

    if (!tipo_normalizado && tipo_original) {
      noClasificados.add(tipo_original.slice(0, 50))
    }

    if (fecha && importe !== 0) {
      movimientos.push({ fecha, comprobante, descripcion, tipo_original, tipo_normalizado, importe, origen })
    }
  }

  return { movimientos, no_clasificados: Array.from(noClasificados) }
}

export function exportarResultadoExcel(data: {
  conciliados: unknown[]
  pendientes_compania: unknown[]
  pendientes_contraparte: unknown[]
  diferencias: unknown[]
  resumen: Record<string, unknown>
}): Buffer {
  const wb = XLSX.utils.book_new()

  const resumenRows = Object.entries(data.resumen).map(([k, v]) => ({ Concepto: k, Importe: v }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), "Resumen")

  if (data.conciliados.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.conciliados), "Conciliados")
  }
  if (data.pendientes_compania.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.pendientes_compania), "Pend. Compañía")
  }
  if (data.pendientes_contraparte.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.pendientes_contraparte), "Pend. Contraparte")
  }
  if (data.diferencias.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.diferencias), "Diferencias")
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
