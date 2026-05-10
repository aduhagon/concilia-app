"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import { CheckCircle2, AlertCircle, ArrowRight, Building2, Plus, FileText, Clock, TrendingUp } from "lucide-react"
import { formatNumCompact, formatNum, antiguedad } from "@/lib/format"

type Proveedor = {
  id: string
  nombre: string
  cuit: string | null
  ultima_conc?: {
    id: string
    periodo_label: string | null
    diferencia_final_ars: number | null
    created_at: string
    saldo_final_compania_ars: number | null
  }
  total_conciliaciones: number
  pendientes_arrastre?: number       // pendientes guardados de la última
  arrastre_mas_viejo_dias?: number
}

export default function HomePage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_proveedores: 0,
    conciliaciones_mes: 0,
    pendientes_total: 0,
    arrastres_viejos: 0,
  })

  useEffect(() => {
    async function cargar() {
      const { data: contras } = await supabase
        .from("contrapartes")
        .select("id, nombre, cuit")
        .order("nombre")

      const items: Proveedor[] = []
      let totalPend = 0
      let arrastres = 0
      let concilEsteMes = 0
      const inicioMes = new Date()
      inicioMes.setDate(1)
      inicioMes.setHours(0, 0, 0, 0)

      for (const c of contras ?? []) {
        const { data: ultimaConc } = await supabase
          .from("conciliaciones")
          .select("id, periodo_label, diferencia_final_ars, created_at, saldo_final_compania_ars")
          .eq("contraparte_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const { count: total } = await supabase
          .from("conciliaciones")
          .select("id", { count: "exact", head: true })
          .eq("contraparte_id", c.id)

        let pendientes_arrastre: number | undefined
        let arrastre_mas_viejo_dias: number | undefined

        if (ultimaConc) {
          if (new Date(ultimaConc.created_at) >= inicioMes) concilEsteMes++

          const { data: pendientes } = await supabase
            .from("movimientos")
            .select("fecha")
            .eq("conciliacion_id", ultimaConc.id)

          if (pendientes && pendientes.length > 0) {
            pendientes_arrastre = pendientes.length
            totalPend += pendientes.length

            const fechasArr = pendientes
              .map((m) => m.fecha)
              .filter(Boolean)
              .map((d) => new Date(d as string).getTime())

            if (fechasArr.length > 0) {
              const min = Math.min(...fechasArr)
              const dias = Math.floor((Date.now() - min) / 86400000)
              arrastre_mas_viejo_dias = dias
              if (dias > 90) arrastres++
            }
          }
        }

        items.push({
          id: c.id,
          nombre: c.nombre,
          cuit: c.cuit,
          ultima_conc: ultimaConc ?? undefined,
          total_conciliaciones: total ?? 0,
          pendientes_arrastre,
          arrastre_mas_viejo_dias,
        })
      }

      setProveedores(items)
      setStats({
        total_proveedores: items.length,
        conciliaciones_mes: concilEsteMes,
        pendientes_total: totalPend,
        arrastres_viejos: arrastres,
      })
      setLoading(false)
    }
    cargar()
  }, [])

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="h-page">Concilia</h1>
        <p className="text-sm text-ink-500 mt-1">Resumen de cuentas corrientes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Proveedores"
          value={stats.total_proveedores}
          icon={<Building2 size={14} />}
        />
        <StatCard
          label="Conciliados este mes"
          value={stats.conciliaciones_mes}
          icon={<CheckCircle2 size={14} />}
          variant="ok"
        />
        <StatCard
          label="Pendientes en arrastre"
          value={stats.pendientes_total}
          icon={<Clock size={14} />}
          variant={stats.pendientes_total > 100 ? "warn" : undefined}
        />
        <StatCard
          label="Arrastres > 90 días"
          value={stats.arrastres_viejos}
          icon={<AlertCircle size={14} />}
          variant={stats.arrastres_viejos > 0 ? "danger" : undefined}
        />
      </div>

      {/* Lista de proveedores */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="h-section">Proveedores</h2>
          <Link href="/plantillas" className="btn btn-secondary">
            <Plus size={12} /> Nuevo proveedor
          </Link>
        </div>

        {loading ? (
          <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
        ) : proveedores.length === 0 ? (
          <div className="card text-center py-12">
            <Building2 size={28} className="mx-auto text-ink-300 mb-3" />
            <div className="text-base font-semibold">Sin proveedores aún</div>
            <p className="text-xs text-ink-500 mt-1 mb-4">Empezá creando tu primer proveedor para conciliar.</p>
            <Link href="/plantillas" className="btn btn-primary inline-flex">+ Agregar proveedor</Link>
          </div>
        ) : (
          <div className="panel divide-y divide-ink-200">
            {proveedores.map((p) => (
              <ProveedorRow key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, variant }: {
  label: string
  value: number
  icon: React.ReactNode
  variant?: "ok" | "warn" | "danger"
}) {
  const colorCls =
    variant === "ok" ? "text-ok" :
    variant === "warn" ? "text-warn" :
    variant === "danger" ? "text-danger" :
    "text-ink-700"
  return (
    <div className="panel p-4">
      <div className={`flex items-center gap-1.5 text-2xs uppercase tracking-wider ${colorCls}`}>
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 num ${colorCls}`}>{value}</div>
    </div>
  )
}

function ProveedorRow({ p }: { p: Proveedor }) {
  const dif = p.ultima_conc?.diferencia_final_ars ?? 0
  const ok = Math.abs(dif) < 1 && p.ultima_conc !== undefined
  const sinUltima = !p.ultima_conc

  return (
    <Link
      href={p.ultima_conc ? `/conciliaciones/${p.ultima_conc.id}` : `/plantillas/${p.id}`}
      className="flex items-center px-4 py-3 hover:bg-ink-50 transition-colors group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 flex items-center justify-center text-xs font-semibold flex-shrink-0
          ${sinUltima ? "bg-ink-100 text-ink-500" :
            ok ? "bg-ok-light text-ok" :
            "bg-warn-light text-warn"}`}>
          {ok ? <CheckCircle2 size={14} /> : sinUltima ? <Building2 size={14} /> : <AlertCircle size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{p.nombre}</div>
          <div className="text-2xs text-ink-500 flex items-center gap-3 mt-0.5">
            {p.cuit && <span className="font-mono">{p.cuit}</span>}
            {p.ultima_conc?.periodo_label && (
              <span>Última: {p.ultima_conc.periodo_label}</span>
            )}
            <span>{p.total_conciliaciones} conciliaciones</span>
          </div>
        </div>
      </div>

      {/* Stats inline */}
      <div className="hidden md:flex items-center gap-6 px-4">
        {p.ultima_conc && (
          <>
            <Stat label="Saldo cmp" value={formatNumCompact(p.ultima_conc.saldo_final_compania_ars ?? 0)} />
            <Stat label="Pendientes" value={p.pendientes_arrastre ?? 0} variant={(p.pendientes_arrastre ?? 0) > 50 ? "warn" : undefined} />
            {p.arrastre_mas_viejo_dias !== undefined && p.arrastre_mas_viejo_dias > 60 && (
              <Stat
                label="Más viejo"
                value={`${p.arrastre_mas_viejo_dias} d`}
                variant={p.arrastre_mas_viejo_dias > 180 ? "danger" : "warn"}
              />
            )}
            <Stat
              label="Control"
              value={formatNum(dif)}
              variant={ok ? "ok" : "warn"}
              mono
            />
          </>
        )}
      </div>

      <ArrowRight size={14} className="text-ink-300 group-hover:text-accent transition-colors flex-shrink-0" />
    </Link>
  )
}

function Stat({ label, value, variant, mono }: {
  label: string
  value: string | number
  variant?: "ok" | "warn" | "danger"
  mono?: boolean
}) {
  const colorCls =
    variant === "ok" ? "text-ok" :
    variant === "warn" ? "text-warn" :
    variant === "danger" ? "text-danger" :
    "text-ink-900"
  return (
    <div className="text-right">
      <div className="text-2xs text-ink-500">{label}</div>
      <div className={`text-xs font-semibold ${colorCls} ${mono ? "num" : ""}`}>{value}</div>
    </div>
  )
}
