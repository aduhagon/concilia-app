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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { probarClave } from '@/lib/probar-clave'

export async function POST(req: NextRequest) {
  try {
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const resultado = await probarClave(
      contraparte_id,
      constructor_compania,
      constructor_contraparte,
      supabaseUrl,
      supabaseKey,
      Math.min(limite, 50) // cap a 50 por seguridad
    )

    return NextResponse.json(resultado)
  } catch (e: any) {
    console.error('[probar-clave route]', e)
    return NextResponse.json(
      { error: e?.message ?? 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
