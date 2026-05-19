"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { useUser } from "@/lib/user-context"
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

// Definición del menú con permisos por rol.
// roles: undefined = todos los roles autenticados lo ven.
type NavItem = {
  href: string
  label: string
  roles?: Array<"admin" | "supervisor" | "operativo">
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",                    label: "Inicio" },
  { href: "/conciliaciones",      label: "Historial" },
  { href: "/plantillas",          label: "Plantillas",        roles: ["admin", "supervisor"] },
  { href: "/supervisor",          label: "Tablero",           roles: ["admin", "supervisor"] },
  { href: "/historial-categorias",label: "Hist. categorías",  roles: ["admin", "supervisor"] },
  { href: "/tipos-cambio",        label: "Tipos de cambio",   roles: ["admin", "supervisor"] },
  { href: "/sociedades",          label: "Sociedades",        roles: ["admin"] },
  { href: "/usuarios",            label: "Usuarios",          roles: ["admin"] },
  { href: "/configuracion",       label: "Configuración",     roles: ["admin"] },
]

export default function DynamicHeader() {
  const pathname = usePathname()
  const [cfg, setCfg] = useState<Config>(DEFAULT)
  const { usuario } = useUser()

  const esRutaPublica = RUTAS_SIN_HEADER.some(r => pathname.startsWith(r))

  // Filtrar ítems según el rol del usuario
  const itemsVisibles = NAV_ITEMS.filter(item => {
    if (!item.roles) return true                          // visible para todos
    if (!usuario) return false                            // sin sesión: ocultar ítems restringidos
    return item.roles.includes(usuario.rol)
  })

  useEffect(() => {
    if (esRutaPublica) return

    const cached = sessionStorage.getItem("concilia_config")
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setCfg({ ...DEFAULT, ...parsed })
        document.body.style.backgroundColor = parsed.color_fondo ?? DEFAULT.color_fondo
        document.body.style.fontFamily = `"${parsed.tipografia ?? DEFAULT.tipografia}", system-ui, sans-serif`
      } catch {}
    }

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
            {itemsVisibles.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 transition-colors rounded ${
                  pathname === href || (href !== "/" && pathname.startsWith(href))
                    ? "text-white bg-white/20"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Ocultar "Nueva conciliación" para roles sin acceso a /nueva */}
          {usuario && (usuario.rol === "admin" || usuario.rol === "supervisor" || usuario.rol === "operativo") && (
            <Link
              href="/nueva"
              className="px-3 py-1.5 text-sm font-semibold rounded text-white"
              style={{ background: cfg.color_acento }}
            >
              + Nueva conciliación
            </Link>
          )}
          <HeaderUsuario />
        </div>
      </div>
    </header>
  )
}
