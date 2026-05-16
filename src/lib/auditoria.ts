/**
 * lib/auditoria.ts
 * 
 * Módulo de auditoría central.
 * Uso: await registrar(supabase, { accion: "conciliacion_estado", ... })
 * 
 * Siempre resuelve sin tirar error — un fallo de log nunca debe
 * cortar el flujo principal de la app.
 */

import { SupabaseClient } from "@supabase/supabase-js"

export type AccionAuditoria =
  | "login"
  | "logout"
  | "conciliacion_creada"
  | "conciliacion_estado"
  | "conciliacion_exportada"
  | "match_manual"
  | "match_anulado"
  | "plantilla_creada"
  | "plantilla_modificada"
  | "ajuste_creado"
  | "ajuste_eliminado"

export interface RegistroAuditoria {
  accion: AccionAuditoria
  tabla_afectada?: string
  registro_id?: string
  valor_anterior?: Record<string, unknown> | null
  valor_nuevo?: Record<string, unknown> | null
  observacion?: string
}

/**
 * Registra una acción en la tabla `auditoria`.
 * Obtiene usuario y email del cliente de Supabase activo.
 * Nunca lanza excepción — los errores se loguean en consola.
 */
export async function registrar(
  supabase: SupabaseClient,
  registro: RegistroAuditoria
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from("auditoria").insert({
      usuario_id:     user?.id ?? null,
      usuario_email:  user?.email ?? null,
      accion:         registro.accion,
      tabla_afectada: registro.tabla_afectada ?? null,
      registro_id:    registro.registro_id ?? null,
      valor_anterior: registro.valor_anterior ?? null,
      valor_nuevo:    registro.valor_nuevo ?? null,
      observacion:    registro.observacion ?? null,
    })
  } catch (err) {
    // El log nunca debe interrumpir el flujo principal
    console.error("[auditoria] Error al registrar:", err)
  }
}
