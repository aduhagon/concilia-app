// ============================================================
// Motor de comparación de bases de datos (origen vs destino)
//
// Función pura: recibe las filas crudas de ambos archivos y una
// ConfigComparacion, devuelve un ResultadoComparacion.
// Reutiliza construirClave() del módulo de conciliación.
//
// Reglas de matching:
//  - Se construye la clave de cada fila con su ConstructorClave.
//  - Filas sin clave (clave vacía) no pueden matchear: van a
//    solo_origen / solo_destino y se cuentan en sin_clave_*.
//  - Claves duplicadas: solo la PRIMERA ocurrencia de cada clave
//    participa del match; las repeticiones se reportan en
//    duplicados_origen / duplicados_destino como warning.
// ============================================================

import { construirClave } from "@/lib/constructor-clave"
import type {
  ColumnaComparacion,
  ConfigComparacion,
  DiferenciaColumna,
  FilaComparada,
  FilaSinMatch,
  ResultadoComparacion,
} from "@/types/comparador"

// ------------------------------------------------------------
// Normalización de valores
// ------------------------------------------------------------

/** Representación de un valor para mostrar en pantalla / exportar. */
export function valorAMostrar(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return String(v)
  return String(v).trim()
}

/**
 * Parsea un número aceptando formato AR ("1.234,56"), US ("1234.56")
 * y números nativos de Excel. Devuelve null si no es interpretable.
 */
export function parsearNumeroComparacion(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  let s = String(v).trim()
  if (s === "") return null
  // Signo negativo con paréntesis contable: (1.234,56)
  let negativo = false
  const par = s.match(/^\((.+)\)$/)
  if (par) {
    negativo = true
    s = par[1]
  }
  if (s.includes(",")) {
    // Formato AR: puntos de miles, coma decimal
    s = s.replace(/\./g, "").replace(",", ".")
  }
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negativo ? -n : n
}

/**
 * Parsea una fecha a "yyyy-mm-dd". Acepta:
 *  - serial de Excel (número)
 *  - dd/mm/yyyy, dd-mm-yyyy (con año de 2 o 4 dígitos)
 *  - yyyy-mm-dd (ISO)
 * Devuelve null si no es interpretable.
 */
export function parsearFechaComparacion(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null

  if (typeof v === "number") {
    // Serial de Excel (época 1900). 25569 = 1970-01-01
    if (v < 20000 || v > 80000) return null // fuera de rango razonable de fechas
    const ms = Math.round((v - 25569) * 86400000)
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }

  if (typeof v === "string") {
    const s = v.trim()
    const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (ddmm) {
      const [, d, m, y] = ddmm
      const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y)
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (iso) {
      const [, y, m, d] = iso
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }
  }

  return null
}

/**
 * Compara dos valores según la configuración de la columna.
 * Devuelve true si se consideran IGUALES.
 */
export function valoresIguales(
  valorOrigen: unknown,
  valorDestino: unknown,
  col: ColumnaComparacion
): boolean {
  if (col.tipo === "numero") {
    const no = parsearNumeroComparacion(valorOrigen)
    const nd = parsearNumeroComparacion(valorDestino)
    if (no !== null && nd !== null) {
      const tolerancia = col.tolerancia ?? 0
      return Math.abs(no - nd) <= tolerancia + 1e-9
    }
    // Si alguno no es numérico, cae a comparación de texto
  }

  if (col.tipo === "fecha") {
    const fo = parsearFechaComparacion(valorOrigen)
    const fd = parsearFechaComparacion(valorDestino)
    if (fo !== null && fd !== null) return fo === fd
    // Si alguno no es fecha, cae a comparación de texto
  }

  let so = valorAMostrar(valorOrigen)
  let sd = valorAMostrar(valorDestino)
  if (col.tipo === "texto" && col.ignorar_mayusculas) {
    so = so.toLowerCase()
    sd = sd.toLowerCase()
  }
  return so === sd
}

// ------------------------------------------------------------
// Motor principal
// ------------------------------------------------------------

export function compararBases(
  filasOrigen: Record<string, unknown>[],
  filasDestino: Record<string, unknown>[],
  config: ConfigComparacion
): ResultadoComparacion {
  const columnasActivas = config.columnas.filter(
    (c) => c.comparar && c.columna_origen !== "" && c.columna_destino !== ""
  )

  // --- Indexar destino por clave (primera ocurrencia gana) ---
  const indiceDestino = new Map<
    string,
    { fila: Record<string, unknown>; usado: boolean }
  >()
  const conteoDestino = new Map<string, number>()
  const soloDestino: FilaSinMatch[] = []
  let sinClaveDestino = 0

  for (const fila of filasDestino) {
    const clave = construirClave(fila, config.clave_destino)
    if (clave === "") {
      sinClaveDestino++
      soloDestino.push({ clave: "", fila })
      continue
    }
    conteoDestino.set(clave, (conteoDestino.get(clave) ?? 0) + 1)
    if (!indiceDestino.has(clave)) {
      indiceDestino.set(clave, { fila, usado: false })
    }
  }

  // --- Recorrer origen ---
  const matches: FilaComparada[] = []
  const soloOrigen: FilaSinMatch[] = []
  const conteoOrigen = new Map<string, number>()
  let sinClaveOrigen = 0

  for (const fila of filasOrigen) {
    const clave = construirClave(fila, config.clave_origen)
    if (clave === "") {
      sinClaveOrigen++
      soloOrigen.push({ clave: "", fila })
      continue
    }
    conteoOrigen.set(clave, (conteoOrigen.get(clave) ?? 0) + 1)

    const entrada = indiceDestino.get(clave)
    if (!entrada || entrada.usado) {
      // Sin match, o la clave ya fue consumida por una fila anterior (duplicado)
      soloOrigen.push({ clave, fila })
      continue
    }

    entrada.usado = true
    const diferencias: DiferenciaColumna[] = []
    for (const col of columnasActivas) {
      const vo = fila[col.columna_origen]
      const vd = entrada.fila[col.columna_destino]
      if (!valoresIguales(vo, vd, col)) {
        diferencias.push({
          columna_origen: col.columna_origen,
          columna_destino: col.columna_destino,
          valor_origen: valorAMostrar(vo),
          valor_destino: valorAMostrar(vd),
        })
      }
    }
    matches.push({ clave, fila_origen: fila, fila_destino: entrada.fila, diferencias })
  }

  // --- Filas de destino que quedaron sin consumir ---
  for (const [clave, entrada] of indiceDestino) {
    if (!entrada.usado) {
      soloDestino.push({ clave, fila: entrada.fila })
    }
  }

  // --- Duplicados ---
  const duplicadosOrigen = [...conteoOrigen.entries()]
    .filter(([, n]) => n > 1)
    .map(([clave, cantidad]) => ({ clave, cantidad }))
  const duplicadosDestino = [...conteoDestino.entries()]
    .filter(([, n]) => n > 1)
    .map(([clave, cantidad]) => ({ clave, cantidad }))

  const conDiferencias = matches.filter((m) => m.diferencias.length > 0)

  return {
    matches,
    solo_origen: soloOrigen,
    solo_destino: soloDestino,
    duplicados_origen: duplicadosOrigen,
    duplicados_destino: duplicadosDestino,
    resumen: {
      total_origen: filasOrigen.length,
      total_destino: filasDestino.length,
      sin_cambios: matches.length - conDiferencias.length,
      con_diferencias: conDiferencias.length,
      solo_origen: soloOrigen.length,
      solo_destino: soloDestino.length,
      sin_clave_origen: sinClaveOrigen,
      sin_clave_destino: sinClaveDestino,
      columnas_analizadas: columnasActivas.length,
      total_diferencias_columna: conDiferencias.reduce(
        (acc, m) => acc + m.diferencias.length,
        0
      ),
    },
  }
}

// ------------------------------------------------------------
// Homologación automática de columnas
// ------------------------------------------------------------

/** Normaliza un nombre de columna para el auto-match: minúsculas, sin acentos ni separadores. */
function normalizarNombre(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-./]/g, "")
}

/** Heurística simple para sugerir el tipo de comparación según un valor de muestra. */
export function sugerirTipo(valorMuestra: unknown): "texto" | "numero" | "fecha" {
  if (typeof valorMuestra === "number") {
    // Los seriales de fecha de Excel caen en este rango
    if (valorMuestra > 20000 && valorMuestra < 80000 && Number.isInteger(valorMuestra)) {
      return "fecha"
    }
    return "numero"
  }
  if (typeof valorMuestra === "string") {
    const s = valorMuestra.trim()
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return "fecha"
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "fecha"
    if (/^\(?-?[\d.,]+\)?$/.test(s) && /\d/.test(s)) return "numero"
  }
  return "texto"
}

/**
 * Genera la homologación inicial: por cada columna de origen busca la
 * columna de destino con el mismo nombre normalizado. Si no hay match,
 * la deja sin destino y desmarcada.
 */
export function homologarColumnas(
  columnasOrigen: string[],
  columnasDestino: string[],
  filaMuestraOrigen?: Record<string, unknown>
): ColumnaComparacion[] {
  const indice = new Map<string, string>()
  for (const cd of columnasDestino) {
    const norm = normalizarNombre(cd)
    if (!indice.has(norm)) indice.set(norm, cd)
  }

  return columnasOrigen.map((co) => {
    const destino = indice.get(normalizarNombre(co)) ?? ""
    const tipo = filaMuestraOrigen ? sugerirTipo(filaMuestraOrigen[co]) : "texto"
    return {
      columna_origen: co,
      columna_destino: destino,
      comparar: destino !== "",
      tipo,
      tolerancia: tipo === "numero" ? 0 : undefined,
    }
  })
}
