// ============================================================
// Tipos del dominio
// ============================================================

export type Empresa = {
  id: string
  nombre: string
  cuit?: string | null
}

export type Contraparte = {
  id: string
  empresa_id: string
  nombre: string
  cuit?: string | null
  tipo: "proveedor" | "cliente" | "ambos"
}

// ----- Mapeo de columnas (qué columna del Excel es qué cosa) -----
export type MapeoCompania = {
  fecha: string
  tipo: string
  comprobante: string
  sucursal?: string | null
  letra?: string | null
  importe_ars: string
  importe_usd?: string | null
  descripcion?: string | null
  moneda?: string | null
}

export type MapeoContraparte = {
  fecha: string
  tipo: string
  comprobante: string
  importe: string
  moneda?: string | null
  descripcion?: string | null
  importe_a_favor_cliente?: string | null
  importe_a_favor_contraparte?: string | null
}

// ----- Operaciones para construir clave -----
export type OperacionClave =
  | { op: "campo"; valor: string; padding?: number }
  | { op: "literal"; valor: string }
  | { op: "ultimos"; n: number }
  | { op: "primeros"; n: number }
  | { op: "regex"; patron: string; grupo?: number }
  | { op: "limpiar"; quitar?: string[] }

export type ConstructorClave =
  | { tipo: "visual"; operaciones: OperacionClave[] }
  | { tipo: "formula"; expresion: string }

// ----- Regla de match por par de tipos -----
export type ReglaTipo = {
  id: string
  label: string
  tipo_compania: string[]
  tipo_contraparte: string[]
  metodo_match: "clave" | "importe_fecha" | "manual"
  clave_compania?: ConstructorClave
  clave_contraparte?: ConstructorClave
  ventana_dias?: number                        // solo si metodo_match = "importe_fecha"
  tolerancia_importe_override?: number         // si se define, overridea config.tolerancia_importe para esta regla
  prioridad?: number                           // orden de evaluación; menor número = más prioridad. Default: 100
}

export type ConfigPlantilla = {
  tolerancia_importe: number
  moneda_separada: boolean
  ventana_dias_default: number
}

export type PlantillaProveedor = {
  id: string
  contraparte_id: string
  mapeo_compania: MapeoCompania
  mapeo_contraparte: MapeoContraparte
  reglas_tipos: ReglaTipo[]
  tipos_sin_contraparte_compania: string[]
  tipos_sin_contraparte_externa: string[]
  config: ConfigPlantilla
}

// ----- Movimiento normalizado (tras parsear y aplicar mapeo) -----
export type MovimientoNorm = {
  id_unico: string
  origen: "compania" | "contraparte"
  fecha: Date | null
  tipo_original: string
  tipo_normalizado: string | null
  regla_id: string | null
  comprobante_raw: string
  clave_calculada: string | null
  importe_ars: number
  importe_usd: number
  moneda: "ARS" | "USD" | null
  descripcion: string
  raw: Record<string, unknown>
}

// ----- Resultado de match -----
export type EstadoConciliacion =
  | "conciliado"
  | "conciliado_dif_ars"
  | "conciliado_dif_real"
  | "pendiente"
  | "ajuste_propio"
  | "tipo_no_clasificado"

export type MovimientoResultado = MovimientoNorm & {
  estado: EstadoConciliacion
  match_id: string | null
  diferencia_ars?: number
  diferencia_usd?: number
}

export type ResultadoConciliacion = {
  movimientos: MovimientoResultado[]
  resumen: {
    total_compania: number
    total_contraparte: number
    conciliados: number
    conciliados_dif_ars: number
    conciliados_dif_real: number
    pendientes_compania: number
    pendientes_contraparte: number
    ajustes_propios: number
    tipos_no_clasificados_compania: string[]
    tipos_no_clasificados_contraparte: string[]
    saldo_compania_ars: number
    saldo_contraparte_ars: number
    diferencia_final_ars: number
  }
}

// ============================================================
// MODELO V3: papel de conciliación contable completo
// ============================================================

export type StatusPendiente =
  | "posterior_msu"
  | "pendiente_msu"
  | "posterior_contraparte"
  | "no_contraparte"
  | "arrastre"
  | "sin_clasificar"

export const STATUS_LABELS: Record<StatusPendiente, string> = {
  posterior_msu: "Posterior por MSU",
  pendiente_msu: "Pendiente de contabilizar MSU",
  posterior_contraparte: "Posterior por contraparte",
  no_contraparte: "No contabilizado por contraparte",
  arrastre: "Arrastre de meses anteriores",
  sin_clasificar: "Sin clasificar",
}

export type SaldosBilaterales = {
  inicial_compania_ars: number
  inicial_compania_usd: number
  inicial_contraparte_ars: number
  inicial_contraparte_usd: number
  final_compania_ars: number
  final_compania_usd: number
  final_contraparte_ars: number
  final_contraparte_usd: number
  tc_cierre: number
}

export type AjusteManual = {
  id: string
  fecha: string
  concepto: string
  comprobante?: string
  importe_ars: number
  importe_usd: number
}

export type ClasificacionPendientes = Record<string, StatusPendiente>

export type ComposicionDiferencia = {
  posterior_msu: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  pendiente_msu: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  posterior_contraparte: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  no_contraparte: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  ajustes: { ajustes: AjusteManual[]; total_ars: number; total_usd: number }
  sin_clasificar: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  total_ars: number
  total_usd: number
}

export type PapelConciliacion = {
  saldos: SaldosBilaterales
  diferencia_esperada_ars: number
  diferencia_esperada_usd: number
  diferencia_explicada_ars: number
  diferencia_explicada_usd: number
  diferencia_sin_explicar_ars: number
  diferencia_sin_explicar_usd: number
  composicion: ComposicionDiferencia
}
