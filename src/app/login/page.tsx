"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, AlertCircle } from "lucide-react"

type Grupo = { id: string; nombre: string; slug: string }

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

  // Cargar grupos disponibles
  useEffect(() => {
    supabase
      .from("grupos_trabajo")
      .select("id, nombre, slug")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setGrupos(data ?? []))
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
      // 1. Autenticar con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError || !authData.user) {
        setError("Email o contraseña incorrectos")
        setCargando(false)
        return
      }

      // 2. Verificar que el usuario pertenece al grupo seleccionado y está activo
      const { data: usuario, error: userError } = await supabase
        .from("usuarios")
        .select("id, nombre, rol, primer_login, activo, grupo_id")
        .eq("id", authData.user.id)
        .eq("grupo_id", grupoId)
        .eq("activo", true)
        .single()

      if (userError || !usuario) {
        await supabase.auth.signOut()
        setError("Tu usuario no tiene acceso a este grupo de trabajo")
        setCargando(false)
        return
      }

      // 3. Si es primer login → redirigir a cambio de contraseña
      if (usuario.primer_login) {
        router.push("/cambiar-password")
        return
      }

      router.push("/")
      router.refresh()
    } catch {
      setError("Error inesperado. Intentá de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  async function recuperarPassword() {
    if (!email.trim()) { setError("Ingresá tu email primero"); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/cambiar-password`,
    })
    if (error) setError("No se pudo enviar el email")
    else setError(null), alert("Email de recuperación enviado. Revisá tu bandeja.")
  }

  const grupoSeleccionado = grupos.find(g => g.id === grupoId)

  return (
    <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent mx-auto mb-3 flex items-center justify-center">
            <span className="text-white text-xl font-bold">C</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Concilia</h1>
          <p className="text-xs text-ink-500 mt-1">Conciliación de cuentas corrientes</p>
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
                  className="input input-lg"
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
                className="btn btn-primary btn-lg w-full disabled:opacity-40"
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
                  className="input input-lg"
                  autoFocus
                />
              </div>
              {error && <ErrorMsg msg={error} />}
              <button
                onClick={avanzarPaso}
                disabled={!email.trim()}
                className="btn btn-primary btn-lg w-full disabled:opacity-40"
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
                    className="input input-lg pr-9"
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
                className="btn btn-primary btn-lg w-full disabled:opacity-40"
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
