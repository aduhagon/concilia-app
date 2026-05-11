"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, AlertCircle } from "lucide-react"

type Grupo = { id: string; nombre: string; slug: string }
type GrupoConfig = {
  color_primario: string
  color_acento: string
  logo_url: string | null
  bg_login_url: string | null
  nombre_display: string | null
  tagline: string | null
}

const DEFAULT_CONFIG: GrupoConfig = {
  color_primario: "#1E3A5F",
  color_acento: "#2B5CE6",
  logo_url: null,
  bg_login_url: null,
  nombre_display: null,
  tagline: null,
}

export default function LoginPage() {
  const router = useRouter()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoId, setGrupoId] = useState("")
  const [grupoConfig, setGrupoConfig] = useState<GrupoConfig | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paso, setPaso] = useState<1 | 2 | 3>(1)

  useEffect(() => {
    supabase
      .from("grupos_trabajo")
      .select("id, nombre, slug")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setGrupos(data ?? []))
  }, [])

  // Cargar config visual cuando se selecciona un grupo
  async function onSelectGrupo(id: string) {
    setGrupoId(id)
    setError(null)
    setGrupoConfig(null)
    if (!id) return

    const { data } = await supabase
      .from("grupos_config")
      .select("color_primario, color_acento, logo_url, bg_login_url, nombre_display, tagline")
      .eq("grupo_id", id)
      .single()

    if (data) setGrupoConfig({ ...DEFAULT_CONFIG, ...data })
  }

  function avanzarPaso() {
    if (paso === 1 && !grupoId) { setError("Seleccioná un grupo de trabajo"); return }
    if (paso === 2 && !email.trim()) { setError("Ingresá tu email"); return }
    setError(null)
    setPaso((p) => (p + 1) as 1 | 2 | 3)
  }

  async function ingresar(e: React.FormEvent) {
    e.preventDefault()
    if (!password) { setError("Ingresá tu contraseña"); return }
    setCargando(true)
    setError(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError || !authData.user) {
        setError("Email o contraseña incorrectos")
        setCargando(false)
        return
      }

      const { data: usuario, error: userError } = await supabase
        .from("usuarios")
        .select("id, nombre, rol, primer_login, activo, grupo_id")
        .eq("id", authData.user.id)
        .eq("activo", true)
        .single()

      if (userError || !usuario) {
        await supabase.auth.signOut()
        setError("Usuario inactivo o sin acceso al sistema")
        setCargando(false)
        return
      }

      if (usuario.grupo_id !== grupoId) {
        await supabase.auth.signOut()
        setError("Tu usuario no tiene acceso a este grupo de trabajo")
        setCargando(false)
        return
      }

      if (usuario.primer_login) {
        window.location.href = "/cambiar-password"
        return
      }

      window.location.href = "/"
    } catch {
      setError("Error inesperado. Intentá de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  async function recuperarPassword() {
    if (!email.trim()) { setError("Ingresá tu email primero"); return }
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/cambiar-password` }
    )
    if (error) setError("No se pudo enviar el email")
    else { setError(null); alert("Email de recuperación enviado. Revisá tu bandeja.") }
  }

  const cfg = grupoConfig ?? DEFAULT_CONFIG
  const grupoSeleccionado = grupos.find(g => g.id === grupoId)

  // Estilos del fondo del header
  const headerStyle = grupoConfig?.bg_login_url
    ? {
        backgroundImage: `url(${grupoConfig.bg_login_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: `linear-gradient(135deg, ${cfg.color_primario}, ${cfg.color_acento})`,
      }

  const btnStyle = { background: cfg.color_acento }

  return (
    <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm shadow-lg overflow-hidden">

        {/* Header con fondo (imagen o gradiente) */}
        <div className="relative h-36" style={headerStyle}>
          {/* Overlay suave para legibilidad */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Contenido del header */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
            {grupoConfig?.logo_url ? (
              // Mostrar logo de la empresa seleccionada
              <img
                src={grupoConfig.logo_url}
                alt="Logo"
                className="h-12 max-w-32 object-contain mb-2"
              />
            ) : (
              // Iniciales o ícono genérico
              <div
                className="w-10 h-10 mb-2 flex items-center justify-center rounded"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <span className="text-white text-lg font-bold">
                  {grupoConfig
                    ? (grupoConfig.nombre_display ?? grupoSeleccionado?.nombre ?? "G").charAt(0)
                    : "C"
                  }
                </span>
              </div>
            )}
            <div className="text-white font-semibold text-base leading-tight">
              {grupoConfig
                ? (grupoConfig.nombre_display ?? grupoSeleccionado?.nombre ?? "")
                : "Concilia"
              }
            </div>
            {grupoConfig?.tagline && (
              <div className="text-white/70 text-xs mt-0.5">{grupoConfig.tagline}</div>
            )}
            {!grupoConfig && (
              <div className="text-white/60 text-xs mt-0.5">Conciliación de cuentas corrientes</div>
            )}
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white p-6">

          {/* Paso 1 — Grupo */}
          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">
                  Paso 1 de 3 · Grupo de trabajo
                </div>
                <label className="label">¿A qué empresa pertenecés?</label>
                <select
                  value={grupoId}
                  onChange={e => onSelectGrupo(e.target.value)}
                  className="input input-lg w-full"
                  autoFocus
                >
                  <option value="">— Seleccioná tu empresa —</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nombre}</option>
                  ))}
                </select>
              </div>
              {error && <ErrorMsg msg={error} />}
              <button
                onClick={avanzarPaso}
                disabled={!grupoId}
                className="w-full py-2.5 text-sm font-semibold text-white rounded disabled:opacity-40 transition-all"
                style={btnStyle}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Paso 2 — Email */}
          {paso === 2 && (
            <div className="space-y-4">
              <div>
                <button onClick={() => setPaso(1)} className="text-2xs text-ink-500 hover:text-accent mb-3 inline-flex items-center gap-1">
                  ← {grupoSeleccionado?.nombre}
                </button>
                <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">
                  Paso 2 de 3 · Email
                </div>
                <label className="label">Tu email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === "Enter" && avanzarPaso()}
                  placeholder="usuario@empresa.com"
                  className="input input-lg w-full"
                  autoFocus
                />
              </div>
              {error && <ErrorMsg msg={error} />}
              <button
                onClick={avanzarPaso}
                disabled={!email.trim()}
                className="w-full py-2.5 text-sm font-semibold text-white rounded disabled:opacity-40 transition-all"
                style={btnStyle}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Paso 3 — Contraseña */}
          {paso === 3 && (
            <form onSubmit={ingresar} className="space-y-4">
              <div>
                <button type="button" onClick={() => setPaso(2)} className="text-2xs text-ink-500 hover:text-accent mb-3 inline-flex items-center gap-1">
                  ← {email}
                </button>
                <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">
                  Paso 3 de 3 · Contraseña
                </div>
                <label className="label">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(null) }}
                    placeholder="••••••••"
                    className="input input-lg w-full pr-9"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={recuperarPassword}
                  className="text-2xs text-ink-500 hover:text-accent mt-2"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {error && <ErrorMsg msg={error} />}
              <button
                type="submit"
                disabled={cargando || !password}
                className="w-full py-2.5 text-sm font-semibold text-white rounded disabled:opacity-40 transition-all"
                style={btnStyle}
              >
                {cargando ? "Ingresando…" : "Ingresar"}
              </button>
            </form>
          )}

        </div>

        <div className="bg-white border-t border-ink-100 px-6 py-3">
          <p className="text-center text-2xs text-ink-400">
            ¿No tenés acceso? Contactá a tu supervisor.
          </p>
        </div>

      </div>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-danger bg-danger-light border border-danger/20 px-3 py-2">
      <AlertCircle size={13} className="flex-shrink-0" />
      {msg}
    </div>
  )
}