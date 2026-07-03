// ============================================================
// Exportación a Excel del resultado del Comparador de Bases.
// Genera un workbook con hojas: Resumen, Diferencias,
// Solo origen, Solo destino y (si aplica) Duplicados.
// ============================================================

import * as XLSX from "xlsx"
import type { ColumnaComparacion, ResultadoComparacion } from "@/types/comparador"
import { valorAMostrar } from "./motor-comparacion"

export type OpcionesExportComparacion = {
  nombreOrigen?: string
  nombreDestino?: string
  columnas?: ColumnaComparacion[]
}

export function exportarComparacionExcel(
  resultado: ResultadoComparacion,
  opciones: OpcionesExportComparacion = {}
): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const r = resultado.resumen

  // ----- Hoja Resumen -----
  const resumenData: unknown[][] = [
    ["COMPARACIÓN DE BASES DE DATOS"],
    [],
    ["Archivo origen", opciones.nombreOrigen ?? ""],
    ["Archivo destino", opciones.nombreDestino ?? ""],
    ["Fecha", new Date().toISOString().slice(0, 10)],
    [],
    ["RESUMEN"],
    ["Filas en origen", r.total_origen],
    ["Filas en destino", r.total_destino],
    ["Coinciden sin cambios", r.sin_cambios],
    ["Coinciden con diferencias", r.con_diferencias],
    ["Total de diferencias por columna", r.total_diferencias_columna],
    ["Solo en origen", r.solo_origen],
    ["Solo en destino", r.solo_destino],
    ["Sin clave en origen", r.sin_clave_origen],
    ["Sin clave en destino", r.sin_clave_destino],
    ["Columnas analizadas", r.columnas_analizadas],
  ]

  if (opciones.columnas && opciones.columnas.length > 0) {
    resumenData.push([], ["COLUMNAS ANALIZADAS"], ["Origen", "Destino", "Tipo", "Tolerancia"])
    for (const c of opciones.columnas.filter((c) => c.comparar)) {
      resumenData.push([c.columna_origen, c.columna_destino, c.tipo, c.tolerancia ?? ""])
    }
    const excluidas = opciones.columnas.filter((c) => !c.comparar)
    if (excluidas.length > 0) {
      resumenData.push([], ["COLUMNAS EXCLUIDAS"])
      for (const c of excluidas) resumenData.push([c.columna_origen])
    }
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
  wsResumen["!cols"] = [{ wch: 34 }, { wch: 26 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen")

  // ----- Hoja Diferencias (una fila por columna con cambio) -----
  const difHeaders = ["Clave", "Columna origen", "Columna destino", "Valor origen", "Valor destino"]
  const difRows: unknown[][] = []
  for (const m of resultado.matches) {
    for (const d of m.diferencias) {
      difRows.push([m.clave, d.columna_origen, d.columna_destino, d.valor_origen, d.valor_destino])
    }
  }
  const wsDif = XLSX.utils.aoa_to_sheet([difHeaders, ...difRows])
  wsDif["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, wsDif, "Diferencias")

  // ----- Hoja Solo origen -----
  const colsOrigen = (opciones.columnas ?? []).map((c) => c.columna_origen)
  const soHeaders = ["Clave", ...colsOrigen]
  const soRows = resultado.solo_origen.map((f) => [
    f.clave || "(sin clave)",
    ...colsOrigen.map((c) => valorAMostrar(f.fila[c])),
  ])
  const wsSO = XLSX.utils.aoa_to_sheet([soHeaders, ...soRows])
  wsSO["!cols"] = soHeaders.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, wsSO, "Solo origen")

  // ----- Hoja Solo destino -----
  const colsDestino = (opciones.columnas ?? [])
    .map((c) => c.columna_destino)
    .filter((c) => c !== "")
  const sdHeaders = ["Clave", ...colsDestino]
  const sdRows = resultado.solo_destino.map((f) => [
    f.clave || "(sin clave)",
    ...colsDestino.map((c) => valorAMostrar(f.fila[c])),
  ])
  const wsSD = XLSX.utils.aoa_to_sheet([sdHeaders, ...sdRows])
  wsSD["!cols"] = sdHeaders.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, wsSD, "Solo destino")

  // ----- Hoja Duplicados (solo si hay) -----
  if (resultado.duplicados_origen.length > 0 || resultado.duplicados_destino.length > 0) {
    const dupData: unknown[][] = [["Lado", "Clave", "Cantidad de filas"]]
    for (const d of resultado.duplicados_origen) dupData.push(["Origen", d.clave, d.cantidad])
    for (const d of resultado.duplicados_destino) dupData.push(["Destino", d.clave, d.cantidad])
    const wsDup = XLSX.utils.aoa_to_sheet(dupData)
    wsDup["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsDup, "Duplicados")
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}
