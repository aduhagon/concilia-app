"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import {
  CheckCircle2, AlertCircle, ArrowRight, Building2,
  Plus, Clock, Bell, TrendingUp, Users, Calendar
} from "lucide-react"
import { formatNumCompact, formatNum, antiguedad } from "@/lib/format"

type Rol = "admin" | "supervisor" | "operativo" | null

type CuentaOperativo = {
  id: string
  nombre: string
  cuit: string | null
  categoria: string | null
  sociedad: string | null
  prox_conciliacion: string | null
  prox_alerta: string | null
  ultima_conc: {
    id: string
    periodo_label: string | null
    diferencia_final_ars: number | null
    created_at: string
    saldo_final_compania_ars: number | null
  } | null
  total_conciliaciones: number
  estado: "conciliada" | "pendiente" | "vencida" | "sin_iniciar"
  alerta_semanal: boolean
}

const CAT_COLORS: Record<string, string> = {
  A: "bg-danger-light text-danger",
  B: "bg-warn-light text-warn",
  C: "bg-yellow-50 text-yellow-700",
  D: "bg-ok-light text-ok",
  E: "bg-info-light text-info",
  F: "bg-ink-100 text-ink-500",
}

function calcularEstado(prox: string | null, ultimaConc: string | null, categoria: string | null): CuentaOperativo["estado"] {
  if (!ultimaConc) return "sin_iniciar"
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const ultimaFecha = new Date(ultimaConc)
  if (ultimaFecha >= inicioMes) return "conciliada"
  if (prox) {
    return new Date(prox) < hoy ? "vencida" : "pendiente"
  }
  if (categoria === "E" || categoria === "F") return "pendiente"
  return "vencida"
}

export default function HomePage() {
  const [rol, setRol] = useState<Rol>(null)
  const [nombre, setNombre] = useState("")
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Para operativo
  const [cuentas, setCuentas] = useState<CuentaOperativo[]>([])

  // Para supervisor/admin
  const [statsSuper, setStatsSuper] = useState({
    total: 0, conciliadas: 0, vencidas: 0, pendientes: 0, alertas: 0
  })

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: u } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", user.id)
        .single()

      if (!u) return
      setNombre(u.nombre)
      setRol(u.rol as Rol)
      setUsuarioId(user.id)

      if (u.rol === "operativo") {
        await cargarCuentasOperativo(user.id)
      } else {
        await cargarStatsSupervision()
      }

      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarCuentasOperativo(uid: string) {
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, nombre, cuit, categoria, sociedad, prox_conciliacion, prox_alerta")
      .eq("conciliador_id", uid)
      .eq("activo", true)
      .order("nombre")

    const items: CuentaOperativo[] = []
    const hoy = new Date()

    for (const c of contras ?? []) {
      const { data: ultima } = await supabase
        .from("conciliaciones")
        .select("id, periodo_label, diferencia_final_ars, created_at, saldo_final_compania_ars")
        .eq("contraparte_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const { count } = await supabase
        .from("conciliaciones")
        .select("id", { count: "exact", head: true })
        .eq("contraparte_id", c.id)

      const estado = calcularEstado(c.prox_conciliacion, ultima?.created_at ?? null, c.categoria)
      const alertaSemanal = c.categoria === "A" && c.prox_alerta
        ? new Date(c.prox_alerta) <= hoy : false

      items.push({
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit,
        categoria: c.categoria,
        sociedad: c.sociedad,
        prox_conciliacion: c.prox_conciliacion,
        prox_alerta: c.prox_alerta,
        ultima_conc: ultima ?? null,
        total_conciliaciones: count ?? 0,
        estado,
        alerta_semanal: alertaSemanal,
      })
    }

    // Ordenar por urgencia
    const orden = { vencida: 0, pendiente: 2, sin_iniciar: 3, conciliada: 4 }
    items.sort((a, b) => {
      const oa = a.alerta_semanal && a.estado !== "vencida" ? 1 : orden[a.estado]
      const ob = b.alerta_semanal && b.estado !== "vencida" ? 1 : orden[b.estado]
      return oa - ob
    })

    setCuentas(items)
  }

  async function cargarStatsSupervision() {
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, categoria, prox_conciliacion, prox_alerta")
      .eq("activo", true)

    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    let conciliadas = 0, vencidas = 0, pendientes = 0, alertas = 0

    for (const c of contras ?? []) {
      const { data: ultima } = await supabase
        .from("conciliaciones")
        .select("created_at")
        .eq("contraparte_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const estado = calcularEstado(c.prox_conciliacion, ultima?.created_at ?? null, c.categoria)
      if (estado === "conciliada") conciliadas++
      else if (estado === "vencida") vencidas++
      else pendientes++

      if (c.categoria === "A" && c.prox_alerta && new Date(c.prox_alerta) <= hoy) alertas++
    }

    setStatsSuper({
      total: contras?.length ?? 0,
      conciliadas, vencidas, pendientes, alertas,
    })
  }

  const pct = statsSuper.total > 0
    ? Math.round((statsSuper.conciliadas / statsSuper.total) * 100) : 0

  const hoy = new Date()
  const mesLabel = hoy.toLocaleString("es-AR", { month: "long", year: "numeric" })

  if (loading) {
    return <div className="text-sm text-ink-400 text-center py-16">Cargando…</div>
  }

  // ══════════════════════════════
  // VISTA OPERATIVO
  // ══════════════════════════════
  if (rol === "operativo") {
    const urgentes = cuentas.filter(c => c.estado !== "conciliada")
    const conciliadas = cuentas.filter(c => c.estado === "conciliada")

    return (
      <div className="px-6 py-6 space-y-6">

        {/* Saludo */}
        <div className="flex items-end justify-between border-b border-ink-200 pb-6">
          <div>
            <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">
              {mesLabel}
            </div>
            <h1 className="h-page">Hola, {nombre.split(" ")[0]} 👋</h1>
            <p className="text-ink-600 mt-1 text-sm">
              {urgentes.length > 0
                ? `Tenés ${urgentes.length} cuenta${urgentes.length > 1 ? "s" : ""} para atender.`
                : "Todas tus cuentas están al día. 🎉"
              }
            </p>
          </div>
          <Link href="/nueva" className="btn btn-primary">
            <Plus size={14} /> Nueva conciliación
          </Link>
        </div>

        {/* Mis stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Mis cuentas" value={cuentas.length} icon={<Building2 size={13} />} />
          <StatCard label="Conciliadas" value={conciliadas.length} icon={<CheckCircle2 size={13} />} variant="ok" />
          <StatCard label="Vencidas" value={cuentas.filter(c => c.estado === "vencida").length} icon={<AlertCircle size={13} />} variant={cuentas.filter(c => c.estado === "vencida").length > 0 ? "danger" : undefined} />
          <StatCard label="Alertas semanales" value={cuentas.filter(c => c.alerta_semanal).length} icon={<Bell size={13} />} variant={cuentas.filter(c => c.alerta_semanal).length > 0 ? "warn" : undefined} />
        </div>

        {/* Cuentas urgentes */}
        {urgentes.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-ink-700">⚡ Requieren atención</div>
            <div className="panel divide-y divide-ink-100">
              {urgentes.map(c => <CuentaRow key={c.id} c={c} />)}
            </div>
          </div>
        )}

        {/* Conciliadas */}
        {conciliadas.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-ink-700">✅ Conciliadas este mes</div>
            <div className="panel divide-y divide-ink-100">
              {conciliadas.map(c => <CuentaRow key={c.id} c={c} />)}
            </div>
          </div>
        )}

        {/* Sin cuentas asignadas */}
        {cuentas.length === 0 && (
          <div className="card text-center py-12">
            <Building2 size={28} className="mx-auto text-ink-300 mb-3" />
            <div className="text-base font-semibold">Sin cuentas asignadas</div>
            <p className="text-xs text-ink-500 mt-1">
              Tu supervisor todavía no te asignó ninguna cuenta para conciliar.
            </p>
          </div>
        )}

      </div>
    )
  }

  // ══════════════════════════════
  // VISTA SUPERVISOR / ADMIN
  // ══════════════════════════════
  return (
    <div className="px-6 py-6 space-y-6">

      {/* Saludo */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">
            {mesLabel}
          </div>
          <h1 className="h-page">Hola, {nombre.split(" ")[0]} 👋</h1>
          <p className="text-ink-600 mt-1 text-sm">
            Resumen del cierre mensual — Grupo MSU
          </p>
        </div>
        <Link href="/supervisor" className="btn btn-primary">
          Ver tablero completo →
        </Link>
      </div>

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Conciliadas" value={statsSuper.conciliadas} icon={<CheckCircle2 size={13} />} variant="ok" />
        <StatCard label="Vencidas" value={statsSuper.vencidas} icon={<AlertCircle size={13} />} variant={statsSuper.vencidas > 0 ? "danger" : undefined} />
        <StatCard label="Pendientes" value={statsSuper.pendientes} icon={<Clock size={13} />} variant={statsSuper.pendientes > 0 ? "warn" : undefined} />
        <StatCard label="Alertas Cat. A" value={statsSuper.alertas} icon={<Bell size={13} />} variant={statsSuper.alertas > 0 ? "warn" : undefined} />
      </div>

      {/* Avance del mes */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Avance del mes</div>
            <div className="text-2xs text-ink-400 mt-0.5">
              {statsSuper.conciliadas} de {statsSuper.total} cuentas conciliadas
            </div>
          </div>
          <div className="text-2xl font-bold num text-accent">
            {pct}<span className="text-base font-normal text-ink-400">%</span>
          </div>
        </div>
        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-ok rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Alertas */}
      {statsSuper.vencidas > 0 && (
        <div className="flex items-center gap-3 bg-danger-light border border-danger/20 px-4 py-3 text-sm">
          <AlertCircle size={16} className="text-danger flex-shrink-0" />
          <span>
            <strong className="text-danger">{statsSuper.vencidas} cuenta{statsSuper.vencidas > 1 ? "s" : ""} vencida{statsSuper.vencidas > 1 ? "s" : ""}</strong>
            {" "}sin conciliar.{" "}
            <Link href="/supervisor" className="underline text-danger">Ver en el tablero →</Link>
          </span>
        </div>
      )}

      {/* Links rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink href="/supervisor" icon={<TrendingUp size={18} />} label="Tablero" desc="Estado de cuentas" />
        <QuickLink href="/plantillas" icon={<Building2 size={18} />} label="Cuentas" desc="ABM y plantillas" />
        <QuickLink href="/usuarios" icon={<Users size={18} />} label="Usuarios" desc="Gestión de accesos" />
        <QuickLink href="/tipos-cambio" icon={<Calendar size={18} />} label="Tipo de cambio" desc="TC por período" />
      </div>

    </div>
  )
}

function CuentaRow({ c }: { c: CuentaOperativo }) {
  const dif = c.ultima_conc?.diferencia_final_ars ?? 0
  const difOk = Math.abs(dif) < 1

  const estadoConfig = {
    conciliada: { color: "bg-ok-light text-ok", dot: "bg-ok", label: "Conciliada" },
    pendiente: { color: "bg-warn-light text-warn", dot: "bg-warn", label: "Pendiente" },
    vencida: { color: "bg-danger-light text-danger", dot: "bg-danger", label: "Vencida" },
    sin_iniciar: { color: "bg-ink-100 text-ink-500", dot: "bg-ink-300", label: "Sin iniciar" },
  }
  const est = estadoConfig[c.estado]

  return (
    <Link
      href={c.ultima_conc ? `/conciliaciones/${c.ultima_conc.id}` : `/nueva?contraparte=${c.id}`}
      className="flex items-center px-4 py-3 hover:bg-ink-50 transition-colors group"
    >
      {/* Indicador de urgencia */}
      <div className={`w-1 self-stretch rounded-full mr-3 flex-shrink-0 ${est.dot}`} />

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{c.nombre}</span>
            {c.alerta_semanal && (
              <Bell size={11} className="text-warn flex-shrink-0" title="Alerta semanal activa" />
            )}
          </div>
          <div className="text-2xs text-ink-500 flex items-center gap-3 mt-0.5">
            {c.cuit && <span className="font-mono">{c.cuit}</span>}
            {c.sociedad && <span>{c.sociedad}</span>}
            {c.ultima_conc?.periodo_label && (
              <span>Última: {c.ultima_conc.periodo_label}</span>
            )}
          </div>
        </div>
      </div>

      {/* Categoría */}
      <div className="hidden md:flex items-center gap-4 px-4">
        {c.categoria && (
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded font-mono ${CAT_COLORS[c.categoria] ?? ""}`}>
            {c.categoria}
          </span>
        )}
        {c.ultima_conc && (
          <div className="text-right">
            <div className="text-2xs text-ink-400">Diferencia</div>
            <div className={`text-xs font-mono font-semibold ${difOk ? "text-ok" : "text-warn"}`}>
              {difOk ? "✓ $0" : formatNum(dif)}
            </div>
          </div>
        )}
      </div>

      {/* Estado */}
      <span className={`text-2xs font-semibold inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full mr-3 ${est.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />
        {est.label}
      </span>

      <ArrowRight size={14} className="text-ink-300 group-hover:text-accent transition-colors flex-shrink-0" />
    </Link>
  )
}

function StatCard({ label, value, icon, variant }: {
  label: string; value: number; icon: React.ReactNode
  variant?: "ok" | "warn" | "danger"
}) {
  const colorCls = variant === "ok" ? "text-ok" : variant === "warn" ? "text-warn" : variant === "danger" ? "text-danger" : "text-ink-700"
  return (
    <div className="panel p-4">
      <div className={`flex items-center gap-1.5 text-2xs uppercase tracking-wider ${colorCls}`}>
        {icon} {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 num ${colorCls}`}>{value}</div>
    </div>
  )
}

function QuickLink({ href, icon, label, desc }: {
  href: string; icon: React.ReactNode; label: string; desc: string
}) {
  return (
    <Link href={href} className="panel p-4 hover:bg-ink-50 transition-colors group flex items-center gap-3">
      <div className="w-9 h-9 bg-accent-light flex items-center justify-center text-accent flex-shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-2xs text-ink-400">{desc}</div>
      </div>
    </Link>
  )
}