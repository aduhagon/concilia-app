// src/lib/probar-clave.ts
// Dado un ConstructorClave (compania y contraparte) y un contraparte_id,
// recupera los ultimos movimientos de cada lado y calcula la clave para cada uno.
// Se usa desde el panel ProbarClavePanel para verificar la configuracion antes de guardar.

import { createClient } from '@supabase/supabase-js'
import { construirClave } from './constructor-clave'

// Importamos el tipo directamente desde el proyecto para no redefinirlo y
// evitar desincronizacion con la definicion real de ConstructorClave.
// Si los tipos estan en src/types/index.ts ajustar el path segun corresponda.
import type { ConstructorClave } from '@/types'

// ── Tipos propios de este modulo ──────────────────────────────────────────────

export interface ResultadoPrueba {
  comprobante_raw: string
  fecha: string
  tipo_original: string
  importe_ars: number | null
  clave_calculada: string | null
  error?: string
}

export interface ResultadoProbarClave {
  compania: ResultadoPrueba[]
  contraparte: ResultadoPrueba[]
  total_compania: number
  total_contraparte: number
}

// ── Funcion principal ─────────────────────────────────────────────────────────

/**
 * Ejecuta los constructores de clave sobre los movimientos reales de la contraparte.
 * Toma los ultimos N movimientos de cada lado (por fecha descendente) de la ultima
 * conciliacion que tenga movimientos cargados para esa contraparte.
 *
 * Si no hay movimientos previos, devuelve arrays vacios (sin lanzar error).
 */
export async function probarClave(
  contraparteId: string,
  constructorCompania: ConstructorClave,
  constructorContraparte: ConstructorClave,
  supabaseUrl: string,
  supabaseKey: string,
  limite = 20
): Promise<ResultadoProbarClave> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Buscar la ultima conciliacion con movimientos para esta contraparte
  const { data: conciliacion, error: errConc } = await supabase
    .from('conciliaciones')
    .select('id')
    .eq('contraparte_id', contraparteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (errConc || !conciliacion) {
    return {
      compania: [],
      contraparte: [],
      total_compania: 0,
      total_contraparte: 0,
    }
  }

  // Traer movimientos de cada lado en paralelo
  const [resCompania, resContraparte] = await Promise.all([
    supabase
      .from('movimientos')
      .select('comprobante_raw, fecha, tipo_original, importe_ars')
      .eq('conciliacion_id', conciliacion.id)
      .eq('origen', 'compania')
      .not('comprobante_raw', 'is', null)
      .order('fecha', { ascending: false })
      .limit(limite),
    supabase
      .from('movimientos')
      .select('comprobante_raw, fecha, tipo_original, importe_ars')
      .eq('conciliacion_id', conciliacion.id)
      .eq('origen', 'contraparte')
      .not('comprobante_raw', 'is', null)
      .order('fecha', { ascending: false })
      .limit(limite),
  ])

  const procesarLado = (
    movimientos: Array<{
      comprobante_raw: string
      fecha: string
      tipo_original: string
      importe_ars: number | null
    }> | null,
    constructor: ConstructorClave
  ): ResultadoPrueba[] => {
    if (!movimientos) return []

    return movimientos.map((mov) => {
      try {
        // construirClave espera un MovimientoNorm; pasamos un objeto minimo con
        // los campos que usan las operaciones de tipo 'campo'.
        const clave = construirClave(
          { comprobante_raw: mov.comprobante_raw } as Parameters<typeof construirClave>[0],
          constructor
        )
        return {
          comprobante_raw: mov.comprobante_raw,
          fecha: mov.fecha,
          tipo_original: mov.tipo_original,
          importe_ars: mov.importe_ars,
          clave_calculada: clave ?? '',
        }
      } catch (e: unknown) {
        const mensaje = e instanceof Error ? e.message : 'Error al calcular clave'
        return {
          comprobante_raw: mov.comprobante_raw,
          fecha: mov.fecha,
          tipo_original: mov.tipo_original,
          importe_ars: mov.importe_ars,
          clave_calculada: null,
          error: mensaje,
        }
      }
    })
  }

  return {
    compania: procesarLado(resCompania.data, constructorCompania),
    contraparte: procesarLado(resContraparte.data, constructorContraparte),
    total_compania: resCompania.data?.length ?? 0,
    total_contraparte: resContraparte.data?.length ?? 0,
  }
}
