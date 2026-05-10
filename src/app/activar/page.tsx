"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

export default function ActivarPage() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token")

  const [estado, setEstado] = useState<"validando" | "listo" | "error" | "expirado">("validando")
  const [invitacion, setInvitacion] = useState<{ email: string; nombre: string; grupo_nombre: string } | null>(null)
  const [password, setPassword] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setEstado("error"); return }

    supabase
      .from("invitaciones")
      .select("id, email, nombre, usado, expira_at, grupos_trabajo(nombre)")
      .eq("token", token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setEstado("error"); return }
        if (data.usado) { setEstado("expirado"); return }
        if (new Date(data.expira_at) < new Date()) { setEstado("expirado"); return }
        setInvitacion({
          email: data.email,
          nombre: data.nombre,
          grupo_nombre: (data.grupos_trabajo as any)?.nombre ?? "",
        })
        setEstado("listo")
      })
  }, [token])

  async function activar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return }
    if (password !== confirmar) { setError("Las contraseñas no coinciden"); return }

    setCargando(true)
    try {
      // Supabase envía el link de activación con el token en la URL de auth
      // El flujo es: usuario hace click en el link de email → se redirige acá con el token de invitación
      // Mientras tanto Supabase Auth ya procesó la sesión vía el email link
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        setError("Sesión inválida. El link puede haber expirado.")
        setCargando(false)
        return
      }

      // Actualizar contraseña
      const { error: passError } = await supabase.auth.updateUser({ password })
      if (passError) { setError(passError.message); setCargando(false); return }

      // Marcar invitación como usada y usuario como activo
      await supabase.from("invitaciones").update({ usado: true }).eq("token", token!)
      await supabase.from("usuarios").update({
        primer_login: false,
        activo: true,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id)

      setTimeout(() => { router.push("/"); router.refresh() }, 1200)
      setEstado("expirado") // reuse for "done"
    } catch {
      setError("Error inesperado. Contactá a tu supervisor.")
    } finally {
      setCargando(false)
    }
  }

  if (estado === "validando") {
    return (
      <div className="min-h-screen bg-ink-100 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (estado === "error") {
    return (
      <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
        <div className="bg-white border border-ink-200 p-8 text-center max-w-sm w-full">
          <AlertCircle size={32} className="text-danger mx-auto mb-3" />
          <div className="font-semibold">Link inválido</div>
          <p className="text-xs text-ink-500 mt-2">El link de activación no existe. Pedile a tu supervisor que reenvíe la invitación.</p>
        </div>
      </div>
    )
  }

  if (estado === "expirado") {
    return (
      <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
        <div className="bg-white border border-ink-200 p-8 text-center max-w-sm w-full">
          <CheckCircle2 size={32} className="text-ok mx-auto mb-3" />
          <div className="font-semibold">¡Cuenta activada!</div>
          <p className="text-xs text-ink-500 mt-2">Redirigiendo al sistema…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent mx-auto mb-3 flex items-center justify-center">
            <span className="text-white text-xl font-bold">C</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Activar cuenta</h1>
          {invitacion && (
            <p className="text-xs text-ink-500 mt-1">
              Hola <strong>{invitacion.nombre}</strong>, elegí tu contraseña para acceder a <strong>{invitacion.grupo_nombre}</strong>
            </p>
          )}
        </div>

        <div className="bg-white border border-ink-200 p-6">
          {invitacion && (
            <div className="mb-4 px-3 py-2 bg-ink-50 border border-ink-200 text-xs text-ink-600">
              📧 {invitacion.email}
            </div>
          )}

          <form onSubmit={activar} className="space-y-4">
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                placeholder="Mínimo 8 caracteres"
                className="input input-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirmá</label>
              <input
                type="password"
                value={confirmar}
                onChange={e => { setConfirmar(e.target.value); setError(null) }}
                placeholder="Repetí la contraseña"
                className="input input-lg"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger bg-danger-light border border-danger/20 px-3 py-2">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando || !password || !confirmar}
              className="btn btn-primary btn-lg w-full disabled:opacity-40"
            >
              {cargando ? "Activando…" : "Activar cuenta"}
            </button>
          </form>
        </div>

        <p className="text-center text-2xs text-ink-400 mt-4">
          Link válido por 48 horas desde que fue enviado.
        </p>
      </div>
    </div>
  )
}
