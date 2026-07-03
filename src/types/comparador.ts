// ============================================================
// Tipos del módulo Comparador de Bases de Datos
// Reutiliza ConstructorClave del dominio de conciliación.
// ============================================================

import type { ConstructorClave } from "@/types"

/** Cómo interpretar los valores de una columna al comparar. */
export type TipoComparacion = "texto" | "numero" | "fecha"

/**
 * Homologación + configuración de una columna.
 * columna_origen → columna_destino define la equivalencia entre archivos.
 * comparar = false excluye la columna del análisis.
 */
export type ColumnaComparacion = {
  columna_origen: string
  columna_destino: string
  comparar: boolean
  tipo: TipoComparacion
  /** Solo tipo "numero": diferencia absoluta tolerada (default 0). */
  tolerancia?: number
  /** Solo tipo "texto": ignorar mayúsculas/minúsculas. */
  ignorar_mayusculas?: boolean
}

export type ConfigComparacion = {
  clave_origen: ConstructorClave
  clave_destino: ConstructorClave
  columnas: ColumnaComparacion[]
}

// ----- Resultado -----

export type DiferenciaColumna = {
  columna_origen: string
  columna_destino: string
  valor_origen: string
  valor_destino: string
}

export type FilaComparada = {
  clave: string
  fila_origen: Record<string, unknown>
  fila_destino: Record<string, unknown>
  /** Vacío = fila idéntica en las columnas analizadas. */
  diferencias: DiferenciaColumna[]
}

export type FilaSinMatch = {
  clave: string
  fila: Record<string, unknown>
}

export type ClaveDuplicada = {
  clave: string
  cantidad: number
}

export type ResumenComparacion = {
  total_origen: number
  total_destino: number
  sin_cambios: number
  con_diferencias: number
  solo_origen: number
  solo_destino: number
  sin_clave_origen: number
  sin_clave_destino: number
  columnas_analizadas: number
  total_diferencias_columna: number
}

export type ResultadoComparacion = {
  /** Filas con clave presente en ambos lados (con o sin diferencias). */
  matches: FilaComparada[]
  /** Filas de origen sin match en destino (incluye las que no pudieron construir clave). */
  solo_origen: FilaSinMatch[]
  /** Filas de destino sin match en origen (incluye las que no pudieron construir clave). */
  solo_destino: FilaSinMatch[]
  /** Claves repetidas dentro de cada archivo. Solo la primera ocurrencia participa del match. */
  duplicados_origen: ClaveDuplicada[]
  duplicados_destino: ClaveDuplicada[]
  resumen: ResumenComparacion
}
