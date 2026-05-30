"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, AlertCircle } from "lucide-react"
import loginBg from "./login-bg.png"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ingresar(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError("Ingresá tu email"); return }
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

      if (usuario.primer_login) {
        window.location.href = "/cambiar-password"
        return
      }

      // El grupo del usuario determina la configuración visual,
      // que se aplica dentro de la app vía su grupo_id.
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

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-ink-100"
      style={{
        backgroundImage: `url(${loginBg.src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Velo claro para dar contraste a la tarjeta sobre el fondo */}
      <div className="absolute inset-0 bg-white/40" />

      <div className="relative w-full max-w-sm shadow-xl overflow-hidden rounded-lg">

        {/* Header con marca genérica */}
        <div
          className="relative h-36"
          style={{ background: "linear-gradient(135deg, #1E3A5F, #2B5CE6)" }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
            <div
              className="w-10 h-10 mb-2 flex items-center justify-center rounded"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <span className="text-white text-lg font-bold">C</span>
            </div>
            <div className="text-white font-semibold text-base leading-tight">
              Concilia
            </div>
            <div className="text-white/60 text-xs mt-0.5">
              Conciliación de cuentas corrientes
            </div>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white p-6">
          <form onSubmit={ingresar} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null) }}
                placeholder="usuario@empresa.com"
                className="input input-lg w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  placeholder="••••••••"
                  className="input input-lg w-full pr-9"
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
              disabled={cargando || !email.trim() || !password}
              className="w-full py-2.5 text-sm font-semibold text-white rounded disabled:opacity-40 transition-all"
              style={{ background: "#2B5CE6" }}
            >
              {cargando ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
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
