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
  tipo: string                 // ej. "denominacion"
  comprobante: string          // ej. "numero_comprobante"
  sucursal?: string | null     // ej. "sucursal_comprobante" (opcional)
  letra?: string | null        // ej. "letra"
  importe_ars: string          // ej. "importe_pesos"
  importe_usd?: string | null  // ej. "importe_dolar"
  descripcion?: string | null
  moneda?: string | null       // si la moneda viene en una columna
}

export type MapeoContraparte = {
  fecha: string
  tipo: string                 // ej. "Tipo Documento"
  comprobante: string          // ej. "Nro Legal del Documento"
  importe: string              // ej. "importe"
  moneda?: string | null       // ej. "Moneda Original Doc."
  descripcion?: string | null
  // campos opcionales que algunos proveedores traen
  importe_a_favor_cliente?: string | null
  importe_a_favor_contraparte?: string | null
}

// ----- Operaciones para construir clave -----
// El editor visual permite elegir entre estas operaciones, en orden.
export type OperacionClave =
  | { op: "campo"; valor: string; padding?: number }                        // tomar el contenido de un campo (con padding opcional)
  | { op: "literal"; valor: string }                                        // texto fijo
  | { op: "ultimos"; n: number }                                            // se aplica al resultado acumulado
  | { op: "primeros"; n: number }
  | { op: "regex"; patron: string; grupo?: number }                         // extrae con regex, grupo 0 = todo el match
  | { op: "limpiar"; quitar?: string[] }                                    // quita caracteres como "-", " ", etc.

export type ConstructorClave =
  | { tipo: "visual"; operaciones: OperacionClave[] }
  | { tipo: "formula"; expresion: string }                                  // futuro: fórmula tipo Excel

// ----- Regla de match por par de tipos -----
export type ReglaTipo = {
  id: string                                                                // identificador interno (slug)
  label: string                                                             // nombre legible: "Liquidaciones de granos"
  tipo_compania: string[]                                                   // tipos de mi lado que entran acá
  tipo_contraparte: string[]                                                // tipos del proveedor que entran acá
  metodo_match: "clave" | "importe_fecha" | "manual"
  clave_compania?: ConstructorClave
  clave_contraparte?: ConstructorClave
  ventana_dias?: number                                                     // solo si metodo_match = "importe_fecha"
}

export type ConfigPlantilla = {
  tolerancia_importe: number                                                // diferencia aceptable en pesos para considerar match exacto
  moneda_separada: boolean                                                  // si true, ARS y USD se concilian por separado
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
  tipo_normalizado: string | null    // qué regla matchea su tipo (id de regla)
  regla_id: string | null
  comprobante_raw: string
  clave_calculada: string | null
  importe_ars: number
  importe_usd: number
  moneda: "ARS" | "USD" | null
  descripcion: string
  raw: Record<string, unknown>       // fila original para debug
}

// ----- Resultado de match -----
export type EstadoConciliacion =
  | "conciliado"           // match perfecto: clave + importe (en moneda original) coincide
  | "conciliado_dif_ars"   // match por clave, importe USD coincide pero ARS no (diferencia de cambio típica)
  | "conciliado_dif_real"  // match por clave pero los importes no coinciden en ninguna moneda
  | "pendiente"            // no encontró contraparte
  | "ajuste_propio"        // tipo declarado como "sin contraparte"
  | "tipo_no_clasificado"  // tipo no aparece en ninguna regla

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

// Status de un pendiente (tomados del Excel real del usuario)
export type StatusPendiente =
  | "posterior_msu"          // Compañía: contabilizado en mes posterior por MSU
  | "pendiente_msu"          // Contraparte: pendiente de contabilizar por MSU
  | "posterior_contraparte"  // Contraparte: contabilizado por contraparte en mes posterior
  | "no_contraparte"         // Compañía: no contabilizado por contraparte
  | "arrastre"               // viene arrastrándose de meses anteriores
  | "sin_clasificar"         // todavía no se le asignó status

export const STATUS_LABELS: Record<StatusPendiente, string> = {
  posterior_msu: "Posterior por MSU",
  pendiente_msu: "Pendiente de contabilizar MSU",
  posterior_contraparte: "Posterior por contraparte",
  no_contraparte: "No contabilizado por contraparte",
  arrastre: "Arrastre de meses anteriores",
  sin_clasificar: "Sin clasificar",
}

// Saldos completos en ambas monedas (para los dos lados, inicial y final)
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

// Ajuste manual del contador
export type AjusteManual = {
  id: string
  fecha: string                  // ISO date (YYYY-MM-DD)
  concepto: string               // ej. "Error Cargill -retencion sobre liq anulada-3301-29703364"
  comprobante?: string           // opcional
  importe_ars: number
  importe_usd: number
}

// Clasificación de pendientes: mapa id_movimiento → status
export type ClasificacionPendientes = Record<string, StatusPendiente>

// Composición de la diferencia (las 5 categorías + ajustes)
export type ComposicionDiferencia = {
  // Categoría 1: Comprobantes contabilizados por MSU con fecha posterior
  posterior_msu: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  // Categoría 2: Comprobantes pendientes de contabilizar por MSU
  pendiente_msu: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  // Categoría 3: Comprobantes contabilizados por contraparte con fecha posterior
  posterior_contraparte: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  // Categoría 4: Comprobantes no contabilizados por contraparte
  no_contraparte: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  // Categoría 5: Ajustes manuales
  ajustes: { ajustes: AjusteManual[]; total_ars: number; total_usd: number }
  // Sin clasificar: pendientes que el usuario todavía no clasificó
  sin_clasificar: { movimientos: MovimientoResultado[]; total_ars: number; total_usd: number }
  // Total general
  total_ars: number
  total_usd: number
}

// Resultado de Conciliación V3 (con todo el papel)
export type PapelConciliacion = {
  // Saldos
  saldos: SaldosBilaterales
  // Diferencia esperada vs explicada
  diferencia_esperada_ars: number     // saldo_compania - saldo_contraparte
  diferencia_esperada_usd: number
  diferencia_explicada_ars: number    // suma de la composicion
  diferencia_explicada_usd: number
  diferencia_sin_explicar_ars: number  // esperada - explicada (debería dar 0)
  diferencia_sin_explicar_usd: number
  // Composición
  composicion: ComposicionDiferencia
}
