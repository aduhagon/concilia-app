"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase-client"

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function aplicarTema() {
      // Resolver el grupo del usuario autenticado (multi-tenant correcto).
      // ThemeProvider está por fuera de UserProvider en el árbol, así que no
      // puede usar useUser(); deriva el grupo de la sesión igual que user-context.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("grupo_id")
        .eq("id", user.id)
        .single()

      const grupoId = perfil?.grupo_id
      if (!grupoId) return

      const { data: config } = await supabase
        .from("grupos_config")
        .select("color_primario, color_acento, color_fondo, tipografia, logo_url, nombre_display")
        .eq("grupo_id", grupoId)
        .single()

      if (!config) return

      const root = document.documentElement

      // Aplicar colores como CSS variables
      if (config.color_primario) root.style.setProperty("--color-accent", config.color_primario)
      if (config.color_acento)   root.style.setProperty("--color-accent2", config.color_acento)
      if (config.color_fondo)    root.style.setProperty("--color-bg", config.color_fondo)

      // Aplicar tipografía
      if (config.tipografia) {
        root.style.setProperty("--font-sans", `"${config.tipografia}", system-ui, sans-serif`)
        document.body.style.fontFamily = `"${config.tipografia}", system-ui, sans-serif`
      }

      // Guardar en sessionStorage para acceso rápido
      sessionStorage.setItem("concilia_config", JSON.stringify(config))
    }

    aplicarTema()

    // Reaplicar cuando cambia la sesión (login/logout): al cambiar de usuario
    // —o de tenant— el tema debe recalcularse, no quedar cacheado del anterior.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      aplicarTema()
    })
    return () => subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
