"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"

type Usuario = {
  id: string
  nombre: string
  email: string
  rol: "admin" | "supervisor" | "operativo"
  grupo_id: string
  grupo_nombre: string
}

type UserContextValue = {
  usuario: Usuario | null
  cargando: boolean
}

const UserContext = createContext<UserContextValue>({ usuario: null, cargando: true })

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setUsuario(null); return }

        const { data, error } = await supabase
          .from("usuarios")
          .select("nombre, email, rol, grupo_id, grupos_trabajo(nombre)")
          .eq("id", user.id)
          .maybeSingle()

        if (error) {
          console.error("[user-context] error al leer usuario:", error)
          setUsuario(null)
          return
        }
        if (!data) {
          console.error("[user-context] no se encontró la fila del usuario", user.id)
          setUsuario(null)
          return
        }

        setUsuario({
          id: user.id,
          nombre: data.nombre,
          email: data.email,
          rol: data.rol as Usuario["rol"],
          grupo_id: data.grupo_id,
          grupo_nombre: (data.grupos_trabajo as any)?.nombre ?? "",
        })
      } catch (e) {
        console.error("[user-context] error inesperado:", e)
        setUsuario(null)
      } finally {
        setCargando(false)
      }
    }

    cargar()

    // Actualizar cuando cambia la sesión (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      cargar()
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <UserContext.Provider value={{ usuario, cargando }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
