// src/app/plantillas/[id]/probar-clave/route.ts
// POST /plantillas/[id]/probar-clave
//
// Body: {
//   contraparte_id: string
//   constructor_compania: ConstructorClave
//   constructor_contraparte: ConstructorClave
//   limite?: number  // default 20
// }
//
// Response: ResultadoProbarClave
//
// Seguridad: usa la sesión del usuario (cookies) en vez de la anon key pelada.
// Así RLS reconoce al usuario como authenticated de su grupo y le devuelve
// solo los movimientos de SU grupo. Sin sesión válida → 401.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { probarClave } from '@/lib/probar-clave'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()

    // Validar sesión: sin usuario autenticado no se ejecuta nada.
    const { data: { user }, error: errAuth } = await supabase.auth.getUser()
    if (errAuth || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await req.json()
    const {
      contraparte_id,
      constructor_compania,
      constructor_contraparte,
      limite = 20,
    } = body

    if (!contraparte_id || !constructor_compania || !constructor_contraparte) {
      return NextResponse.json(
        { error: 'Faltan parametros: contraparte_id, constructor_compania, constructor_contraparte' },
        { status: 400 }
      )
    }

    // Verificar que la contraparte pertenezca al grupo del usuario.
    // RLS ya filtra, pero un chequeo explícito da un 403 claro en vez de
    // "0 movimientos" silencioso cuando el id es de otro grupo.
    const { data: contraparte } = await supabase
      .from('contrapartes')
      .select('id')
      .eq('id', contraparte_id)
      .maybeSingle()

    if (!contraparte) {
      return NextResponse.json(
        { error: 'Contraparte no encontrada o sin acceso' },
        { status: 403 }
      )
    }

    const resultado = await probarClave(
      supabase,
      contraparte_id,
      constructor_compania,
      constructor_contraparte,
      Math.min(limite, 50) // cap a 50 por seguridad
    )

    return NextResponse.json(resultado)
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : 'Error interno del servidor'
    console.error('[probar-clave route]', e)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
