"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import HeaderUsuario from "@/components/HeaderUsuario"

type Config = {
  color_primario: string
  color_acento: string
  color_fondo: string
  tipografia: string
  logo_url: string | null
  nombre_display: string | null
}

const DEFAULT: Config = {
  color_primario: "#1E3A5F",
  color_acento: "#2B5CE6",
  color_fondo: "#F2F0EB",
  tipografia: "Sora",
  logo_url: null,
  nombre_display: "Concilia",
}

// Rutas donde NO se muestra el header
const RUTAS_SIN_HEADER = ["/login", "/activar", "/cambiar-password"]

export default function DynamicHeader() {
  const pathname = usePathname()
  const [cfg, setCfg] = useState<Config>(DEFAULT)

  // No mostrar en rutas públicas
  const esRutaPublica = RUTAS_SIN_HEADER.some(r => pathname.startsWith(r))

  useEffect(() => {
    if (esRutaPublica) return

    // Intentar desde sessionStorage primero
    const cached = sessionStorage.getItem("concilia_config")
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setCfg({ ...DEFAULT, ...parsed })
        document.body.style.backgroundColor = parsed.color_fondo ?? DEFAULT.color_fondo
        document.body.style.fontFamily = `"${parsed.tipografia ?? DEFAULT.tipografia}", system-ui, sans-serif`
      } catch {}
    }

    // Refrescar desde Supabase
    async function cargar() {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()
      if (!grupo) return

      const { data } = await supabase
        .from("grupos_config")
        .select("color_primario, color_acento, color_fondo, tipografia, logo_url, nombre_display")
        .eq("grupo_id", grupo.id)
        .single()

      if (data) {
        const config = { ...DEFAULT, ...data }
        setCfg(config)
        sessionStorage.setItem("concilia_config", JSON.stringify(config))
        document.body.style.backgroundColor = config.color_fondo
        document.body.style.fontFamily = `"${config.tipografia}", system-ui, sans-serif`
      }
    }
    cargar()
  }, [esRutaPublica, pathname])

  // No renderizar en rutas públicas
  if (esRutaPublica) return null

  return (
    <header
      className="h-14 sticky top-0 z-30 border-b border-black/10"
      style={{ background: cfg.color_primario, fontFamily: cfg.tipografia }}
    >
      <div className="h-full px-4 flex items-center justify-between max-w-[1800px] mx-auto">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            {cfg.logo_url ? (
              <img src={cfg.logo_url} alt="Logo" className="w-7 h-7 object-contain" />
            ) : (
              <div
                className="w-7 h-7 flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <span className="text-white text-sm font-bold tracking-tighter">
                  {(cfg.nombre_display ?? "C").charAt(0)}
                </span>
              </div>
            )}
            <span className="font-semibold text-sm tracking-tight text-white">
              {cfg.nombre_display ?? "Concilia"}
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-xs">
            {[
              { href: "/", label: "Inicio" },
              { href: "/plantillas", label: "Plantillas" },
              { href: "/conciliaciones", label: "Historial" },
              { href: "/supervisor", label: "Tablero" },
              { href: "/usuarios", label: "Usuarios" },
              { href: "/configuracion", label: "Configuración" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/nueva"
            className="px-3 py-1.5 text-sm font-semibold rounded text-white"
            style={{ background: cfg.color_acento }}
          >
            + Nueva conciliación
          </Link>
          <HeaderUsuario />
        </div>
      </div>
    </header>
  )
}