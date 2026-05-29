"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import Link from "next/link"
import {
  CheckCircle2, AlertCircle, Clock, TrendingUp,
  Building2, Search, Download, Bell
} from "lucide-react"
import CategoriaBadge, { CAT_FREQ } from "@/components/CategoriaBadge"
import { calcularEstado, tieneAlertaSemanal, compararUrgencia } from "@/lib/estado-cuenta"

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
  ultima_conc_id: string | null
  ultima_conc_estado: string | null
  ultima_diferencia: number | null
  estado: "conciliada" | "pendiente" | "vencida" | "sin_iniciar"
  alerta_semanal: boolean
}

const ESTADO_CONFIG = {
  conciliada: { label: "Conciliada", color: "bg-ok-light text-ok", dot: "bg-ok" },
  pendiente: { label: "Pendiente", color: "bg-warn-light text-warn", dot: "bg-warn" },
  vencida: { label: "Vencida", color: "bg-danger-light text-danger", dot: "bg-danger" },
  sin_iniciar: { label: "Sin iniciar", color: "bg-ink-100 text-ink-500", dot: "bg-ink-300" },
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
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase
        .rpc("get_cuentas_supervision")

      if (error) { console.error("get_cuentas_supervision:", error); setLoading(false); return }

      const items: CuentaEstado[] = (data ?? []).map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit,
        tipo: c.tipo,
        categoria: c.categoria,
        sociedad: c.sociedad,
        activo: c.activo ?? true,
        prox_conciliacion: c.prox_conciliacion,
        prox_alerta: c.prox_alerta,
        total_conciliaciones: Number(c.total_conciliaciones),
        ultima_conciliacion: c.ultima_created_at ?? null,
        ultima_conc_id: c.ultima_id ?? null,
        ultima_conc_estado: c.ultima_estado ?? null,
        ultima_diferencia: c.ultima_diferencia_ars ?? null,
        estado: calcularEstado({
          ultima_conciliacion: c.ultima_created_at ?? null,
          prox_conciliacion: c.prox_conciliacion,
          categoria: c.categoria,
        }),
        alerta_semanal: tieneAlertaSemanal(c.categoria, c.prox_alerta),
      }))

      items.sort(compararUrgencia)
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

  async function exportarExcel() {
    if (filtradas.length === 0) return
    setExportando(true)
    try {
      const XLSX = await import("xlsx")

      const wb = XLSX.utils.book_new()

      // === HOJA 1: Resumen del mes ===
      const resumenData = [
        ["TABLERO DE CIERRE — " + mesLabel.toUpperCase()],
        ["Generado el " + hoy.toLocaleString("es-AR")],
        [],
        ["", "Cantidad", "% del total"],
        ["Conciliadas",  kpis.conciliadas,  kpis.total > 0 ? Math.round(kpis.conciliadas / kpis.total * 100) + "%" : "—"],
        ["Pendientes",   kpis.pendientes,   kpis.total > 0 ? Math.round(kpis.pendientes  / kpis.total * 100) + "%" : "—"],
        ["Vencidas",     kpis.vencidas,     kpis.total > 0 ? Math.round(kpis.vencidas    / kpis.total * 100) + "%" : "—"],
        ["Sin iniciar",  kpis.sin_iniciar,  kpis.total > 0 ? Math.round(kpis.sin_iniciar / kpis.total * 100) + "%" : "—"],
        [],
        ["TOTAL CUENTAS ACTIVAS", kpis.total],
        ["AVANCE DEL MES", kpis.total > 0 ? Math.round(kpis.conciliadas / kpis.total * 100) + "%" : "0%"],
        [],
        ["Filtros aplicados"],
        ["Estado",    filtroEstado    || "Todos"],
        ["Categoría", filtroCategoria || "Todas"],
        ["Sociedad",  filtroSociedad  || "Todas"],
        ["Búsqueda",  busqueda        || "—"],
        ["Cuentas en este reporte", filtradas.length],
      ]

      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData)
      wsResumen["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen")

      // === HOJA 2: Detalle de cuentas (con filtros activos) ===
      const ESTADO_LABEL: Record<string, string> = {
        conciliada: "Conciliada",
        pendiente: "Pendiente",
        vencida: "Vencida",
        sin_iniciar: "Sin iniciar",
      }

      const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)

      const headers = [
        "Cuenta", "CUIT", "Categoría", "Sociedad",
        "Estado", "Alerta semanal",
        "Próx. vencimiento", "Días para vencer",
        "Última conciliación", "Última diferencia ARS",
        "Total conciliaciones",
      ]

      const filas = filtradas.map(c => {
        const dias = c.prox_conciliacion
          ? Math.ceil((new Date(c.prox_conciliacion).getTime() - hoy0.getTime()) / 86400000)
          : null
        return [
          c.nombre,
          c.cuit ?? "",
          c.categoria ?? "",
          c.sociedad ?? "",
          ESTADO_LABEL[c.estado] ?? c.estado,
          c.alerta_semanal ? "SÍ" : "No",
          c.prox_conciliacion ? new Date(c.prox_conciliacion).toLocaleDateString("es-AR") : "",
          dias !== null ? dias : "",
          c.ultima_conciliacion ? new Date(c.ultima_conciliacion).toLocaleDateString("es-AR") : "Sin conciliaciones",
          c.ultima_diferencia !== null ? c.ultima_diferencia : "",
          c.total_conciliaciones,
        ]
      })

      const wsDetalle = XLSX.utils.aoa_to_sheet([headers, ...filas])
      wsDetalle["!cols"] = [
        { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
        { wch: 16 }, { wch: 14 },
        { wch: 18 }, { wch: 14 },
        { wch: 20 }, { wch: 22 },
        { wch: 18 },
      ]
      XLSX.utils.book_append_sheet(wb, wsDetalle, "Cuentas")

      // === HOJA 3: Solo vencidas (si hay) ===
      const vencidas = filtradas.filter(c => c.estado === "vencida")
      if (vencidas.length > 0) {
        const filasVenc = vencidas.map(c => [
          c.nombre, c.cuit ?? "", c.categoria ?? "", c.sociedad ?? "",
          c.prox_conciliacion ? new Date(c.prox_conciliacion).toLocaleDateString("es-AR") : "",
          c.ultima_conciliacion ? new Date(c.ultima_conciliacion).toLocaleDateString("es-AR") : "Sin conciliaciones",
          c.ultima_diferencia !== null ? c.ultima_diferencia : "",
        ])
        const wsVenc = XLSX.utils.aoa_to_sheet([
          ["Cuenta", "CUIT", "Categoría", "Sociedad", "Venció el", "Última conc.", "Última diferencia ARS"],
          ...filasVenc
        ])
        wsVenc["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 22 }]
        XLSX.utils.book_append_sheet(wb, wsVenc, "Vencidas")
      }

      // Descargar
      const fecha = hoy.toISOString().slice(0, 10)
      XLSX.writeFile(wb, `tablero_${mesLabel.replace(/\s+/g, "_").toLowerCase()}_${fecha}.xlsx`)
    } catch (e) {
      console.error("Error al exportar:", e)
    } finally {
      setExportando(false)
    }
  }

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
          onClick={exportarExcel}
          disabled={exportando || filtradas.length === 0}
          className="btn btn-secondary disabled:opacity-40"
        >
          <Download size={14} />
          {exportando ? "Exportando…" : `Exportar Excel${filtradas.length !== cuentas.length ? ` (${filtradas.length})` : ""}`}
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
                        {c.categoria
                          ? <CategoriaBadge categoria={c.categoria} />
                          : <span className="text-ink-300">—</span>
                        }
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
                        <div className="flex items-center gap-1.5">
                          {!c.ultima_conc_id && (
                            <Link href={`/nueva?contraparte=${c.id}`} className="btn btn-primary text-2xs py-1 px-2">
                              + Conciliar
                            </Link>
                          )}
                          {c.ultima_conc_id && (c.ultima_conc_estado === "en_proceso" || c.ultima_conc_estado === "borrador" || c.ultima_conc_estado === "finalizada" || c.ultima_conc_estado === "reabierto") && (
                            <Link href={`/conciliaciones/${c.ultima_conc_id}`} className="btn btn-secondary text-2xs py-1 px-2 text-warn border-warn/30">
                              Cerrar →
                            </Link>
                          )}
                          {c.ultima_conc_id && c.ultima_conc_estado === "cerrado_operativo" && (
                            <Link href={`/conciliaciones/${c.ultima_conc_id}`} className="btn btn-secondary text-2xs py-1 px-2 text-ok border-ok/30">
                              Aprobar →
                            </Link>
                          )}
                          {c.ultima_conc_id && c.ultima_conc_estado === "aprobado" && (
                            <Link href={`/conciliaciones/${c.ultima_conc_id}`} className="btn btn-secondary text-2xs py-1 px-2">
                              Ver ✓
                            </Link>
                          )}
                          {c.ultima_conc_id && !["en_proceso","borrador","finalizada","reabierto","cerrado_operativo","aprobado"].includes(c.ultima_conc_estado ?? "") && (
                            <Link href={`/conciliaciones/${c.ultima_conc_id}`} className="btn btn-secondary text-2xs py-1 px-2">
                              Ver
                            </Link>
                          )}
                        </div>
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
