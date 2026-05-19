"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase-client"
import { useUser } from "@/lib/user-context"
import Link from "next/link"
import { Bell, CheckCheck, CheckCircle2, AlertCircle, Unlock } from "lucide-react"

type Notificacion = {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  conciliacion_id: string | null
  created_at: string
}

const TIPO_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  conciliacion_cerrada:  { icon: <CheckCircle2 size={14} />, color: "text-warn" },
  conciliacion_aprobada: { icon: <CheckCircle2 size={14} />, color: "text-ok" },
  conciliacion_reabierta:{ icon: <Unlock size={14} />,       color: "text-danger" },
}

export default function NotificacionesBell() {
  const { usuario } = useUser()
  const [notifs, setNotifs] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const noLeidas = notifs.filter(n => !n.leida).length

  useEffect(() => {
    if (!usuario) return

    // Carga inicial
    async function cargar() {
      const { data } = await supabase
        .from("notificaciones")
        .select("id, tipo, titulo, mensaje, leida, conciliacion_id, created_at")
        .eq("usuario_id", usuario!.id)
        .order("created_at", { ascending: false })
        .limit(20)
      setNotifs((data ?? []) as Notificacion[])
    }
    cargar()

    // Suscripción Realtime — escucha inserts en tiempo real
    const channel = supabase
      .channel(`notifs_${usuario.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificaciones",
          filter: `usuario_id=eq.${usuario.id}`,
        },
        (payload) => {
          setNotifs(prev => [payload.new as Notificacion, ...prev].slice(0, 20))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuario])

  // Cerrar al clickear fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    if (abierto) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [abierto])

  async function marcarLeidas() {
    if (!usuario || noLeidas === 0) return
    const ids = notifs.filter(n => !n.leida).map(n => n.id)
    await supabase
      .from("notificaciones")
      .update({ leida: true })
      .in("id", ids)
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
  }

  async function marcarUnaLeida(id: string) {
    await supabase.from("notificaciones").update({ leida: true }).eq("id", id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
  }

  function formatTiempo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return "ahora"
    if (min < 60) return `hace ${min}m`
    const hs = Math.floor(min / 60)
    if (hs < 24) return `hace ${hs}h`
    return `hace ${Math.floor(hs / 24)}d`
  }

  if (!usuario) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setAbierto(v => !v); if (!abierto && noLeidas > 0) marcarLeidas() }}
        className="relative flex items-center justify-center w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ""}`}
      >
        <Bell size={16} />
        {noLeidas > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-danger rounded-full text-white text-2xs font-bold flex items-center justify-center leading-none">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-ink-200 shadow-lg rounded-lg z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
            <span className="text-xs font-semibold text-ink-800">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                onClick={marcarLeidas}
                className="text-2xs text-ink-500 hover:text-accent flex items-center gap-1"
              >
                <CheckCheck size={11} /> Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-ink-50">
            {notifs.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={20} className="mx-auto text-ink-300 mb-2" />
                <div className="text-xs text-ink-400">Sin notificaciones</div>
              </div>
            ) : (
              notifs.map(n => {
                const cfg = TIPO_CONFIG[n.tipo] ?? TIPO_CONFIG["conciliacion_cerrada"]
                const Wrapper = n.conciliacion_id ? Link : "div"
                const wrapperProps = n.conciliacion_id
                  ? { href: `/conciliaciones/${n.conciliacion_id}`, onClick: () => { marcarUnaLeida(n.id); setAbierto(false) } }
                  : {}

                return (
                  <Wrapper
                    key={n.id}
                    {...(wrapperProps as any)}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-ink-50 transition-colors cursor-pointer ${!n.leida ? "bg-accent-light/20" : ""}`}
                  >
                    <div className={`flex-shrink-0 mt-0.5 ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-ink-800 leading-tight">{n.titulo}</div>
                      <div className="text-2xs text-ink-500 mt-0.5 leading-relaxed line-clamp-2">{n.mensaje}</div>
                      <div className="text-2xs text-ink-400 mt-1">{formatTiempo(n.created_at)}</div>
                    </div>
                    {!n.leida && (
                      <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                    )}
                  </Wrapper>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
