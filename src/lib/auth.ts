import { createClient } from "./supabase-server"

export type UsuarioSesion = {
  id: string
  nombre: string
  email: string
  rol: "admin" | "supervisor" | "operativo"
  grupo_id: string
  grupo_nombre: string
  primer_login: boolean
}

export async function getUsuarioSesion(): Promise<UsuarioSesion | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, grupo_id, primer_login, grupos_trabajo(nombre)")
    .eq("id", user.id)
    .eq("activo", true)
    .single()

  if (!data) return null

  return {
    id: data.id,
    nombre: data.nombre,
    email: data.email,
    rol: data.rol as UsuarioSesion["rol"],
    grupo_id: data.grupo_id,
    grupo_nombre: (data.grupos_trabajo as any)?.nombre ?? "",
    primer_login: data.primer_login,
  }
}
