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
// SEGURIDAD (fix cross-tenant):
// Antes este handler creaba un cliente con la ANON KEY sin sesión, por lo que
// probarClave() corría sin ninguna verificación de que la contraparte pedida
// perteneciera al grupo del usuario. Cualquier usuario autenticado (o incluso
// sin sesión, si el middleware no lo cubría) podía leer movimientos de otra
// contraparte de OTRO tenant pasando su UUID.
//
// Ahora:
//  1. Se valida la sesión con getUsuarioSesion() (lee cookies server-side).
//  2. Se confirma que contraparte_id pertenece al grupo_id del usuario.
//  3. Recién ahí se ejecuta probarClave con el service role.
// Si la contraparte no es del grupo del usuario -> 403.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { probarClave } from '@/lib/probar-clave'
import { getUsuarioSesion } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Cliente admin (service role): solo se usa server-side, nunca se expone al browser.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan variables de entorno de Supabase (URL o SERVICE_ROLE_KEY).')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar sesión. Sin usuario autenticado -> 401.
    const usuario = await getUsuarioSesion()
    if (!usuario) {
      return NextResponse.json(
        { error: 'No autenticado.' },
        { status: 401 }
      )
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

    const db = admin()

    // 2. Autorización: la contraparte debe pertenecer al grupo del usuario.
    const { data: contraparte, error: errCtp } = await db
      .from('contrapartes')
      .select('id, grupo_id')
      .eq('id', contraparte_id)
      .maybeSingle()

    if (errCtp) {
      console.error('[probar-clave route] lookup contraparte', errCtp.message)
      return NextResponse.json(
        { error: 'Error al validar la contraparte.' },
        { status: 500 }
      )
    }

    // Mismo mensaje/estado para "no existe" y "no es de tu grupo": no revelamos
    // si un UUID de otro tenant existe o no.
    if (!contraparte || contraparte.grupo_id !== usuario.grupo_id) {
      return NextResponse.json(
        { error: 'La contraparte no existe o no pertenece a tu grupo.' },
        { status: 403 }
      )
    }

    // 3. Ya autorizado: ejecutar probarClave reutilizando el cliente admin
    // (service role). La firma recibe el cliente ya construido como primer arg.
    const resultado = await probarClave(
      db,
      contraparte_id,
      constructor_compania,
      constructor_contraparte,
      Math.min(limite, 50) // cap a 50 por seguridad
    )

    return NextResponse.json(resultado)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno del servidor'
    console.error('[probar-clave route]', msg)
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    )
  }
}
