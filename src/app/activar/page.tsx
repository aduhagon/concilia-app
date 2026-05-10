"use client"

import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

export default function ActivarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ink-100 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    }>
      <ActivarContenido />
    </Suspense>
  )
}

function ActivarContenido() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token")

  const [estado, setEstado] = useState<"validando" | "listo" | "error" | "expirado" | "done">("validando")
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
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) { setError("Sesión inválida. El link puede haber expirado."); return }
      const { error: passError } = await supabase.auth.updateUser({ password })
      if (passError) { setError(passError.message); return }
      await supabase.from("invitaciones").update({ usado: