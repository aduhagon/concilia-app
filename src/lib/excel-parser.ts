import * as XLSX from "xlsx"
import type { MapeoCompania, MapeoContraparte, MovimientoNorm } from "@/types"

// ============================================================
// Utilidades de parseo
// ============================================================

export function parsearNumero(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0
  if (typeof val === "number") return val
  const s = String(val).replace(/\./g, "").replace(",", ".").trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parsearFecha(val: unknown): Date | null {
  if (val === null || val === undefined || val === "") return null

  // Excel serial number
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }

  // String
  if (typeof val === "string") {
    // dd/mm/yyyy o dd-mm-yyyy
    const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (match) {
      const [, d, m, y] = match
      const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
      return new Date(year, parseInt(m) - 1, parseInt(d))
    }
    // yyyy-mm-dd (ISO)
    const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      const [, y, m, d] = iso
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    }
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }

  return null
}

function parsearMoneda(val: unknown): "ARS" | "USD" | null {
  if (!val) return null
  const s = String(val).toUpperCase().trim()
  if (s.includes("USD") || s.includes("U$S") || s.includes("$U")) return "USD"
  if (s.includes("ARS") || s.includes("PES") || s.includes("$")) return "ARS"
  return null
}

// ============================================================
// Leer Excel → filas crudas
// ============================================================

export type ResultadoExcel = {
  columnas: string[]
  filas: Record<string, unknown>[]
}

export async function leerExcel(file: File): Promise<ResultadoExcel> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: "array", cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  })

  if (raw.length === 0) return { columnas: [], filas: [] }

  const columnas = Object.keys(raw[0])
  return { columnas, filas: raw }
}

// ============================================================
// Normalizar compañía
// ============================================================

export function normalizarCompania(
  filas: Record<string, unknown>[],
  mapeo: MapeoCompania
): MovimientoNorm[] {
  return filas
    .map((f, idx) => {
      const importeArs =
        parsearNumero(f[mapeo.importe_ars]) * (mapeo.importe_ars_invertir ? -1 : 1)
      const importeUsd =
        (mapeo.importe_usd ? parsearNumero(f[mapeo.importe_usd]) : 0) *
        (mapeo.importe_usd_invertir ? -1 : 1)

      const moneda = mapeo.moneda ? parsearMoneda(f[mapeo.moneda]) : null

      return {
        id_unico: `cmp_${idx}`,
        origen: "compania" as const,
        fecha: parsearFecha(f[mapeo.fecha]),
        tipo_original: mapeo.tipo ? String(f[mapeo.tipo] ?? "").trim() : "",
        tipo_normalizado: null,
        regla_id: null,
        comprobante_raw: mapeo.comprobante
          ? String(f[mapeo.comprobante] ?? "").trim()
          : "",
        clave_calculada: null,
        importe_ars: importeArs,
        importe_usd: importeUsd,
        moneda,
        descripcion: mapeo.descripcion
          ? String(f[mapeo.descripcion] ?? "").trim()
          : "",
        raw: f,
      }
    })
    .filter((m) => m.tipo_original !== "" || m.importe_ars !== 0)
}

// ============================================================
// Normalizar contraparte
// ============================================================

export function normalizarContraparte(
  filas: Record<string, unknown>[],
  mapeo: MapeoContraparte
): MovimientoNorm[] {
  return filas
    .map((f, idx) => {
      // Lógica con importe_a_favor_cliente / importe_a_favor_contraparte
      let importe: number

      if (mapeo.importe_a_favor_cliente && mapeo.importe_a_favor_contraparte) {
        const favor = parsearNumero(f[mapeo.importe_a_favor_cliente])
        const contra = parsearNumero(f[mapeo.importe_a_favor_contraparte])
        importe = favor - contra
      } else {
        importe =
          parsearNumero(f[mapeo.importe]) * (mapeo.importe_invertir ? -1 : 1)
      }

      const moneda = mapeo.moneda ? parsearMoneda(f[mapeo.moneda]) : null

      return {
        id_unico: `cont_${idx}`,
        origen: "contraparte" as const,
        fecha: parsearFecha(f[mapeo.fecha]),
        tipo_original: mapeo.tipo ? String(f[mapeo.tipo] ?? "").trim() : "",
        tipo_normalizado: null,
        regla_id: null,
        comprobante_raw: mapeo.comprobante
          ? String(f[mapeo.comprobante] ?? "").trim()
          : "",
        clave_calculada: null,
        importe_ars: importe,
        importe_usd: 0,
        moneda,
        descripcion: mapeo.descripcion
          ? String(f[mapeo.descripcion] ?? "").trim()
          : "",
        raw: f,
      }
    })
    .filter((m) => m.tipo_original !== "" || m.importe_ars !== 0)
}

// ============================================================
// Exportar resultado a Excel
// ============================================================

export type OpcionesExportacion = {
  papel?: import("@/types").PapelConciliacion | null
  contraparte?: string
  periodoLabel?: string
  firmadoPor?: string
  aprobadoPor?: string
  sociedad?: string
  cuentaInterna?: string
  fechaCreacion?: string
  estado?: string
  matchesAgrupados?: {
    tipo: string
    total_lado_n_ars: number
    importe_lado_1_ars: number
    diferencia_ars: number
    score_confianza: number
    movs_lado_n_detalle: { fecha: string; tipo: string; comprobante: string; importe: number }[]
    mov_lado_1_detalle?: { fecha: string; tipo: string; comprobante: string; importe: number }
  }[]
}

export function exportarResultadoExcel(
  resultado: import("@/types").ResultadoConciliacion,
  opciones: OpcionesExportacion = {}
): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Hoja resumen
  const resumen = resultado.resumen
  const papel = opciones.papel

  const resumenData: unknown[][] = [
    ["CONCILIACIÓN DE CUENTAS CORRIENTES"],
    [],
    ["Contraparte", opciones.contraparte ?? ""],
    ["Período", opciones.periodoLabel ?? ""],
    ["Sociedad", opciones.sociedad ?? ""],
    ["Cuenta interna", opciones.cuentaInterna ?? ""],
    ["Fecha", opciones.fechaCreacion ?? new Date().toISOString().slice(0, 10)],
    ["Estado", opciones.estado ?? ""],
    ["Conciliado por", opciones.firmadoPor ?? ""],
    ["Aprobado por", opciones.aprobadoPor ?? ""],
    [],
    ["RESUMEN"],
    ["Conciliados (exactos)", resumen.conciliados],
    ["Conciliados con dif. cambio", resumen.conciliados_dif_ars],
    ["Conciliados con dif. real", resumen.conciliados_dif_real],
    ["Pendientes compañía", resumen.pendientes_compania],
    ["Pendientes contraparte", resumen.pendientes_contraparte],
    ["Ajustes propios", resumen.ajustes_propios],
  ]

  if (papel) {
    resumenData.push(
      [],
      ["SALDOS"],
      ["", "USD", "ARS"],
      ["Saldo s/Compañía", papel.saldos.final_compania_usd, papel.saldos.final_compania_ars],
      ["Saldo s/Contraparte", papel.saldos.final_contraparte_usd, papel.saldos.final_contraparte_ars],
      ["Diferencia esperada", papel.diferencia_esperada_usd, papel.diferencia_esperada_ars],
      ["Diferencia explicada", papel.diferencia_explicada_usd, papel.diferencia_explicada_ars],
      ["Control (debe ser 0)", papel.diferencia_sin_explicar_usd, papel.diferencia_sin_explicar_ars],
    )
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
  wsResumen["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen")

  // Hoja movimientos por estado
  const movHeaders = ["Origen", "Fecha", "Tipo", "Comprobante", "Clave", "Importe ARS", "Importe USD", "Moneda", "Estado", "Match ID"]
  const movRows = resultado.movimientos.map(m => [
    m.origen,
    m.fecha?.toISOString().slice(0, 10) ?? "",
    m.tipo_original,
    m.comprobante_raw,
    m.clave_calculada ?? "",
    m.importe_ars,
    m.importe_usd,
    m.moneda ?? "",
    m.estado,
    m.match_id ?? "",
  ])

  const wsMovs = XLSX.utils.aoa_to_sheet([movHeaders, ...movRows])
  wsMovs["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 22 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsMovs, "Movimientos")

  // Hoja pendientes compañía
  const pendCmp = resultado.movimientos.filter(m => m.estado === "pendiente" && m.origen === "compania")
  if (pendCmp.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([movHeaders, ...pendCmp.map(m => [
      m.origen, m.fecha?.toISOString().slice(0, 10) ?? "", m.tipo_original, m.comprobante_raw,
      m.clave_calculada ?? "", m.importe_ars, m.importe_usd, m.moneda ?? "", m.estado, m.match_id ?? "",
    ])])
    ws["!cols"] = wsMovs["!cols"]
    XLSX.utils.book_append_sheet(wb, ws, "Pend. Compañía")
  }

  // Hoja pendientes contraparte
  const pendCont = resultado.movimientos.filter(m => m.estado === "pendiente" && m.origen === "contraparte")
  if (pendCont.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([movHeaders, ...pendCont.map(m => [
      m.origen, m.fecha?.toISOString().slice(0, 10) ?? "", m.tipo_original, m.comprobante_raw,
      m.clave_calculada ?? "", m.importe_ars, m.importe_usd, m.moneda ?? "", m.estado, m.match_id ?? "",
    ])])
    ws["!cols"] = wsMovs["!cols"]
    XLSX.utils.book_append_sheet(wb, ws, "Pend. Contraparte")
  }

  // Hoja matches agrupados
  if (opciones.matchesAgrupados && opciones.matchesAgrupados.length > 0) {
    const agrupadosData: unknown[][] = [
      ["MATCHES AGRUPADOS ACEPTADOS"],
      [],
      ["Tipo", "Total N (ARS)", "Importe 1 (ARS)", "Diferencia ARS", "Confianza %"],
    ]
    for (const ma of opciones.matchesAgrupados) {
      agrupadosData.push([ma.tipo, ma.total_lado_n_ars, ma.importe_lado_1_ars, ma.diferencia_ars, ma.score_confianza])
      agrupadosData.push(["  Comprobantes lado N:"])
      for (const m of ma.movs_lado_n_detalle) {
        agrupadosData.push(["  ", m.fecha, m.tipo, m.comprobante, m.importe])
      }
      if (ma.mov_lado_1_detalle) {
        agrupadosData.push(["  Lado 1:", ma.mov_lado_1_detalle.fecha, ma.mov_lado_1_detalle.tipo, ma.mov_lado_1_detalle.comprobante, ma.mov_lado_1_detalle.importe])
      }
      agrupadosData.push([])
    }
    const wsAgrup = XLSX.utils.aoa_to_sheet(agrupadosData)
    wsAgrup["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsAgrup, "Matches Agrupados")
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer
}

// ============================================================
// Info del archivo fuente (hash + metadata)
// ============================================================

export async function obtenerInfoArchivo(
  file: File,
  filasProcessadas: number
): Promise<{ nombre_archivo: string; tamanio_bytes: number; hash_sha256: string; filas_raw: number }> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")

  return {
    nombre_archivo: file.name,
    tamanio_bytes: file.size,
    hash_sha256: hash,
    filas_raw: filasProcessadas,
  }
}
