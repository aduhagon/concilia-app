// ============================================================
// Lectura de archivos para el Comparador de Bases.
//
// Hoy soporta: .xlsx, .xls, .csv, .txt (delimitado por tab/;/,)
// SheetJS detecta automáticamente el formato a partir del buffer,
// así que Excel y texto delimitado pasan por el mismo camino.
//
// Para agregar formatos nuevos (ej: ancho fijo, JSON) alcanza con
// sumar un case en leerArchivoComparacion sin tocar el motor.
// ============================================================

import * as XLSX from "xlsx"

export type ArchivoParseado = {
  nombre: string
  columnas: string[]
  filas: Record<string, unknown>[]
}

export const EXTENSIONES_SOPORTADAS = ["xlsx", "xls", "csv", "txt"] as const

export function extensionDe(nombre: string): string {
  const idx = nombre.lastIndexOf(".")
  return idx === -1 ? "" : nombre.slice(idx + 1).toLowerCase()
}

export function extensionSoportada(nombre: string): boolean {
  return (EXTENSIONES_SOPORTADAS as readonly string[]).includes(extensionDe(nombre))
}

/**
 * Lee un archivo y devuelve columnas + filas crudas.
 * Usa la primera hoja en el caso de Excel.
 * Lanza Error con mensaje amigable si el formato no es soportado
 * o el archivo está vacío.
 */
export async function leerArchivoComparacion(file: File): Promise<ArchivoParseado> {
  if (!extensionSoportada(file.name)) {
    throw new Error(
      `Formato no soportado: "${extensionDe(file.name) || file.name}". ` +
        `Formatos aceptados: ${EXTENSIONES_SOPORTADAS.join(", ")}.`
    )
  }

  const buffer = await file.arrayBuffer()
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: false })
  } catch {
    throw new Error(`No se pudo leer "${file.name}". Verificá que el archivo no esté dañado.`)
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) {
    throw new Error(`"${file.name}" no tiene hojas con datos.`)
  }

  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  })

  if (filas.length === 0) {
    throw new Error(`"${file.name}" no tiene filas de datos (solo encabezados o vacío).`)
  }

  return {
    nombre: file.name,
    columnas: Object.keys(filas[0]),
    filas,
  }
}
