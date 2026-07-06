// src/lib/errores.ts
//
// Traduce errores de Supabase/PostgREST a mensajes amigables en español.
// Objetivo: que ninguna operación falle en silencio y que el usuario vea
// un mensaje entendible en vez de un código de Postgres o nada.
//
// Uso típico con el toast:
//
//   const { error } = await supabase.from("sociedades").insert(...)
//   if (error) { toast.show(mensajeError(error, "No se pudo crear la sociedad"), "error"); return }
//
// El segundo argumento (fallback) es el mensaje base de contexto; se usa
// cuando el error no cae en ninguno de los casos conocidos.

// Forma mínima de un error de Supabase/PostgREST. No importamos el tipo de
// la librería para no acoplarnos a su versión; con estos campos alcanza.
type ErrorSupabase = {
  message?: string
  code?: string          // código SQLSTATE de Postgres (ej. "23505")
  details?: string
  hint?: string
} | null | undefined

// Mapa de códigos SQLSTATE de Postgres a mensajes en español.
// Referencia: https://www.postgresql.org/docs/current/errcodes-appendix.html
const MENSAJES_POR_CODIGO: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",          // unique_violation
  "23503": "No se puede completar: el registro está vinculado a otros datos.", // foreign_key_violation
  "23502": "Falta completar un campo obligatorio.",          // not_null_violation
  "23514": "Alguno de los valores ingresados no es válido.", // check_violation
  "42501": "No tenés permisos para realizar esta acción.",   // insufficient_privilege
  "P0001": "La operación fue rechazada por una regla del sistema.", // raise_exception
}

/**
 * Devuelve un mensaje amigable en español para un error de Supabase.
 *
 * @param error    El objeto error devuelto por Supabase (o cualquier Error).
 * @param fallback Mensaje base de contexto (ej. "No se pudo guardar la cuenta").
 *                 Se usa cuando no reconocemos el error puntual.
 */
export function mensajeError(error: ErrorSupabase | unknown, fallback = "Ocurrió un error. Intentá de nuevo."): string {
  if (!error) return fallback

  // Error nativo de JS (ej. un throw en un try/catch).
  if (error instanceof Error) {
    return traducirTexto(error.message) ?? fallback
  }

  // Objeto de error de Supabase.
  const e = error as ErrorSupabase
  if (!e) return fallback

  // 1. Por código SQLSTATE (lo más confiable).
  if (e.code && MENSAJES_POR_CODIGO[e.code]) {
    return MENSAJES_POR_CODIGO[e.code]
  }

  // 2. Por contenido del mensaje (para casos sin código claro).
  if (e.message) {
    const traducido = traducirTexto(e.message)
    if (traducido) return traducido
    // Si no lo reconocimos pero hay mensaje, lo mostramos con el contexto.
    return `${fallback} (${e.message})`
  }

  return fallback
}

// Reconoce patrones comunes en el texto del mensaje (case-insensitive) y
// devuelve una traducción, o null si no matchea nada conocido.
function traducirTexto(msg: string): string | null {
  const m = msg.toLowerCase()

  if (m.includes("duplicate key") || m.includes("unique")) {
    return "Ya existe un registro con esos datos."
  }
  if (m.includes("violates row-level security") || m.includes("row-level security") || m.includes("rls")) {
    return "No tenés permisos para realizar esta acción."
  }
  if (m.includes("violates foreign key") || m.includes("foreign key")) {
    return "No se puede completar: el registro está vinculado a otros datos."
  }
  if (m.includes("not-null") || m.includes("null value")) {
    return "Falta completar un campo obligatorio."
  }
  if (m.includes("jwt") || m.includes("token") || m.includes("expired")) {
    return "Tu sesión expiró. Volvé a iniciar sesión."
  }
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("fetch")) {
    return "Problema de conexión. Revisá tu internet e intentá de nuevo."
  }

  return null
}
