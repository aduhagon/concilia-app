"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertCircle } from "lucide-react"

export default function CambiarPasswordPage() {
  const router = useRouter()
  const [nueva, setNueva] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (nueva.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return }
    if (nueva !== confirmar) { setError("Las contraseñas no coinciden"); return }

    setCargando(true)
    try {
      // 1. Actualizar contraseña en Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password: nueva })
      if (authError) { setError(authError.message); return }

      // 2. Marcar primer_login = false
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from("usuarios")
          .update({ primer_login: false, updated_at: new Date().toISOString() })
          .eq("id", user.id)
      }

      setOk(true)
      setTimeout(() => { router.push("/"); router.refresh() }, 1500)
    } catch {
      setError("Error inesperado. Intentá de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  if (ok) {
    return (
      <div className="min-h-screen bg-ink-100 flex items-center justify-center">
        <div className="bg-white border border-ink-200 p-8 text-center max-w-sm w-full">
          <CheckCircle2 size={32} className="text-ok mx-auto mb-3" />
          <div className="font-semibold">Contraseña actualizada</div>
          <div className="text-xs text-ink-500 mt-1">Redirigiendo…</div>
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
          <h1 className="text-xl font-semibold tracking-tight">Elegí tu contraseña</h1>
          <p className="text-xs text-ink-500 mt-1">Antes de continuar necesitás definir tu contraseña</p>
        </div>

        <div className="bg-white border border-ink-200 p-6">
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                value={nueva}
                onChange={e => { setNueva(e.target.value); setError(null) }}
                placeholder="Mínimo 8 caracteres"
                className="input input-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirmá la contraseña</label>
              <input
                type="password"
                value={confirmar}
                onChange={e => { setConfirmar(e.target.value); setError(null) }}
                placeholder="Repetí la contraseña"
                className="input input-lg"
              />
            </div>

            {/* Indicador de fortaleza */}
            {nueva.length > 0 && (
              <div className="text-2xs space-y-1">
                <Check ok={nueva.length >= 8} label="Al menos 8 caracteres" />
                <Check ok={/[A-Z]/.test(nueva)} label="Una mayúscula" />
                <Check ok={/[0-9]/.test(nueva)} label="Un número" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-danger bg-danger-light border border-danger/20 px-3 py-2">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando || !nueva || !confirmar}
              className="btn btn-primary btn-lg w-full disabled:opacity-40"
            >
              {cargando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${ok ? "text-ok" : "text-ink-400"}`}>
      <CheckCircle2 size={11} />
      {label}
    </div>
  )
}
