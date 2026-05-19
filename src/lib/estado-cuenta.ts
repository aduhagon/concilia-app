// Tipos de estado de una cuenta corriente.
// Usados en home (operativo), supervisor y cualquier vista futura.
export type EstadoCuenta = "conciliada" | "pendiente" | "vencida" | "sin_iniciar"

export type InputEstadoCuenta = {
  ultima_conciliacion: string | null  // ISO datetime de la última conciliación
  prox_conciliacion: string | null    // ISO datetime de la próxima vencimiento
  categoria: string | null            // A, B, C, D, E, F
}

/**
 * Calcula el estado de una cuenta corriente según sus fechas y categoría.
 *
 * Reglas (en orden de precedencia):
 * 1. Sin última conciliación → sin_iniciar
 * 2. Última conciliación dentro del mes en curso → conciliada
 * 3. Con próxima fecha vencida → vencida
 * 4. Con próxima fecha futura → pendiente
 * 5. Categorías E/F sin fecha → pendiente (son manuales)
 * 6. Resto (A, B, C, D sin fecha) → vencida
 */
export function calcularEstado(cuenta: InputEstadoCuenta): EstadoCuenta {
  if (!cuenta.ultima_conciliacion) return "sin_iniciar"

  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const ultimaFecha = new Date(cuenta.ultima_conciliacion)

  if (ultimaFecha >= inicioMes) return "conciliada"

  if (cuenta.prox_conciliacion) {
    return new Date(cuenta.prox_conciliacion) < hoy ? "vencida" : "pendiente"
  }

  if (cuenta.categoria === "E" || cuenta.categoria === "F") return "pendiente"

  return "vencida"
}

/**
 * Calcula si una cuenta categoría A tiene alerta semanal activa.
 * La alerta se activa cuando prox_alerta ya pasó.
 */
export function tieneAlertaSemanal(categoria: string | null, proxAlerta: string | null): boolean {
  if (categoria !== "A" || !proxAlerta) return false
  return new Date(proxAlerta) <= new Date()
}

/**
 * Orden de urgencia para ordenar listas de cuentas.
 * Menor número = más urgente.
 */
export const ORDEN_URGENCIA: Record<EstadoCuenta, number> = {
  vencida:     0,
  pendiente:   2,
  sin_iniciar: 3,
  conciliada:  4,
}

/**
 * Compara dos cuentas por urgencia, poniendo alertas semanales
 * justo después de las vencidas (posición 1).
 */
export function compararUrgencia(
  a: { estado: EstadoCuenta; alerta_semanal: boolean },
  b: { estado: EstadoCuenta; alerta_semanal: boolean }
): number {
  const ordenA = a.alerta_semanal && a.estado !== "vencida" ? 1 : ORDEN_URGENCIA[a.estado]
  const ordenB = b.alerta_semanal && b.estado !== "vencida" ? 1 : ORDEN_URGENCIA[b.estado]
  return ordenA - ordenB
}
