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
