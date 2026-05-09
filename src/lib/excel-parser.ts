import * as XLSX from "xlsx"
import type {
  MapeoCompania,
  MapeoContraparte,
  MovimientoNorm,
  MovimientoResultado,
  ResultadoConciliacion,
  PapelConciliacion,
} from "@/types"

// ============================================================
// PARSER de Excel
// ------------------------------------------------------------
// Lee el archivo, devuelve filas + columnas detectadas para que
// el usuario pueda armar el mapeo en la UI.
// ============================================================

export type ArchivoLeido = {
  columnas: string[]
  filas: Record<string, unknown>[]
  hoja: string
}

export async function leerExcel(file: File): Promise<ArchivoLeido> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const hoja = wb.SheetNames[0]
  const ws = wb.Sheets[hoja]
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
  const columnas = filas.length > 0 ? Object.keys(filas[0]) : []
  return { columnas, filas, hoja }
}

// ============================================================
// NORMALIZACIÓN: aplica el mapeo de la plantilla
// ============================================================

export function normalizarCompania(
  filas: Record<string, unknown>[],
  mapeo: MapeoCompania,
  prefijoId = "c"
): MovimientoNorm[] {
  return filas.map((f, idx) => {
    const fechaRaw = f[mapeo.fecha]
    const importeArs = parsearNumero(f[mapeo.importe_ars])
    const importeUsd = mapeo.importe_usd ? parsearNumero(f[mapeo.importe_usd]) : 0
    const moneda: "ARS" | "USD" | null =
      mapeo.moneda && f[mapeo.moneda]
        ? String(f[mapeo.moneda]).toUpperCase().includes("USD") ||
          String(f[mapeo.moneda]).toUpperCase().includes("U$S")
          ? "USD"
          : "ARS"
        : importeUsd !== 0 && importeArs === 0
        ? "USD"
        : "ARS"

    return {
      id_unico: `${prefijoId}_${idx}`,
      origen: "compania",
      fecha: parsearFecha(fechaRaw),
      tipo_original: String(f[mapeo.tipo] ?? "").trim(),
      tipo_normalizado: null,
      regla_id: null,
      comprobante_raw: String(f[mapeo.comprobante] ?? "").trim(),
      clave_calculada: null,
      importe_ars: importeArs,
      importe_usd: importeUsd,
      moneda,
      descripcion: mapeo.descripcion ? String(f[mapeo.descripcion] ?? "") : "",
      raw: f,
    }
  })
}

export function normalizarContraparte(
  filas: Record<string, unknown>[],
  mapeo: MapeoContraparte,
  prefijoId = "x"
): MovimientoNorm[] {
  return filas.map((f, idx) => {
    const importe = parsearNumero(f[mapeo.importe])
    const monedaRaw = mapeo.moneda ? String(f[mapeo.moneda] ?? "").toUpperCase() : ""
    const moneda: "ARS" | "USD" | null = monedaRaw.includes("USD") || monedaRaw.includes("U$S")
      ? "USD"
      : monedaRaw.includes("ARS") || monedaRaw.includes("PESOS")
      ? "ARS"
      : null

    return {
      id_unico: `${prefijoId}_${idx}`,
      origen: "contraparte",
      fecha: parsearFecha(f[mapeo.fecha]),
      tipo_original: String(f[mapeo.tipo] ?? "").trim(),
      tipo_normalizado: null,
      regla_id: null,
      comprobante_raw: String(f[mapeo.comprobante] ?? "").trim(),
      clave_calculada: null,
      importe_ars: moneda === "ARS" || moneda === null ? importe : 0,
      importe_usd: moneda === "USD" ? importe : 0,
      moneda: moneda ?? "ARS",
      descripcion: mapeo.descripcion ? String(f[mapeo.descripcion] ?? "") : "",
      raw: f,
    }
  })
}

// ============================================================
// HELPERS
// ============================================================

function parsearNumero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  if (typeof v === "number") return v
  const s = String(v).replace(/\./g, "").replace(/,/g, ".")
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parsearFecha(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === "number") {
    // Serial Excel: días desde 1900-01-01 (con bug del año 1900)
    const epoch = new Date(Date.UTC(1899, 11, 30))
    return new Date(epoch.getTime() + v * 86400000)
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

// ============================================================
// EXPORT a Excel del resultado de conciliación
// ============================================================

export type OpcionesExport = {
  papel: PapelConciliacion
  contraparte: string
  periodoLabel?: string
  firmadoPor?: string
  aprobadoPor?: string
}

export function exportarResultadoExcel(
  resultado: ResultadoConciliacion,
  opciones?: OpcionesExport
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Solapa 1 — Presentación (estilo papel formal)
  if (opciones?.papel) {
    agregarHojaPresentacion(wb, opciones)
  }

  // Solapa 2 — Resumen ejecutivo
  const resumenRows = [
    { Concepto: "Movimientos compañía", Valor: resultado.resumen.total_compania },
    { Concepto: "Movimientos contraparte", Valor: resultado.resumen.total_contraparte },
    { Concepto: "Conciliados", Valor: resultado.resumen.conciliados },
    { Concepto: "Conciliados con dif. cambio", Valor: resultado.resumen.conciliados_dif_ars },
    { Concepto: "Conciliados con dif. real", Valor: resultado.resumen.conciliados_dif_real },
    { Concepto: "Pendientes compañía", Valor: resultado.resumen.pendientes_compania },
    { Concepto: "Pendientes contraparte", Valor: resultado.resumen.pendientes_contraparte },
    { Concepto: "Ajustes propios", Valor: resultado.resumen.ajustes_propios },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), "Resumen")

  // Solapas — por estado
  agregarSolapa(wb, resultado.movimientos.filter((m) => m.estado === "conciliado"), "Conciliados")
  agregarSolapa(wb, resultado.movimientos.filter((m) => m.estado === "conciliado_dif_ars"), "Dif Cambio")
  agregarSolapa(wb, resultado.movimientos.filter((m) => m.estado === "conciliado_dif_real"), "Dif Real")
  agregarSolapa(
    wb,
    resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "compania"),
    "Pend Compañía"
  )
  agregarSolapa(
    wb,
    resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "contraparte"),
    "Pend Contraparte"
  )
  agregarSolapa(wb, resultado.movimientos.filter((m) => m.estado === "ajuste_propio"), "Ajustes Propios")
  agregarSolapa(wb, resultado.movimientos.filter((m) => m.estado === "tipo_no_clasificado"), "Sin Clasificar")

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

// ----- Hoja "Presentación" estilo papel formal -----
function agregarHojaPresentacion(wb: XLSX.WorkBook, op: OpcionesExport) {
  const p = op.papel
  const s = p.saldos
  const c = p.composicion
  const today = new Date().toISOString().slice(0, 10)

  // Generamos como matriz de filas (cada fila es un array de celdas)
  const rows: (string | number)[][] = []

  rows.push(["Reporte de Conciliación"])
  rows.push([])
  rows.push(["Cuenta:", op.contraparte])
  rows.push(["Período:", op.periodoLabel ?? ""])
  rows.push(["Conciliación al:", today])
  rows.push(["TC Bco. Nac. Argentina:", s.tc_cierre])
  rows.push([])
  rows.push(["", "USD", "PESOS"])
  rows.push(["Saldo s/Gestión", s.final_compania_usd, s.final_compania_ars])
  rows.push(["Diferencia", p.diferencia_esperada_usd, p.diferencia_esperada_ars])
  rows.push(["Saldo s/Contraparte (tercero)", s.final_contraparte_usd, s.final_contraparte_ars])
  rows.push([])
  rows.push(["Detalle de Diferencia"])
  rows.push(["Categoría", "USD", "ARS", "Cantidad"])

  rows.push(["Comprobantes contabilizados con fecha posterior por MSU", c.posterior_msu.total_usd, c.posterior_msu.total_ars, c.posterior_msu.movimientos.length])
  for (const m of c.posterior_msu.movimientos) {
    rows.push([`    ${m.fecha?.toISOString().slice(0, 10) ?? ""} ${m.tipo_original} ${m.comprobante_raw}`, m.importe_usd, m.importe_ars, ""])
  }

  rows.push(["Comprobantes pendientes de contabilizar por MSU", c.pendiente_msu.total_usd, c.pendiente_msu.total_ars, c.pendiente_msu.movimientos.length])
  for (const m of c.pendiente_msu.movimientos) {
    rows.push([`    ${m.fecha?.toISOString().slice(0, 10) ?? ""} ${m.tipo_original} ${m.comprobante_raw}`, m.importe_usd, m.importe_ars, ""])
  }

  rows.push(["Comprobantes contabilizados por contraparte con fecha posterior", c.posterior_contraparte.total_usd, c.posterior_contraparte.total_ars, c.posterior_contraparte.movimientos.length])
  for (const m of c.posterior_contraparte.movimientos) {
    rows.push([`    ${m.fecha?.toISOString().slice(0, 10) ?? ""} ${m.tipo_original} ${m.comprobante_raw}`, m.importe_usd, m.importe_ars, ""])
  }

  rows.push(["Comprobantes no contabilizados por contraparte", c.no_contraparte.total_usd, c.no_contraparte.total_ars, c.no_contraparte.movimientos.length])
  for (const m of c.no_contraparte.movimientos) {
    rows.push([`    ${m.fecha?.toISOString().slice(0, 10) ?? ""} ${m.tipo_original} ${m.comprobante_raw}`, m.importe_usd, m.importe_ars, ""])
  }

  rows.push(["Ajustes a realizar por MSU", c.ajustes.total_usd, c.ajustes.total_ars, c.ajustes.ajustes.length])
  for (const a of c.ajustes.ajustes) {
    rows.push([`    ${a.fecha} ${a.concepto}${a.comprobante ? ` (${a.comprobante})` : ""}`, a.importe_usd, a.importe_ars, ""])
  }

  rows.push([])
  rows.push(["Total Diferencia explicada", p.diferencia_explicada_usd, p.diferencia_explicada_ars])
  rows.push(["Control (debería ser 0)", p.diferencia_sin_explicar_usd, p.diferencia_sin_explicar_ars])
  rows.push([])
  rows.push(["Conciliado por:", op.firmadoPor ?? "", "Fecha:", op.firmadoPor ? today : ""])
  rows.push(["Aprobado por:", op.aprobadoPor ?? "", "Fecha:", op.aprobadoPor ? today : ""])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  // Anchos básicos
  ws["!cols"] = [
    { wch: 70 },
    { wch: 20 },
    { wch: 22 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, "Presentación")
}

function agregarSolapa(wb: XLSX.WorkBook, movs: MovimientoResultado[], nombre: string) {
  if (movs.length === 0) return
  const rows = movs.map((m) => ({
    Origen: m.origen,
    Fecha: m.fecha ? m.fecha.toISOString().slice(0, 10) : "",
    Tipo: m.tipo_original,
    Comprobante: m.comprobante_raw,
    Clave: m.clave_calculada ?? "",
    "Importe ARS": m.importe_ars,
    "Importe USD": m.importe_usd,
    Moneda: m.moneda ?? "",
    Estado: m.estado,
    "Dif ARS": m.diferencia_ars ?? "",
    "Dif USD": m.diferencia_usd ?? "",
    Descripción: m.descripcion,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), nombre)
}
