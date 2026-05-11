"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import Link from "next/link"
import {
  CheckCircle2, AlertCircle, Clock, TrendingUp,
  Building2, Search, Download, Bell
} from "lucide-react"

type CuentaEstado = {
  id: string
  nombre: string
  cuit: string | null
  tipo: string | null
  categoria: string | null
  sociedad: string | null
  activo: boolean
  prox_conciliacion: string | null
  prox_alerta: string | null
  total_conciliaciones: number
  ultima_conciliacion: string | null
  ultima_diferencia: number | null
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

const CAT_FREQ: Record<string, string> = {
  A: "Semanal + mensual", B: "Mensual", C: "Anual",
  D: "Anual exc.", E: "Manual", F: "Manual",
}

const ESTADO_CONFIG = {
  conciliada: { label: "Conciliada", color: "bg-ok-light text-ok", dot: "bg-ok" },
  pendiente: { label: "Pendiente", color: "bg-warn-light text-warn", dot: "bg-warn" },
  vencida: { label: "Vencida", color: "bg-danger-light text-danger", dot: "bg-danger" },
  sin_iniciar: { label: "Sin iniciar", color: "bg-ink-100 text-ink-500", dot: "bg-ink-300" },
}

function calcularEstado(cuenta: {
  ultima_conciliacion: string | null
  prox_conciliacion: string | null
  categoria: string | null
}): CuentaEstado["estado"] {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  if (!cuenta.ultima_conciliacion) return "sin_iniciar"

  const ultimaFecha = new Date(cuenta.ultima_conciliacion)

  // Conciliada este mes
  if (ultimaFecha >= inicioMes) return "conciliada"

  // Si tiene fecha de próxima conciliación calculada
  if (cuenta.prox_conciliacion) {
    const proxFecha = new Date(cuenta.prox_conciliacion)
    if (proxFecha < hoy) return "vencida"
    return "pendiente"
  }

  // E y F sin fecha — siempre pendiente
  if (cuenta.categoria === "E" || cuenta.categoria === "F") return "pendiente"

  // Fallback para A y B: vencida si no se concilió este mes
  return "vencida"
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(iso)
  return Math.ceil((fecha.getTime() - hoy.getTime()) / 86400000)
}

export default function SupervisorPage() {
  const [cuentas, setCuentas] = useState<CuentaEstado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("")
  const [filtroSociedad, setFiltroSociedad] = useState("")
  const [busqueda, setBusqueda] = useState("")

  useEffect(() => {
    async function cargar() {
      const { data: contras } = await supabase
        .from("contrapartes")
        .select("id, nombre, cuit, tipo, categoria, sociedad, activo, prox_conciliacion, prox_alerta")
        .eq("activo", true)
        .order("nombre")

      const items: CuentaEstado[] = []

      for (const c of contras ?? []) {
        const { data: ultima } = await supabase
          .from("conciliaciones")
          .select("id, created_at, diferencia_final_ars")
          .eq("contraparte_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const { count } = await supabase
          .from("conciliaciones")
          .select("id", { count: "exact", head: true })
          .eq("contraparte_id", c.id)

        const estado = calcularEstado({
          ultima_conciliacion: ultima?.created_at ?? null,
          prox_conciliacion: c.prox_conciliacion,
          categoria: c.categoria,
        })

        // Alerta semanal: solo cat A y si prox_alerta ya pasó
        const alertaSemanal = c.categoria === "A" && c.prox_alerta
          ? new Date(c.prox_alerta) <= new Date()
          : false

        items.push({
          id: c.id,
          nombre: c.nombre,
          cuit: c.cuit,
          tipo: c.tipo,
          categoria: c.categoria,
          sociedad: c.sociedad,
          activo: c.activo ?? true,
          prox_conciliacion: c.prox_conciliacion,
          prox_alerta: c.prox_alerta,
          total_conciliaciones: count ?? 0,
          ultima_conciliacion: ultima?.created_at ?? null,
          ultima_diferencia: ultima?.diferencia_final_ars ?? null,
          estado,
          alerta_semanal: alertaSemanal,
        })
      }

      // Ordenar: vencidas → alerta semanal → pendientes → sin_iniciar → conciliadas
      items.sort((a, b) => {
        const orden: Record<string, number> = { vencida: 0, pendiente: 2, sin_iniciar: 3, conciliada: 4 }
        const oa = a.alerta_semanal && a.estado !== "vencida" ? 1 : orden[a.estado]
        const ob = b.alerta_semanal && b.estado !== "vencida" ? 1 : orden[b.estado]
        return oa - ob
      })

      setCuentas(items)
      setLoading(false)
    }
    cargar()
  }, [])

  const kpis = {
    conciliadas: cuentas.filter(c => c.estado === "conciliada").length,
    pendientes: cuentas.filter(c => c.estado === "pendiente").length,
    vencidas: cuentas.filter(c => c.estado === "vencida").length,
    sin_iniciar: cuentas.filter(c => c.estado === "sin_iniciar").length,
    alertas: cuentas.filter(c => c.alerta_semanal).length,
    total: cuentas.length,
  }
  const pct = kpis.total > 0 ? Math.round((kpis.conciliadas / kpis.total) * 100) : 0

  const sociedades = [...new Set(cuentas.map(c => c.sociedad).filter(Boolean))] as string[]

  const filtradas = cuentas.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false
    if (filtroCategoria && c.categoria !== filtroCategoria) return false
    if (filtroSociedad && c.sociedad !== filtroSociedad) return false
    if (busqueda && !c.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
        !(c.cuit ?? "").includes(busqueda)) return false
    return true
  })

  const hoy = new Date()
  const mesLabel = hoy.toLocaleString("es-AR", { month: "long", year: "numeric" })

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">
            Supervisión · {mesLabel}
          </div>
          <h1 className="h-page">Tablero de cierre</h1>
          <p className="text-ink-600 mt-1 text-sm">Estado de conciliaciones — Grupo MSU</p>
        </div>
        <button
          onClick={() => alert("Exportar a Excel — próximamente")}
          className="btn btn-secondary"
        >
          <Download size={14} /> Exportar
        </button>
      </div>

      {/* Alertas */}
      {kpis.vencidas > 0 && (
        <div className="flex items-center gap-3 bg-danger-light border border-danger/20 px-4 py-3 text-sm">
          <AlertCircle size={16} className="text-danger flex-shrink-0" />
          <span>
            <strong className="text-danger">
              {kpis.vencidas} cuenta{kpis.vencidas > 1 ? "s" : ""} vencida{kpis.vencidas > 1 ? "s" : ""}
            </strong>
            {" "}sin conciliar. Requieren atención inmediata.
          </span>
        </div>
      )}
      {kpis.alertas > 0 && (
        <div className="flex items-center gap-3 bg-warn-light border border-warn/20 px-4 py-3 text-sm">
          <Bell size={16} className="text-warn flex-shrink-0" />
          <span>
            <strong className="text-warn">
              {kpis.alertas} cuenta{kpis.alertas > 1 ? "s" : ""} categoría A
            </strong>
            {" "}con alerta semanal activa — deberían conciliarse esta semana.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard label="Conciliadas" value={kpis.conciliadas} total={kpis.total}
          color="text-ok" barColor="bg-ok" icon={<CheckCircle2 size={13} />}
          onClick={() => setFiltroEstado(filtroEstado === "conciliada" ? "" : "conciliada")}
          activo={filtroEstado === "conciliada"} />
        <KPICard label="Pendientes" value={kpis.pendientes} total={kpis.total}
          color="text-warn" barColor="bg-warn" icon={<Clock size={13} />}
          onClick={() => setFiltroEstado(filtroEstado === "pendiente" ? "" : "pendiente")}
          activo={filtroEstado === "pendiente"} />
        <KPICard label="Vencidas" value={kpis.vencidas} total={kpis.total}
          color="text-danger" barColor="bg-danger" icon={<AlertCircle size={13} />}
          onClick={() => setFiltroEstado(filtroEstado === "vencida" ? "" : "vencida")}
          activo={filtroEstado === "vencida"} />
        <KPICard label="Sin iniciar" value={kpis.sin_iniciar} total={kpis.total}
          color="text-ink-400" barColor="bg-ink-300" icon={<Building2 size={13} />}
          onClick={() => setFiltroEstado(filtroEstado === "sin_iniciar" ? "" : "sin_iniciar")}
          activo={filtroEstado === "sin_iniciar"} />
        <div className="panel p-4 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink-500">
            <TrendingUp size={13} /> Avance del mes
          </div>
          <div className="text-2xl font-semibold num text-ink-900 mt-1">
            {pct}<span className="text-base font-normal">%</span>
          </div>
          <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-accent rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cuenta…"
            className="input pl-8 w-48"
          />
        </div>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="input">
          <option value="">Todas las categorías</option>
          {["A", "B", "C", "D", "E", "F"].map(c => (
            <option key={c} value={c}>Cat. {c} — {CAT_FREQ[c]}</option>
          ))}
        </select>
        {sociedades.length > 0 && (
          <select value={filtroSociedad} onChange={e => setFiltroSociedad(e.target.value)} className="input">
            <option value="">Todas las sociedades</option>
            {sociedades.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(filtroEstado || filtroCategoria || filtroSociedad || busqueda) && (
          <button
            onClick={() => { setFiltroEstado(""); setFiltroCategoria(""); setFiltroSociedad(""); setBusqueda("") }}
            className="text-2xs text-ink-500 hover:text-danger underline"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-2xs text-ink-400 ml-auto font-mono">
          {filtradas.length} de {cuentas.length} cuentas
        </span>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Cuenta</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Cat.</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Sociedad</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Estado</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Próx. vencimiento</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Última conc.</th>
                <th className="text-right px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Diferencia</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-ink-400">
                    No hay cuentas que coincidan con los filtros
                  </td>
                </tr>
              ) : (
                filtradas.map(c => {
                  const est = ESTADO_CONFIG[c.estado]
                  const dif = c.ultima_diferencia ?? 0
                  const difOk = Math.abs(dif) < 1
                  const dias = diasHasta(c.prox_conciliacion)

                  return (
                    <tr key={c.id} className="hover:bg-ink-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-semibold">{c.nombre}</div>
                            {c.cuit && (
                              <div className="text-2xs text-ink-400 font-mono mt-0.5">{c.cuit}</div>
                            )}
                          </div>
                          {c.alerta_semanal && (
                            <span title="Alerta semanal activa — Cat. A">
                              <Bell size={12} className="text-warn" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {c.categoria ? (
                          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded font-mono ${CAT_COLORS[c.categoria]}`}>
                            {c.categoria}
                          </span>
                        ) : <span className="text-ink-300">—</span>}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-xs text-ink-500">{c.sociedad ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-0.5 rounded-full ${est.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />
                          {est.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {c.prox_conciliacion ? (
                          <div>
                            <div className={`text-xs font-semibold ${
                              dias !== null && dias < 0 ? "text-danger" :
                              dias !== null && dias <= 7 ? "text-warn" :
                              "text-ink-600"
                            }`}>
                              {formatFecha(c.prox_conciliacion)}
                            </div>
                            {dias !== null && (
                              <div className="text-2xs text-ink-400">
                                {dias < 0 ? `Venció hace ${Math.abs(dias)} días` :
                                 dias === 0 ? "Vence hoy" :
                                 `En ${dias} días`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-300 text-xs">
                            {c.categoria === "E" || c.categoria === "F" ? "Manual" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {c.ultima_conciliacion ? (
                          <span className="text-xs text-ink-500">
                            {formatFecha(c.ultima_conciliacion)}
                          </span>
                        ) : (
                          <span className="text-ink-300 text-xs">Sin conciliaciones</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right hidden md:table-cell">
                        {c.ultima_diferencia !== null ? (
                          <span className={`text-xs font-mono font-semibold ${difOk ? "text-ok" : "text-warn"}`}>
                            {difOk ? "✓ $0" : `$${Math.abs(dif).toLocaleString("es-AR")}`}
                          </span>
                        ) : (
                          <span className="text-ink-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={c.total_conciliaciones > 0
                            ? `/conciliaciones?contraparte=${c.id}`
                            : `/nueva?contraparte=${c.id}`}
                          className="btn btn-secondary text-2xs py-1 px-2"
                        >
                          {c.estado === "conciliada" ? "Ver" : "Conciliar"}
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, total, color, barColor, icon, onClick, activo }: {
  label: string; value: number; total: number; color: string; barColor: string
  icon: React.ReactNode; onClick: () => void; activo: boolean
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <button
      onClick={onClick}
      className={`panel p-4 text-left transition-all hover:shadow-md ${activo ? "ring-2 ring-accent" : ""}`}
    >
      <div className={`flex items-center gap-1.5 text-2xs uppercase tracking-wider ${color}`}>
        {icon} {label}
      </div>
      <div className={`text-2xl font-semibold num mt-1 ${color}`}>{value}</div>
      <div className="text-2xs text-ink-400 mt-0.5">{pct}% del total</div>
      <div className="h-1 bg-ink-100 rounded-full overflow-hidden mt-2">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  )
}