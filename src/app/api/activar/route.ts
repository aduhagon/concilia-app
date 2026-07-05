// src/app/api/activar/route.ts
//
// Activación de cuenta server-side.
//
// Por qué existe: la tabla `invitaciones` tiene RLS que solo permite SELECT a
// usuarios YA autenticados (admin/supervisor del mismo grupo). Un invitado nuevo
// es rol `anon` y no puede leer su propia invitación desde el cliente. Por eso
// toda la lógica vive acá, usando el SERVICE ROLE KEY que bypassa RLS.
//
// GET  ?token=...  -> valida el token y devuelve { email, nombre, grupo_nombre }
//                     para pintar el saludo, sin necesidad de sesión.
// POST { token, password } -> crea el usuario en Auth (ya confirmado),
//                     inserta el perfil en `usuarios` y marca la invitación usada.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// Cliente admin: service role, sin persistencia de sesión. Nunca se expone al browser.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (URL o SERVICE_ROLE_KEY).")
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---- Validación del token (para el saludo) ----
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "Falta el token." }, { status: 400 })
    }

    const db = admin()
    const { data: inv, error } = await db
      .from("invitaciones")
      .select("email, nombre, usado, expira_at, grupos_trabajo(nombre)")
      .eq("token", token)
      .maybeSingle()

    if (error) {
      console.error("[activar][GET]", error.message)
      return NextResponse.json({ error: "Error al validar el link." }, { status: 500 })
    }
    if (!inv) {
      return NextResponse.json({ error: "invalido" }, { status: 404 })
    }
    if (inv.usado) {
      return NextResponse.json({ error: "usado" }, { status: 410 })
    }
    if (new Date(inv.expira_at) < new Date()) {
      return NextResponse.json({ error: "expirado" }, { status: 410 })
    }

    return NextResponse.json({
      email: inv.email,
      nombre: inv.nombre,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      grupo_nombre: (inv.grupos_trabajo as any)?.nombre ?? "",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido"
    console.error("[activar][GET]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ---- Activación efectiva ----
export async function POST(req: NextRequest) {
  try {
    const { token, password } = (await req.json()) as {
      token?: string
      password?: string
    }

    if (!token) {
      return NextResponse.json({ error: "Falta el token." }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 }
      )
    }

    const db = admin()

    // 1. Traer la invitación completa (bypassa RLS por service role).
    const { data: inv, error: invErr } = await db
      .from("invitaciones")
      .select("id, email, nombre, rol, grupo_id, usado, expira_at")
      .eq("token", token)
      .maybeSingle()

    if (invErr) {
      console.error("[activar][POST] lookup", invErr.message)
      return NextResponse.json({ error: "Error al validar el link." }, { status: 500 })
    }
    if (!inv) {
      return NextResponse.json({ error: "El link de activación no es válido." }, { status: 404 })
    }
    if (inv.usado) {
      return NextResponse.json({ error: "Este link ya fue usado." }, { status: 410 })
    }
    if (new Date(inv.expira_at) < new Date()) {
      return NextResponse.json({ error: "El link expiró. Pedí uno nuevo." }, { status: 410 })
    }

    // 2. Crear el usuario en Auth, ya confirmado (sin mail de verificación).
    let userId: string | null = null

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { nombre: inv.nombre },
    })

    if (createErr) {
      // Si ya existía en Auth (reintento), lo buscamos y le seteamos la clave.
      const yaExiste =
        createErr.message?.toLowerCase().includes("already") ||
        (createErr as { status?: number }).status === 422

      if (yaExiste) {
        // Buscar el usuario existente por email.
        const { data: list, error: listErr } = await db.auth.admin.listUsers()
        if (listErr) {
          console.error("[activar][POST] listUsers", listErr.message)
          return NextResponse.json({ error: "Error al verificar la cuenta." }, { status: 500 })
        }
        const existente = list.users.find(
          (u) => (u.email ?? "").toLowerCase() === inv.email.toLowerCase()
        )
        if (!existente) {
          return NextResponse.json(
            { error: "No se pudo crear la cuenta. Contactá a tu supervisor." },
            { status: 500 }
          )
        }
        // Actualizar la contraseña y confirmar el mail.
        const { error: updErr } = await db.auth.admin.updateUserById(existente.id, {
          password,
          email_confirm: true,
          user_metadata: { nombre: inv.nombre },
        })
        if (updErr) {
          console.error("[activar][POST] updateUser", updErr.message)
          return NextResponse.json(
            { error: "Este email ya tiene cuenta. Probá iniciar sesión." },
            { status: 409 }
          )
        }
        userId = existente.id
      } else {
        console.error("[activar][POST] createUser", createErr.message)
        return NextResponse.json({ error: createErr.message }, { status: 400 })
      }
    } else {
      userId = created.user?.id ?? null
    }

    if (!userId) {
      return NextResponse.json({ error: "No se obtuvo el ID de usuario." }, { status: 500 })
    }

    // 3. Insertar/actualizar el perfil en la tabla `usuarios`.
    const { error: upsertErr } = await db.from("usuarios").upsert(
      {
        id: userId,
        nombre: inv.nombre,
        email: inv.email,
        rol: inv.rol,
        grupo_id: inv.grupo_id,
        activo: true,
        primer_login: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

    if (upsertErr) {
      console.error("[activar][POST] upsert usuarios", upsertErr.message)
      return NextResponse.json(
        { error: "La cuenta se creó pero falló el perfil. Contactá a tu supervisor." },
        { status: 500 }
      )
    }

    // 4. Marcar la invitación como usada.
    const { error: markErr } = await db
      .from("invitaciones")
      .update({ usado: true })
      .eq("id", inv.id)

    if (markErr) {
      // No es fatal: el usuario ya quedó creado. Solo lo logueamos.
      console.error("[activar][POST] marcar usada", markErr.message)
    }

    return NextResponse.json({ ok: true, email: inv.email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido"
    console.error("[activar][POST]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
