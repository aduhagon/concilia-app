"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { ArrowRight, Filter } from "lucide-react"

type Cambio = {
  id: string
  contraparte_nombre: string
  contraparte_id: string
  categoria_anterior: string | null
  categoria_nueva: string
  motivo: string | null
  supervisor_nombre: string | null
  created_at: string
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
  A: "Semanal", B: "Mensual", C: "Anual",
  D: "Anual exc.", E: "Manual", F: "Manual",
}

function CatBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-ink-300 text-xs">—</span>
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded font-mono ${CAT_COLORS[cat] ?? "bg-ink-100 text-ink-500"}`}>
      {cat} <span className="font-normal opacity-70">·</span> {CAT_FREQ[cat] ?? ""}
    </span>
  )
}

export default function HistorialCategoriasPage() {
  const [cambios, setCambios] = useState<Cambio[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroContraparte, setFiltroContraparte] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("")

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("historial_categorias")
        .select(`
          id,
          categoria_anterior,
          categoria_nueva,
          motivo,
          created_at,
          contraparte_id,
          contrapartes(nombre),
          usuarios(nombre)
        `)
        .order("created_at", { ascending: false })
        .limit(200)

      const items: Cambio[] = (data ?? []).map((d: any) => ({
        id: d.id,
        contraparte_id: d.contraparte_id,
        contraparte_nombre: d.contrapartes?.nombre ?? "—",
        categoria_anterior: d.categoria_anterior,
        categoria_nueva: d.categoria_nueva,
        motivo: d.motivo,
        supervisor_nombre: d.usuarios?.nombre ?? null,
        created_at: d.created_at,
      }))

      setCambios(items)
      setLoading(false)
    }
    cargar()
  }, [])

  const contrapartes = [...new Set(cambios.map(c => c.contraparte_nombre))].sort()

  const filtrados = cambios.filter(c => {
    if (filtroContraparte && c.contraparte_nombre !== filtroContraparte) return false
    if (filtroCategoria && c.categoria_nueva !== filtroCategoria) return false
    return true
  })

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="border-b border-ink-200 pb-6">
        <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Supervisión</div>
        <h1 className="h-page">Historial de categorías</h1>
        <p className="text-ink-600 mt-2 text-sm max-w-xl">
          Registro de todos los cambios de categoría A–F. Cada cambio registra quién lo hizo, cuándo y el motivo.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-ink-400" />
        <select
          value={filtroContraparte}
          onChange={e => setFiltroContraparte(e.target.value)}
          className="input"
        >
          <option value="">Todas las cuentas</option>
          {contrapartes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="input"
        >
          <option value="">Todas las categorías</option>
          {["A", "B", "C", "D", "E", "F"].map(c => (
            <option key={c} value={c}>Cat. {c} — {CAT_FREQ[c]}</option>
          ))}
        </select>
        {(filtroContraparte || filtroCategoria) && (
          <button
            onClick={() => { setFiltroContraparte(""); setFiltroCategoria("") }}
            className="text-2xs text-ink-500 hover:text-danger underline"
          >
            Limpiar
          </button>
        )}
        <span className="text-2xs text-ink-400 ml-auto font-mono">
          {filtrados.length} registros
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : cambios.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-sm font-semibold text-ink-500">Sin cambios registrados aún</div>
          <p className="text-xs text-ink-400 mt-1">
            Los cambios de categoría quedan registrados automáticamente cuando editás una cuenta.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Cuenta</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Cambio</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Motivo</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Responsable</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtrados.map(c => (
                <tr key={c.id} className="hover:bg-ink-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold">{c.contraparte_nombre}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CatBadge cat={c.categoria_anterior} />
                      <ArrowRight size={13} className="text-ink-400 flex-shrink-0" />
                      <CatBadge cat={c.categoria_nueva} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-ink-500">
                      {c.motivo ?? <span className="text-ink-300 italic">Sin motivo</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-ink-500">{c.supervisor_nombre ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-ink-500">
                      {new Date(c.created_at).toLocaleDateString("es-AR", {
                        day: "numeric", month: "short", year: "numeric"
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}