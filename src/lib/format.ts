/**
 * Formato de número con separadores argentinos (1.234.567,89)
 */
export function formatNum(n: number, decimales = 2): string {
  if (n === null || n === undefined || isNaN(n)) return "0,00"
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/**
 * Formato compacto: 1.5M, 23.4K, etc — para mostrar en cards/dashboards
 */
export function formatNumCompact(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return "0"
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${abs.toFixed(0)}`
}

/**
 * Parsea un input de usuario que puede venir como:
 *  - "-23.061.058.962,99" (formato AR)
 *  - "-23061058962.99" (formato US o pegado de Excel)
 *  - "-23,061,058,962.99" (US con miles)
 *  - "0,5" / "0.5" / "23K" no soportado
 */
export function parseNumInput(s: string): number {
  if (typeof s === "number") return s
  if (!s || s.trim() === "") return 0
  let t = s.trim()
  // Quitar espacios
  t = t.replace(/\s/g, "")
  // Si tiene tanto coma como punto, el último es el decimal
  const lastComma = t.lastIndexOf(",")
  const lastDot = t.lastIndexOf(".")
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // Formato AR: 1.234,56 → quitar puntos, coma → punto
      t = t.replace(/\./g, "").replace(",", ".")
    } else {
      // Formato US: 1,234.56 → quitar comas
      t = t.replace(/,/g, "")
    }
  } else if (lastComma >= 0) {
    // Solo coma: ambiguo. Si hay 3 cifras después, es separador miles. Si no, es decimal.
    const after = t.length - 1 - lastComma
    if (after === 3 && (t.match(/,/g) ?? []).length === 1) {
      // Probablemente miles US: "23,000"
      t = t.replace(/,/g, "")
    } else {
      // Decimal AR
      t = t.replace(/\./g, "").replace(",", ".")
    }
  }
  // Si solo punto: dejar tal cual
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

/**
 * Parser para inputs grandes con formato visual.
 * Devuelve string formateado para mostrar mientras escribís.
 */
export function formatNumInput(value: string): string {
  if (!value) return ""
  const num = parseNumInput(value)
  if (num === 0 && value !== "0" && value !== "-") return value
  return formatNum(num)
}

/**
 * Diferencia desde una fecha (ej: "hace 5 días", "hace 2 meses")
 */
export function diasDesde(fechaIso: string | null): number {
  if (!fechaIso) return 0
  const d = new Date(fechaIso)
  const ahora = new Date()
  return Math.floor((ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export function antiguedad(fechaIso: string | null): string {
  const dias = diasDesde(fechaIso)
  if (dias < 1) return "hoy"
  if (dias < 30) return `${dias} d`
  if (dias < 365) return `${Math.floor(dias / 30)} m`
  return `${Math.floor(dias / 365)} a`
}
