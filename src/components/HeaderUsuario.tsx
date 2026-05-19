"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { useRouter } from "next/navigation"
import { LogOut, ChevronDown, User } from "lucide-react"
import { useUser } from "@/lib/user-context"

const ROL_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  operativo: "Operativo",
}

export default function HeaderUsuario() {
  const router = useRouter()
  const { usuario } = useUser()
  const [abierto, setAbierto] = useState(false)

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  if (!usuario) return null

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-700 hover:bg-ink-100 transition-colors border border-transparent hover:border-ink-200"
      >
        <div className="w-6 h-6 bg-accent-light flex items-center justify-center text-accent font-semibold text-2xs">
          {usuario.nombre.charAt(0).toUpperCase()}
        </div>
        <div className="text-left hidden sm:block">
          <div className="font-medium text-ink-900 leading-none">{usuario.nombre}</div>
          <div className="text-2xs text-ink-500 mt-0.5">{ROL_LABEL[usuario.rol] ?? usuario.rol}</div>
        </div>
        <ChevronDown size={12} className="text-ink-400" />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-ink-200 shadow-md z-50">
            <div className="px-3 py-2.5 border-b border-ink-200">
              <div className="text-xs font-semibold text-ink-900">{usuario.nombre}</div>
              <div className="text-2xs text-ink-500 mt-0.5">{usuario.email}</div>
              <div className="text-2xs text-ink-400 mt-0.5">{usuario.grupo_nombre} · {ROL_LABEL[usuario.rol]}</div>
            </div>
            <div className="py-1">
              <button
                onClick={() => { setAbierto(false); router.push("/cambiar-password") }}
                className="w-full text-left px-3 py-2 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
              >
                <User size={12} /> Cambiar contraseña
              </button>
              <button
                onClick={cerrarSesion}
                className="w-full text-left px-3 py-2 text-xs text-danger hover:bg-danger-light flex items-center gap-2"
              >
                <LogOut size={12} /> Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
