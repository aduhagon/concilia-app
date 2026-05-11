"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase-client"

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function aplicarTema() {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()

      if (!grupo) return

      const { data: config } = await supabase
        .from("grupos_config")
        .select("color_primario, color_acento, color_fondo, tipografia, logo_url, nombre_display")
        .eq("grupo_id", grupo.id)
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
  }, [])

  return <>{children}</>
}
