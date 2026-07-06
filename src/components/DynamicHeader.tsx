"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { useUser } from "@/lib/user-context"
import HeaderUsuario from "@/components/HeaderUsuario"
import NotificacionesBell from "@/components/NotificacionesBell"

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

// Mapa de rutas a títulos de pestaña.
// exact: true = coincidencia exacta. Por defecto usa startsWith.
const ROUTE_TITLES: Array<{ match: string; exact?: boolean; title: string }> = [
  { match: "/",                     exact: true, title: "Inicio" },
  { match: "/nueva",                exact: true, title: "Nueva conciliación" },
  { match: "/comparador",           title: "Comparador de bases" },
  { match: "/conciliaciones",       exact: true, title: "Historial" },
  { match: "/conciliaciones/",      title: "Detalle de conciliación" },
  { match: "/supervisor",           title: "Tablero de supervisión" },
  { match: "/plantillas",           exact: true, title: "Cuentas y plantillas" },
  { match: "/plantillas/",          title: "Editar plantilla" },
  { match: "/usuarios",             title: "Usuarios" },
  { match: "/sociedades",           title: "Sociedades" },
  { match: "/tipos-cambio",         title: "Tipos de cambio" },
  { match: "/historial-categorias", title: "Historial de categorías" },
  { match: "/configuracion",        title: "Configuración" },
  { match: "/auditoria",            title: "Auditoría" },
]

function getTitleForPath(pathname: string, appName: string): string {
  for (const entry of ROUTE_TITLES) {
    const matches = entry.exact
      ? pathname === entry.match
      : pathname.startsWith(entry.match)
    if (matches) return `${entry.title} — ${appName}`
  }
  return appName
}

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
  { href: "/comparador",          label: "Comparador" },
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

  // grupo_id del usuario autenticado (multi-tenant correcto).
  const grupoId = usuario?.grupo_id ?? null

  // Filtrar ítems según el rol del usuario
  const itemsVisibles = NAV_ITEMS.filter(item => {
    if (!item.roles) return true
    if (!usuario) return false
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

    // Sin grupo resuelto todavía, no consultamos la config: evitamos leer
    // la de un grupo arbitrario. El caché (si existe) ya pintó algo provisional.
    if (!grupoId) return

    async function cargar(gid: string) {
      const { data } = await supabase
        .from("grupos_config")
        .select("color_primario, color_acento, color_fondo, tipografia, logo_url, nombre_display")
        .eq("grupo_id", gid)
        .single()

      if (data) {
        const config = { ...DEFAULT, ...data }
        setCfg(config)
        sessionStorage.setItem("concilia_config", JSON.stringify(config))
        document.body.style.backgroundColor = config.color_fondo
        document.body.style.fontFamily = `"${config.tipografia}", system-ui, sans-serif`
      }
    }
    cargar(grupoId)

    // Escuchar cambios de preview en vivo desde /configuracion
    function onPreview() {
      const cached = sessionStorage.getItem("concilia_config")
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          const config = { ...DEFAULT, ...parsed }
          setCfg(config)
          document.body.style.backgroundColor = config.color_fondo
          document.body.style.fontFamily = `"${config.tipografia}", system-ui, sans-serif`
        } catch {}
      }
    }
    window.addEventListener("concilia_config_preview", onPreview)
    return () => window.removeEventListener("concilia_config_preview", onPreview)
  }, [esRutaPublica, pathname, grupoId])

  // Actualizar el título de la pestaña al cambiar de ruta o nombre de app
  useEffect(() => {
    const appName = cfg.nombre_display ?? "Concilia"
    document.title = getTitleForPath(pathname, appName)
  }, [pathname, cfg.nombre_display])

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

          <nav className="hidden md:flex items-center gap-1">
            {itemsVisibles.map(item => {
              const activo =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activo
                      ? "bg-white/20 text-white"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <NotificacionesBell />
          <HeaderUsuario />
        </div>
      </div>
    </header>
  )
}
