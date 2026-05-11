"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, AlertCircle } from "lucide-react"

type Grupo = { id: string; nombre: string; slug: string }
type BrandConfig = {
  color_primario: string
  color_acento: string
  logo_url: string | null
  bg_login_url: string | null
  nombre_display: string | null
  tagline: string | null
}

const DEFAULT_BRAND: BrandConfig = {
  color_primario: "#1E3A5F",
  color_acento: "#2B5CE6",
  logo_url: null,
  bg_login_url: null,
  nombre_display: "Concilia",
  tagline: "Conciliación de cuentas corrientes",
}

export default function LoginPage() {
  const router = useRouter()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoId, setGrupoId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND)

  useEffect(() => {
    // Cargar grupos
    supabase
      .from("grupos_trabajo")
      .select("id, nombre, slug")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setGrupos(data ?? []))

    // Cargar config visual del primer grupo
    async function cargarBrand() {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()
      if (!grupo) return

      const { data: config } = await supabase
        .from("grupos_config")
        .select("color_primario, color_acento, logo_url, bg_login_url, nombre_display, tagline")
        .eq("grupo_id", grupo.id)
        .single()

      if (config) setBrand({ ...DEFAULT_BRAND, ...config })
    }
    cargarBrand()
  }, [])

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

  const grupoSeleccionado = grupos.find(g => g.id === grupoId)

  // Fondo del header del login
  const loginBg = brand.bg_login_url
    ? { backgroundImage: `url(${brand.bg_login_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: `linear-gradient(135deg, ${brand.color_primario}, ${brand.color_acento})` }

  return (
    <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand header */}
        <div
          className="p-8 flex flex-col items-center justify-center mb-0"
          style={loginBg}
        >
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="Logo" className="w-12 h-12 object-contain mb-3" />
          ) : (
            <div
              className="w-12 h-12 mb-3 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <span className="text-white text-xl font-bold">
                {(brand.nombre_display ?? "C").charAt(0)}
              </span>
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-white">
            {brand.nombre_display ?? "Concilia"}
          </h1>
          <p className="text-xs text-white/70 mt-1">{brand.tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-ink-200 p-6">

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
                  onChange={e => { setGrupoId(e.target.value); setError(null) }}
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
                style={{ background: brand.color_acento }}
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
                style={{ background: brand.color_acento }}
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
                style={{ background: brand.color_acento }}
              >
                {cargando ? "Ingresando…" : "Ingresar"}
              </button>
            </form>
          )}

        </div>

        <p className="text-center text-2xs text-ink-400 mt-4">
          ¿No tenés acceso? Contactá a tu supervisor.
        </p>
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