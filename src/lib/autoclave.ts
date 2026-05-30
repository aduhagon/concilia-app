// src/lib/autoclave.ts
//
// Etapa 3 del pipeline de autoconfig: construccion automatica de clave.
//
// Para una regla con metodo_match "clave", el LLM NO adivina como armar la
// clave. En su lugar generamos un conjunto acotado de candidatos de
// ConstructorClave y los probamos contra las filas reales de la muestra,
// quedandonos con el par (compania x contraparte) que MAXIMIZA coincidencias.
//
// Reusa construirClave del motor, asi las claves que medimos aca son
// identicas a las que el motor calculara despues al conciliar.

import type { ConstructorClave, OperacionClave, MapeoCompania, MapeoContraparte } from "@/types"
import { construirClave } from "./constructor-clave"

// ----------------------------------------------------------------
// Generacion de candidatos
// ----------------------------------------------------------------

// Genera candidatos de ConstructorClave para un lado, a partir de los
// nombres de columna disponibles en el mapeo.
//
// colComprobante: nombre de la columna de comprobante (obligatoria para clave)
// colsExtra: columnas opcionales que pueden formar parte de la clave
//            (en compania: sucursal, letra). Pueden venir vacias.
function generarCandidatos(
  colComprobante: string,
  colsExtra: { sucursal?: string; letra?: string } = {}
): { label: string; constructor: ConstructorClave }[] {
  if (!colComprobante) return []

  const cand: { label: string; constructor: ConstructorClave }[] = []
  const visual = (ops: OperacionClave[]): ConstructorClave => ({ tipo: "visual", operaciones: ops })

  // 1. Comprobante tal cual
  cand.push({
    label: "comprobante",
    constructor: visual([{ op: "campo", valor: colComprobante }]),
  })

  // 2. Comprobante limpio (sin guiones, espacios, puntos, barras)
  cand.push({
    label: "comprobante limpio",
    constructor: visual([{ op: "campo", valor: colComprobante }, { op: "limpiar" }]),
  })

  // 3. Comprobante limpio + ultimos N digitos (los formatos mas comunes)
  for (const n of [6, 8, 10]) {
    cand.push({
      label: `ultimos ${n} de comprobante limpio`,
      constructor: visual([
        { op: "campo", valor: colComprobante },
        { op: "limpiar" },
        { op: "ultimos", n },
      ]),
    })
  }

  // 4. Solo los digitos del comprobante (regex), con y sin padding
  cand.push({
    label: "digitos de comprobante",
    constructor: visual([
      { op: "campo", valor: colComprobante },
      { op: "regex", patron: "\\d+" },
    ]),
  })
  cand.push({
    label: "ultimos 8 de los digitos",
    constructor: visual([
      { op: "campo", valor: colComprobante },
      { op: "regex", patron: "\\d+" },
      { op: "ultimos", n: 8 },
    ]),
  })

  // 5. Sucursal + comprobante con padding (caso liquidaciones / facturas A)
  if (colsExtra.sucursal) {
    cand.push({
      label: "sucursal(4) + comprobante(8)",
      constructor: visual([
        { op: "campo", valor: colsExtra.sucursal, padding: 4 },
        { op: "campo", valor: colComprobante, padding: 8 },
      ]),
    })
  }

  return cand
}

// ----------------------------------------------------------------
// Evaluacion: probar un par de candidatos contra las filas reales
// ----------------------------------------------------------------

// Calcula cuantas claves coinciden entre los dos lados para un par de
// constructores dado. Devuelve el conteo de claves de compania que
// encuentran al menos una coincidencia en contraparte.
function contarCoincidencias(
  filasCmp: Record<string, unknown>[],
  filasCont: Record<string, unknown>[],
  ctorCmp: ConstructorClave,
  ctorCont: ConstructorClave
): number {
  // Set de claves de contraparte (no vacias)
  const clavesCont = new Set<string>()
  for (const f of filasCont) {
    const k = construirClave(f, ctorCont)
    if (k) clavesCont.add(k)
  }
  if (clavesCont.size === 0) return 0

  let coincidencias = 0
  for (const f of filasCmp) {
    const k = construirClave(f, ctorCmp)
    if (k && clavesCont.has(k)) coincidencias++
  }
  return coincidencias
}

// ----------------------------------------------------------------
// Funcion publica: encontrar el mejor par de claves para una regla
// ----------------------------------------------------------------

export type ResultadoAutoclave = {
  clave_compania: ConstructorClave
  clave_contraparte: ConstructorClave
  coincidencias: number
  base: number          // sobre cuantas filas de compania se midio
  porcentaje: number    // coincidencias / base (0-100)
  label_compania: string
  label_contraparte: string
}

// Para una regla de tipo "clave", busca el mejor par de constructores.
//
// filasCmp / filasCont: filas de muestra YA filtradas a los tipos de esta
//   regla (solo los movimientos que la regla cubre). Si no las filtras, igual
//   funciona pero el porcentaje es menos representativo.
// mapeoCmp / mapeoCont: para saber que columnas usar.
//
// Devuelve null si no hay columna de comprobante o no se pudo medir nada.
export function buscarMejorClave(
  filasCmp: Record<string, unknown>[],
  filasCont: Record<string, unknown>[],
  mapeoCmp: MapeoCompania,
  mapeoCont: MapeoContraparte
): ResultadoAutoclave | null {
  const candCmp = generarCandidatos(mapeoCmp.comprobante, {
    sucursal: mapeoCmp.sucursal ?? undefined,
    letra: mapeoCmp.letra ?? undefined,
  })
  const candCont = generarCandidatos(mapeoCont.comprobante)

  if (candCmp.length === 0 || candCont.length === 0) return null
  if (filasCmp.length === 0 || filasCont.length === 0) return null

  let mejor: ResultadoAutoclave | null = null

  for (const cc of candCmp) {
    for (const ck of candCont) {
      const coincidencias = contarCoincidencias(
        filasCmp, filasCont, cc.constructor, ck.constructor
      )
      const base = filasCmp.length
      const porcentaje = base > 0 ? (coincidencias / base) * 100 : 0

      if (!mejor || coincidencias > mejor.coincidencias) {
        mejor = {
          clave_compania: cc.constructor,
          clave_contraparte: ck.constructor,
          coincidencias,
          base,
          porcentaje,
          label_compania: cc.label,
          label_contraparte: ck.label,
        }
      }
    }
  }

  // Si el mejor par no logro ninguna coincidencia, no vale la pena devolverlo:
  // la regla queda sin clave para que el humano la arme a mano.
  if (mejor && mejor.coincidencias === 0) return null

  return mejor
}

// ----------------------------------------------------------------
// Helper: filtrar filas por los tipos de una regla
// ----------------------------------------------------------------

// Devuelve solo las filas cuyo tipo (columna colTipo) empieza con alguno
// de los tipos de la regla. Replica el criterio startsWith del motor.
export function filtrarFilasPorTipos(
  filas: Record<string, unknown>[],
  colTipo: string,
  tipos: string[]
): Record<string, unknown>[] {
  if (!colTipo || tipos.length === 0) return []
  const tiposUp = tipos.map((t) => t.toUpperCase())
  return filas.filter((f) => {
    const v = f[colTipo]
    if (v === null || v === undefined) return false
    const tipoUp = String(v).toUpperCase().trim()
    return tiposUp.some((t) => tipoUp.startsWith(t))
  })
}
