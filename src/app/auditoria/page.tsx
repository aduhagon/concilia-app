"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { ShieldCheck, Search, Download } from "lucide-react"

type RegistroAuditoria = {
  id: number
  usuario_email: string | null
  accion: string
  tabla_afectada: string | null
  registro_id: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  observacion: string | null
  created_at: string
}

const ACCION_LABEL: Record<string, string> = {
  login:                  "Inicio de sesión",
  logout:                 "Cierre de sesión",
  conciliacion_creada:    "Conciliación creada",
  conciliacion_estado:    "Cambio de estado",
  conciliacion_exportada: "Exportación",
  match_manual:           "Match manual",
  match_anulado:          "Match anulado",
  plantilla_creada:       "Plantilla creada",
  plantilla_modificada:   "Plantilla modificada",
  ajuste_creado:          "Ajuste creado",
  ajuste_eliminado:       "Ajuste eliminado",
}

const ACCION_COLOR: Record<string, string> = {
  conciliacion_creada:    "bg-green-50 text-green-800",
  conciliacion_estado:    "bg-blue-50 text-blue-800",
  conciliacion_exportada: "bg-purple-50 text-purple-800",
  match_manual:           "bg-amber-50 text-amber-800",
  match_anulado:          "bg-red-50 text-red-800",
  plantilla_modificada:   "bg-orange-50 text-orange-800",
  plantilla_creada:       "bg-teal-50 text-teal-800",
  login:                  "bg-gray-100 text-gray-600",
  logout:                 "bg-gray-100 text-gray-600",
}

function formatFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtroAccion, setFiltroAccion] = useState("")
  const [detalle, setDetalle] = useState<RegistroAuditoria | null>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from("auditoria")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
    setRegistros(data ?? [])
    setCargando(false)
  }

  const filtrados = registros.filter(r => {
    const matchBusqueda = !busqueda ||
      r.usuario_email?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.registro_id?.includes(busqueda) ||
      r.observacion?.toLowerCase().includes(busqueda.toLowerCase())
    const matchAccion = !filtroAccion || r.accion === filtroAccion
    return matchBusqueda && matchAccion
  })

  function exportarCSV() {
    const cols = ["id", "fecha", "usuario", "accion", "tabla", "registro_id", "observacion"]
    const filas = filtrados.map(r => [
      r.id,
      formatFecha(r.created_at),
      r.usuario_email ?? "",
      r.accion,
      r.tabla_afectada ?? "",
      r.registro_id ?? "",
      r.observacion ?? "",
    ])
    const csv = [cols, ...filas].map(f => f.map(v => `"${v}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const accionesUnicas = [...new Set(registros.map(r => r.accion))].sort()

  return (
    <div className="px-6 py-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-ink-500" />
          <h1 className="text-lg font-medium text-ink-900">Log de auditoría</h1>
          <span className="text-sm text-ink-400 ml-1">({filtrados.length} registros)</span>
        </div>
        <button
          onClick={exportarCSV}
          className="flex items-center gap-1.5 text-sm text-ink-600 border border-ink-200 rounded-md px-3 py-1.5 hover:bg-ink-50 transition"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-ink-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Buscar por usuario, ID, observación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="text-sm border border-ink-200 rounded-md px-3 py-2 bg-white focus:outline-none"
          value={filtroAccion}
          onChange={e => setFiltroAccion(e.target.value)}
        >
          <option value="">Todas las acciones</option>
          {accionesUnicas.map(a => (
            <option key={a} value={a}>{ACCION_LABEL[a] ?? a}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      {cargando ? (
        <p className="text-sm text-ink-400">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-ink-400">Sin registros.</p>
      ) : (
        <div className="border border-ink-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600 w-40">Fecha</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600 w-44">Usuario</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600 w-44">Acción</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Tabla / ID</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Observación</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-ink-100 hover:bg-ink-50 cursor-pointer transition ${i % 2 === 0 ? "" : "bg-ink-50/40"}`}
                  onClick={() => setDetalle(r)}
                >
                  <td className="px-4 py-2.5 text-ink-500 text-xs font-mono whitespace-nowrap">
                    {formatFecha(r.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700 truncate max-w-0 w-44">
                    {r.usuario_email ?? <span className="text-ink-400 italic">anónimo</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ACCION_COLOR[r.accion] ?? "bg-gray-100 text-gray-600"}`}>
                      {ACCION_LABEL[r.accion] ?? r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-500 text-xs font-mono">
                    {r.tabla_afectada && <span className="text-ink-700">{r.tabla_afectada}</span>}
                    {r.registro_id && <span className="text-ink-400 ml-1">#{r.registro_id.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-500 text-xs truncate max-w-xs">
                    {r.observacion ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-400 text-xs text-right">
                    ver
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel de detalle */}
      {detalle && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1 ${ACCION_COLOR[detalle.accion] ?? "bg-gray-100 text-gray-600"}`}>
                  {ACCION_LABEL[detalle.accion] ?? detalle.accion}
                </span>
                <p className="text-xs text-ink-400 font-mono">{formatFecha(detalle.created_at)}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-ink-400 hover:text-ink-700 text-lg leading-none">×</button>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-500">Usuario</dt>
              <dd className="text-ink-800">{detalle.usuario_email ?? "—"}</dd>
              <dt className="text-ink-500">Tabla</dt>
              <dd className="text-ink-800 font-mono">{detalle.tabla_afectada ?? "—"}</dd>
              <dt className="text-ink-500">ID registro</dt>
              <dd className="text-ink-800 font-mono text-xs">{detalle.registro_id ?? "—"}</dd>
              {detalle.observacion && <>
                <dt className="text-ink-500">Observación</dt>
                <dd className="text-ink-800">{detalle.observacion}</dd>
              </>}
            </dl>

            {(detalle.valor_anterior || detalle.valor_nuevo) && (
              <div className="space-y-2">
                {detalle.valor_anterior && (
                  <div>
                    <p className="text-xs font-medium text-ink-500 mb-1">Antes</p>
                    <pre className="text-xs bg-red-50 text-red-800 rounded-md p-3 overflow-auto max-h-32">
                      {JSON.stringify(detalle.valor_anterior, null, 2)}
                    </pre>
                  </div>
                )}
                {detalle.valor_nuevo && (
                  <div>
                    <p className="text-xs font-medium text-ink-500 mb-1">Después</p>
                    <pre className="text-xs bg-green-50 text-green-800 rounded-md p-3 overflow-auto max-h-32">
                      {JSON.stringify(detalle.valor_nuevo, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
