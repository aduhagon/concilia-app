import type { ConstructorClave, OperacionClave } from "@/types"

/**
 * Aplica un constructor de clave sobre una fila normalizada.
 * Devuelve la clave como string, o "" si no se pudo construir.
 *
 * El constructor se evalúa así:
 *  - Las operaciones "campo" y "literal" PRODUCEN texto y se concatenan en orden.
 *  - Las operaciones "ultimos", "primeros", "limpiar" y "regex" SE APLICAN
 *    sobre el texto acumulado hasta ese momento (transformaciones).
 *
 * Esto permite expresar, por ejemplo:
 *  [ {campo:"sucursal",padding:4}, {campo:"comprobante",padding:8} ]
 *    → "3301" + "30059579" = "330130059579"
 *
 *  [ {campo:"comprobante"}, {ultimos:6} ]
 *    → "096012025219590" → "219590"
 */
export function construirClave(
  fila: Record<string, unknown>,
  constructor: ConstructorClave | undefined
): string {
  if (!constructor) return ""

  if (constructor.tipo === "formula") {
    // Reservado para fase 2 (fórmula tipo Excel).
    // Por ahora devolvemos vacío para no romper.
    return ""
  }

  let acumulado = ""

  for (const op of constructor.operaciones) {
    acumulado = aplicarOperacion(acumulado, op, fila)
    if (acumulado === null) return ""
  }

  return acumulado.trim()
}

function aplicarOperacion(
  acum: string,
  op: OperacionClave,
  fila: Record<string, unknown>
): string {
  switch (op.op) {
    case "campo": {
      let valor = limpiarValor(fila[op.valor])
      if (op.padding && op.padding > 0) {
        valor = valor.padStart(op.padding, "0")
      }
      return acum + valor
    }
    case "literal":
      return acum + op.valor

    case "ultimos":
      return acum.length <= op.n ? acum : acum.slice(-op.n)

    case "primeros":
      return acum.length <= op.n ? acum : acum.slice(0, op.n)

    case "limpiar": {
      const aQuitar = op.quitar ?? ["-", " ", ".", "/"]
      let s = acum
      for (const ch of aQuitar) {
        s = s.split(ch).join("")
      }
      return s
    }

    case "regex": {
      try {
        const re = new RegExp(op.patron)
        const m = acum.match(re)
        if (!m) return ""
        const grupo = op.grupo ?? 0
        return m[grupo] ?? ""
      } catch {
        return acum
      }
    }
  }
}

/**
 * Convierte un valor de Excel a string limpio.
 * - Números enteros vienen como float (3301.0) → los normaliza a "3301"
 * - null/undefined → ""
 * - El resto: trim
 */
function limpiarValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return ""
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(v)
  }
  return String(v).trim()
}

/**
 * Versión "preview" para la UI: aplica el constructor sobre una fila de muestra
 * y devuelve también el detalle paso a paso para mostrar en el editor.
 */
export function previewClave(
  fila: Record<string, unknown>,
  constructor: ConstructorClave | undefined
): { resultado: string; pasos: { op: string; salida: string }[] } {
  if (!constructor || constructor.tipo === "formula") {
    return { resultado: "", pasos: [] }
  }

  const pasos: { op: string; salida: string }[] = []
  let acum = ""

  for (const op of constructor.operaciones) {
    acum = aplicarOperacion(acum, op, fila)
    pasos.push({ op: describirOp(op), salida: acum })
  }

  return { resultado: acum, pasos }
}

function describirOp(op: OperacionClave): string {
  switch (op.op) {
    case "campo":
      return op.padding ? `campo "${op.valor}" (pad ${op.padding})` : `campo "${op.valor}"`
    case "literal":
      return `literal "${op.valor}"`
    case "ultimos":
      return `últimos ${op.n}`
    case "primeros":
      return `primeros ${op.n}`
    case "limpiar":
      return `limpiar (${(op.quitar ?? ["-", " ", ".", "/"]).join(" ")})`
    case "regex":
      return `regex /${op.patron}/`
  }
}
