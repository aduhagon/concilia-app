export type EstadoConciliacion =
  | "conciliado_automatico"
  | "conciliado_sugerido"
  | "pendiente_compania"
  | "pendiente_contraparte"
  | "diferencia_importe"
  | "tipo_no_clasificado"
  | "duplicado_posible"

export type NivelMatch = "N1" | "N2" | "N3" | "N4" | null

export interface Empresa {
  id: string
  nombre: string
  cuit?: string
  created_at: string
}

export interface Contraparte {
  id: string
  empresa_id: string
  nombre: string
  cuit?: string
  notas?: string
  created_at: string
}

export interface Conciliacion {
  id: string
  empresa_id: string
  contraparte_id: string
  contraparte?: Contraparte
  periodo_desde: string
  periodo_hasta: string
  saldo_inicial: number
  saldo_compania?: number
  saldo_contraparte?: number
  diferencia_final?: number
  estado: "borrador" | "en_proceso" | "finalizada"
  created_at: string
}

export interface Movimiento {
  id: string
  conciliacion_id: string
  origen: "compania" | "contraparte"
  fecha: string
  comprobante?: string
  descripcion?: string
  tipo_original?: string
  tipo_normalizado?: string
  importe: number
  estado_conciliacion: EstadoConciliacion
  match_id?: string
  nivel_match?: NivelMatch
  created_at: string
}

export interface Equivalencia {
  id: string
  empresa_id: string
  origen: "compania" | "contraparte" | "ambos"
  texto_original: string
  tipo_normalizado: string
  signo: 1 | -1
  activo: boolean
  created_at: string
}

export interface MapeoColumnas {
  fecha: string
  comprobante: string
  descripcion: string
  importe?: string
  debe?: string
  haber?: string
}

export interface MovimientoNormalizado {
  fecha: string
  comprobante: string
  descripcion: string
  tipo_original: string
  tipo_normalizado: string | null
  importe: number
  origen: "compania" | "contraparte"
}

export interface ResultadoConciliacion {
  conciliados: Array<{ compania: MovimientoNormalizado; contraparte: MovimientoNormalizado; nivel: NivelMatch; confianza: number }>
  pendientes_compania: MovimientoNormalizado[]
  pendientes_contraparte: MovimientoNormalizado[]
  diferencias: Array<{ compania: MovimientoNormalizado; contraparte: MovimientoNormalizado; diferencia: number }>
  no_clasificados: string[]
  saldo_conciliado: number
}
