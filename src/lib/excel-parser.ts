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
// HASH SHA-256
// ============================================================

export async function calcularHashArchivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest("SHA-256", buf)
  const hashArr = Array.from(new Uint8Array(hashBuf))
  return hashArr.map(b => b.toString(16).padStart(2, "0")).join("")
}

export type ArchivoFuenteInfo = {
  nombre_original: string
  hash_sha256: string
  filas_detectadas: number
}

export async function obtenerInfoArchivo(file: File, filas: number): Promise<ArchivoFuenteInfo> {
  const hash = await calcularHashArchivo(file)
  return {
    nombre_original: file.name,
    hash_sha256: hash,
    filas_detectadas: filas,
  }
}

// ============================================================
// NORMALIZACIÓN
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
      fila_origen: idx + 2,
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
      fila_origen: idx + 2,
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
    const epoch = new Date(Date.UTC(1899, 11, 30))
    return new Date(epoch.getTime() + v * 86400000)
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

// ============================================================
// EXPORT a Excel — VERSIÓN PROFESIONAL CON FORMATO
// ============================================================

export type OpcionesExport = {
  papel: PapelConciliacion
  contraparte: string
  periodoLabel?: string
  firmadoPor?: string
  aprobadoPor?: string
  // Nuevos campos opcionales
  sociedad?: string
  cuentaInterna?: string
  cuit?: string
  fechaCreacion?: string
  estado?: string
  nombreEmpresa?: string
  matchesAgrupados?: {
    tipo: string
    total_lado_n_ars: number
    importe_lado_1_ars: number
    diferencia_ars: number
    score_confianza: number
    movs_lado_n_detalle?: { fecha: string; tipo: string; comprobante: string; importe: number }[]
    mov_lado_1_detalle?: { fecha: string; tipo: string; comprobante: string; importe: number }
  }[]
}

// Estilos reutilizables
const STYLE_HEADER = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
  fill: { fgColor: { rgb: "1E3A5F" } },
  alignment: { horizontal: "left", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "1E3A5F" } },
    bottom: { style: "thin", color: { rgb: "1E3A5F" } },
  },
}

const STYLE_SUBHEADER = {
  font: { bold: true, color: { rgb: "1E3A5F" }, sz: 10 },
  fill: { fgColor: { rgb: "F0F2F8" } },
  alignment: { horizontal: "left", vertical: "center" },
}

const STYLE_TABLE_HEADER = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 9 },
  fill: { fgColor: { rgb: "1E3A5F" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: {
    top: { style: "thin", color: { rgb: "808080" } },
    bottom: { style: "thin", color: { rgb: "808080" } },
    left: { style: "thin", color: { rgb: "808080" } },
    right: { style: "thin", color: { rgb: "808080" } },
  },
}

const STYLE_NUM = {
  numFmt: "#,##0.00",
  alignment: { horizontal: "right" },
  font: { sz: 9 },
}

const STYLE_NUM_BOLD = {
  numFmt: "#,##0.00",
  font: { bold: true, sz: 10 },
  alignment: { horizontal: "right" },
  fill: { fgColor: { rgb: "FFF3C7" } },
}

const STYLE_LABEL = {
  font: { bold: true, sz: 9 },
  alignment: { horizontal: "left", vertical: "center" },
}

const STYLE_CELL = {
  font: { sz: 9 },
  alignment: { horizontal: "left", vertical: "center" },
}

const STYLE_DIFFERENCE_HIGHLIGHT = {
  font: { bold: true, color: { rgb: "B8590A" }, sz: 10 },
  fill: { fgColor: { rgb: "FFF3C7" } },
  numFmt: "#,##0.00",
  alignment: { horizontal: "right" },
}

const STYLE_OK = {
  font: { bold: true, color: { rgb: "1A7A4A" }, sz: 10 },
  fill: { fgColor: { rgb: "D4EFDF" } },
  numFmt: "#,##0.00",
  alignment: { horizontal: "right" },
}

export function exportarResultadoExcel(
  resultado: ResultadoConciliacion,
  opciones?: OpcionesExport
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // 1. PRESENTACIÓN
  if (opciones?.papel) {
    agregarHojaPresentacionPro(wb, opciones)
  }

  // 2. RESUMEN EJECUTIVO
  agregarHojaResumen(wb, resultado, opciones)

  // 3. SOLAPAS POR ESTADO
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "conciliado"), "Conciliados")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "conciliado_dif_ars"), "Dif Cambio")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "conciliado_dif_real"), "Dif Real")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "compania"), "Pend Compañía")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "contraparte"), "Pend Contraparte")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "ajuste_propio"), "Ajustes Propios")
  agregarSolapaPro(wb, resultado.movimientos.filter((m) => m.estado === "tipo_no_clasificado"), "Sin Clasificar")

  // 4. MATCHES AGRUPADOS si hay
  if (opciones?.matchesAgrupados && opciones.matchesAgrupados.length > 0) {
    agregarHojaAgrupados(wb, opciones.matchesAgrupados)
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

// ----------------------------------------------------------------
// HOJA: PRESENTACIÓN
// ----------------------------------------------------------------

function agregarHojaPresentacionPro(wb: XLSX.WorkBook, op: OpcionesExport) {
  const p = op.papel
  const s = p.saldos
  const c = p.composicion
  const today = new Date().toISOString().slice(0, 10)

  const ws: XLSX.WorkSheet = {}
  const range = { s: { c: 0, r: 0 }, e: { c: 4, r: 0 } }

  // Filas
  const setCell = (addr: string, value: any, style?: any) => {
    ws[addr] = { v: value, t: typeof value === "number" ? "n" : "s" }
    if (style) (ws[addr] as any).s = style
    const decoded = XLSX.utils.decode_cell(addr)
    if (decoded.c > range.e.c) range.e.c = decoded.c
    if (decoded.r > range.e.r) range.e.r = decoded.r
  }

  // ── ENCABEZADO ──
  setCell("A1", op.nombreEmpresa ?? "CONCILIA", STYLE_HEADER)
  setCell("A2", "REPORTE DE CONCILIACIÓN DE CUENTAS CORRIENTES", {
    font: { bold: true, sz: 14, color: { rgb: "1E3A5F" } },
    alignment: { horizontal: "left" },
  })

  let r = 4

  // ── DATOS DEL PROVEEDOR ──
  setCell(`A${r}`, "INFORMACIÓN DEL PROVEEDOR", STYLE_SUBHEADER)
  r += 1
  setCell(`A${r}`, "Proveedor:", STYLE_LABEL)
  setCell(`B${r}`, op.contraparte, STYLE_CELL)
  r += 1
  if (op.cuit) {
    setCell(`A${r}`, "CUIT:", STYLE_LABEL)
    setCell(`B${r}`, op.cuit, STYLE_CELL)
    r += 1
  }
  if (op.sociedad) {
    setCell(`A${r}`, "Sociedad del grupo:", STYLE_LABEL)
    setCell(`B${r}`, op.sociedad, STYLE_CELL)
    r += 1
  }
  if (op.cuentaInterna) {
    setCell(`A${r}`, "Cuenta interna:", STYLE_LABEL)
    setCell(`B${r}`, op.cuentaInterna, STYLE_CELL)
    r += 1
  }
  setCell(`A${r}`, "Período:", STYLE_LABEL)
  setCell(`B${r}`, op.periodoLabel ?? "—", STYLE_CELL)
  r += 1
  setCell(`A${r}`, "Conciliación al:", STYLE_LABEL)
  setCell(`B${r}`, op.fechaCreacion ?? today, STYLE_CELL)
  r += 1
  setCell(`A${r}`, "TC Cierre:", STYLE_LABEL)
  setCell(`B${r}`, s.tc_cierre, { ...STYLE_NUM, font: { sz: 9, bold: true } })
  r += 1
  if (op.estado) {
    setCell(`A${r}`, "Estado:", STYLE_LABEL)
    setCell(`B${r}`, op.estado.toUpperCase(), {
      font: { bold: true, color: { rgb: "1A7A4A" }, sz: 10 },
      alignment: { horizontal: "left" },
    })
    r += 1
  }

  r += 1

  // ── SALDOS ──
  setCell(`A${r}`, "SALDOS", STYLE_SUBHEADER)
  r += 1
  setCell(`A${r}`, "Concepto", STYLE_TABLE_HEADER)
  setCell(`B${r}`, "USD", STYLE_TABLE_HEADER)
  setCell(`C${r}`, "ARS", STYLE_TABLE_HEADER)
  r += 1
  setCell(`A${r}`, "Saldo s/Gestión (compañía)", STYLE_CELL)
  setCell(`B${r}`, s.final_compania_usd, STYLE_NUM)
  setCell(`C${r}`, s.final_compania_ars, STYLE_NUM)
  r += 1
  setCell(`A${r}`, "Saldo s/Contraparte (tercero)", STYLE_CELL)
  setCell(`B${r}`, s.final_contraparte_usd, STYLE_NUM)
  setCell(`C${r}`, s.final_contraparte_ars, STYLE_NUM)
  r += 1
  const okDif = Math.abs(p.diferencia_esperada_ars) < 1
  setCell(`A${r}`, "Diferencia final", { font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } })
  setCell(`B${r}`, p.diferencia_esperada_usd, okDif ? STYLE_OK : STYLE_DIFFERENCE_HIGHLIGHT)
  setCell(`C${r}`, p.diferencia_esperada_ars, okDif ? STYLE_OK : STYLE_DIFFERENCE_HIGHLIGHT)
  r += 2

  // ── COMPOSICIÓN DE LA DIFERENCIA ──
  setCell(`A${r}`, "COMPOSICIÓN DE LA DIFERENCIA", STYLE_SUBHEADER)
  r += 1
  setCell(`A${r}`, "Categoría", STYLE_TABLE_HEADER)
  setCell(`B${r}`, "USD", STYLE_TABLE_HEADER)
  setCell(`C${r}`, "ARS", STYLE_TABLE_HEADER)
  setCell(`D${r}`, "Cantidad", STYLE_TABLE_HEADER)
  r += 1

  const categorias = [
    { label: "Comprobantes contabilizados con fecha posterior por MSU", data: c.posterior_msu },
    { label: "Comprobantes pendientes de contabilizar por MSU", data: c.pendiente_msu },
    { label: "Comprobantes contabilizados por contraparte con fecha posterior", data: c.posterior_contraparte },
    { label: "Comprobantes no contabilizados por contraparte", data: c.no_contraparte },
  ]

  for (const cat of categorias) {
    setCell(`A${r}`, cat.label, { ...STYLE_LABEL, fill: { fgColor: { rgb: "F5F5F2" } } })
    setCell(`B${r}`, cat.data.total_usd, { ...STYLE_NUM_BOLD, fill: { fgColor: { rgb: "F5F5F2" } } })
    setCell(`C${r}`, cat.data.total_ars, { ...STYLE_NUM_BOLD, fill: { fgColor: { rgb: "F5F5F2" } } })
    setCell(`D${r}`, cat.data.movimientos.length, { ...STYLE_CELL, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "F5F5F2" } } })
    r += 1
    for (const m of cat.data.movimientos) {
      const fecha = m.fecha?.toISOString().slice(0, 10) ?? ""
      setCell(`A${r}`, `    ${fecha} ${m.tipo_original} ${m.comprobante_raw}`, { font: { sz: 8, color: { rgb: "606060" } }, alignment: { horizontal: "left" } })
      setCell(`B${r}`, m.importe_usd, { ...STYLE_NUM, font: { sz: 8 } })
      setCell(`C${r}`, m.importe_ars, { ...STYLE_NUM, font: { sz: 8 } })
      r += 1
    }
  }

  // Ajustes manuales
  setCell(`A${r}`, "Ajustes a realizar por MSU", { ...STYLE_LABEL, fill: { fgColor: { rgb: "F5F5F2" } } })
  setCell(`B${r}`, c.ajustes.total_usd, { ...STYLE_NUM_BOLD, fill: { fgColor: { rgb: "F5F5F2" } } })
  setCell(`C${r}`, c.ajustes.total_ars, { ...STYLE_NUM_BOLD, fill: { fgColor: { rgb: "F5F5F2" } } })
  setCell(`D${r}`, c.ajustes.ajustes.length, { ...STYLE_CELL, alignment: { horizontal: "center" }, fill: { fgColor: { rgb: "F5F5F2" } } })
  r += 1
  for (const a of c.ajustes.ajustes) {
    setCell(`A${r}`, `    ${a.fecha} ${a.concepto}${a.comprobante ? ` (${a.comprobante})` : ""}`, { font: { sz: 8, color: { rgb: "606060" } } })
    setCell(`B${r}`, a.importe_usd, { ...STYLE_NUM, font: { sz: 8 } })
    setCell(`C${r}`, a.importe_ars, { ...STYLE_NUM, font: { sz: 8 } })
    r += 1
  }

  r += 1

  // ── TOTALES DE CONTROL ──
  setCell(`A${r}`, "Total Diferencia explicada", { font: { bold: true, sz: 10 } })
  setCell(`B${r}`, p.diferencia_explicada_usd, STYLE_NUM_BOLD)
  setCell(`C${r}`, p.diferencia_explicada_ars, STYLE_NUM_BOLD)
  r += 1
  const ok = Math.abs(p.diferencia_sin_explicar_ars) < 1
  setCell(`A${r}`, "Control (debería ser 0)", { font: { bold: true, sz: 10 } })
  setCell(`B${r}`, p.diferencia_sin_explicar_usd, ok ? STYLE_OK : STYLE_DIFFERENCE_HIGHLIGHT)
  setCell(`C${r}`, p.diferencia_sin_explicar_ars, ok ? STYLE_OK : STYLE_DIFFERENCE_HIGHLIGHT)
  r += 2

  // ── FIRMAS ──
  setCell(`A${r}`, "FIRMAS", STYLE_SUBHEADER)
  r += 1
  setCell(`A${r}`, "Conciliado por:", STYLE_LABEL)
  setCell(`B${r}`, op.firmadoPor ?? "—", STYLE_CELL)
  setCell(`C${r}`, "Fecha:", STYLE_LABEL)
  setCell(`D${r}`, op.firmadoPor ? today : "—", STYLE_CELL)
  r += 1
  setCell(`A${r}`, "Aprobado por:", STYLE_LABEL)
  setCell(`B${r}`, op.aprobadoPor ?? "—", STYLE_CELL)
  setCell(`C${r}`, "Fecha:", STYLE_LABEL)
  setCell(`D${r}`, op.aprobadoPor ? today : "—", STYLE_CELL)

  // Anchos
  ws["!cols"] = [{ wch: 75 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 12 }]
  ws["!ref"] = XLSX.utils.encode_range(range)

  // Combinar A1:E1 para el header
  ws["!merges"] = [
    { s: { c: 0, r: 0 }, e: { c: 4, r: 0 } },
    { s: { c: 0, r: 1 }, e: { c: 4, r: 1 } },
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Presentación")
}

// ----------------------------------------------------------------
// HOJA: RESUMEN EJECUTIVO
// ----------------------------------------------------------------

function agregarHojaResumen(wb: XLSX.WorkBook, resultado: ResultadoConciliacion, op?: OpcionesExport) {
  const ws: XLSX.WorkSheet = {}
  const setCell = (addr: string, value: any, style?: any) => {
    ws[addr] = { v: value, t: typeof value === "number" ? "n" : "s" }
    if (style) (ws[addr] as any).s = style
  }

  setCell("A1", "RESUMEN EJECUTIVO", {
    font: { bold: true, sz: 14, color: { rgb: "1E3A5F" } },
  })

  if (op?.contraparte) {
    setCell("A2", `${op.contraparte}${op.sociedad ? ` · ${op.sociedad}` : ""}${op.cuentaInterna ? ` · ${op.cuentaInterna}` : ""}`, {
      font: { sz: 11, color: { rgb: "606060" } },
    })
    setCell("A3", `Período: ${op.periodoLabel ?? "—"}`, { font: { sz: 9 } })
  }

  let r = 5
  setCell(`A${r}`, "Métrica", STYLE_TABLE_HEADER)
  setCell(`B${r}`, "Valor", STYLE_TABLE_HEADER)
  r += 1

  const filas = [
    ["Movimientos compañía", resultado.resumen.total_compania],
    ["Movimientos contraparte", resultado.resumen.total_contraparte],
    ["Conciliados (match exacto)", resultado.resumen.conciliados],
    ["Conciliados con diferencia de cambio", resultado.resumen.conciliados_dif_ars],
    ["Conciliados con diferencia real", resultado.resumen.conciliados_dif_real],
    ["Pendientes compañía", resultado.resumen.pendientes_compania],
    ["Pendientes contraparte", resultado.resumen.pendientes_contraparte],
    ["Ajustes propios", resultado.resumen.ajustes_propios],
  ]

  for (const [label, val] of filas) {
    setCell(`A${r}`, label, STYLE_CELL)
    setCell(`B${r}`, val, { ...STYLE_NUM, font: { sz: 10, bold: true } })
    r += 1
  }

  ws["!cols"] = [{ wch: 45 }, { wch: 18 }]
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 1, r: r } })

  XLSX.utils.book_append_sheet(wb, ws, "Resumen")
}

// ----------------------------------------------------------------
// HOJA: SOLAPA POR ESTADO
// ----------------------------------------------------------------

function agregarSolapaPro(wb: XLSX.WorkBook, movs: MovimientoResultado[], nombre: string) {
  if (movs.length === 0) return

  const ws: XLSX.WorkSheet = {}
  const setCell = (addr: string, value: any, style?: any) => {
    if (value === null || value === undefined || value === "") {
      ws[addr] = { v: "", t: "s" }
    } else {
      ws[addr] = { v: value, t: typeof value === "number" ? "n" : "s" }
    }
    if (style) (ws[addr] as any).s = style
  }

  // Headers
  const headers = ["Origen", "Fecha", "Tipo", "Comprobante", "Clave", "Importe ARS", "Importe USD", "Moneda", "Estado", "Dif ARS", "Dif USD", "Fila Origen", "Descripción"]
  headers.forEach((h, i) => {
    setCell(XLSX.utils.encode_cell({ c: i, r: 0 }), h, STYLE_TABLE_HEADER)
  })

  // Filas
  let totalArs = 0
  let totalUsd = 0
  movs.forEach((m, idx) => {
    const r = idx + 1
    setCell(XLSX.utils.encode_cell({ c: 0, r }), m.origen, { ...STYLE_CELL, font: { sz: 9, color: { rgb: m.origen === "compania" ? "1E3A5F" : "B8590A" } } })
    setCell(XLSX.utils.encode_cell({ c: 1, r }), m.fecha ? m.fecha.toISOString().slice(0, 10) : "", STYLE_CELL)
    setCell(XLSX.utils.encode_cell({ c: 2, r }), m.tipo_original, STYLE_CELL)
    setCell(XLSX.utils.encode_cell({ c: 3, r }), m.comprobante_raw, STYLE_CELL)
    setCell(XLSX.utils.encode_cell({ c: 4, r }), m.clave_calculada ?? "", STYLE_CELL)
    setCell(XLSX.utils.encode_cell({ c: 5, r }), m.importe_ars, STYLE_NUM)
    setCell(XLSX.utils.encode_cell({ c: 6, r }), m.importe_usd, STYLE_NUM)
    setCell(XLSX.utils.encode_cell({ c: 7, r }), m.moneda ?? "", { ...STYLE_CELL, alignment: { horizontal: "center" } })
    setCell(XLSX.utils.encode_cell({ c: 8, r }), m.estado, STYLE_CELL)
    setCell(XLSX.utils.encode_cell({ c: 9, r }), m.diferencia_ars ?? "", STYLE_NUM)
    setCell(XLSX.utils.encode_cell({ c: 10, r }), m.diferencia_usd ?? "", STYLE_NUM)
    setCell(XLSX.utils.encode_cell({ c: 11, r }), (m as any).fila_origen ?? "", { ...STYLE_CELL, alignment: { horizontal: "center" } })
    setCell(XLSX.utils.encode_cell({ c: 12, r }), m.descripcion, { ...STYLE_CELL, font: { sz: 8, color: { rgb: "606060" } } })

    totalArs += m.importe_ars || 0
    totalUsd += m.importe_usd || 0
  })

  // Fila de totales
  const totalR = movs.length + 1
  setCell(XLSX.utils.encode_cell({ c: 0, r: totalR }), "TOTAL", { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: "F0F2F8" } } })
  setCell(XLSX.utils.encode_cell({ c: 5, r: totalR }), totalArs, STYLE_NUM_BOLD)
  setCell(XLSX.utils.encode_cell({ c: 6, r: totalR }), totalUsd, STYLE_NUM_BOLD)

  // Freeze panes para que el header quede fijo
  ws["!freeze"] = { xSplit: 0, ySplit: 1 }

  // Anchos
  ws["!cols"] = [
    { wch: 11 }, // Origen
    { wch: 11 }, // Fecha
    { wch: 22 }, // Tipo
    { wch: 22 }, // Comprobante
    { wch: 18 }, // Clave
    { wch: 16 }, // Importe ARS
    { wch: 14 }, // Importe USD
    { wch: 8 },  // Moneda
    { wch: 18 }, // Estado
    { wch: 14 }, // Dif ARS
    { wch: 12 }, // Dif USD
    { wch: 10 }, // Fila Origen
    { wch: 35 }, // Descripción
  ]

  // Autofilter
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: totalR - 1 } }) }

  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: totalR } })

  XLSX.utils.book_append_sheet(wb, ws, nombre)
}

// ----------------------------------------------------------------
// HOJA: MATCHES AGRUPADOS
// ----------------------------------------------------------------

function agregarHojaAgrupados(wb: XLSX.WorkBook, matches: NonNullable<OpcionesExport["matchesAgrupados"]>) {
  const ws: XLSX.WorkSheet = {}
  const setCell = (addr: string, value: any, style?: any) => {
    ws[addr] = { v: value, t: typeof value === "number" ? "n" : "s" }
    if (style) (ws[addr] as any).s = style
  }

  setCell("A1", "MATCHES AGRUPADOS (NIVEL 4)", {
    font: { bold: true, sz: 14, color: { rgb: "1E3A5F" } },
  })
  setCell("A2", `${matches.length} combinaciones aceptadas`, { font: { sz: 9, color: { rgb: "606060" } } })

  let r = 4
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    setCell(`A${r}`, `Match ${i + 1} — ${m.tipo}`, STYLE_SUBHEADER)
    setCell(`D${r}`, `Confianza: ${m.score_confianza.toFixed(0)}%`, { font: { bold: true, sz: 9, color: { rgb: "1A7A4A" } } })
    r += 1

    setCell(`A${r}`, "Total lado N (ARS):", STYLE_LABEL)
    setCell(`B${r}`, m.total_lado_n_ars, STYLE_NUM)
    setCell(`C${r}`, "Importe lado 1 (ARS):", STYLE_LABEL)
    setCell(`D${r}`, m.importe_lado_1_ars, STYLE_NUM)
    r += 1
    const okGrupo = Math.abs(m.diferencia_ars) < 1
    setCell(`A${r}`, "Diferencia:", STYLE_LABEL)
    setCell(`B${r}`, m.diferencia_ars, okGrupo ? STYLE_OK : STYLE_DIFFERENCE_HIGHLIGHT)
    r += 2
  }

  ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 18 }]
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 3, r: r } })

  XLSX.utils.book_append_sheet(wb, ws, "Matches Agrupados")
}