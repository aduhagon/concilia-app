"use client"

import { useState, useMemo } from "react"
import type { MovimientoResultado, ClasificacionPendientes, StatusPendiente } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Search, X, Tag } from "lucide-react"

type Props = {
  pendientes: MovimientoResultado[]
  clasificacion: ClasificacionPendientes
  onChange: (c: ClasificacionPendientes) => void
}

const STATUS_COMPANIA: StatusPendiente[] = ["posterior_msu", "no_contraparte", "arrastre"]
const STATUS_CONTRAPARTE: StatusPendiente[] = ["pendiente_msu", "posterior_contraparte", "arrastre"]

export default function ClasificadorPendientes({ pendientes, clasificacion, onChange }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "compania" | "contraparte">("todos")
  const [soloSinClasif, setSoloSinClasif] = useState(false)

  const filtrados = useMemo(() => {
    let r = pendientes
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      r = r.filter((m) =>
        m.tipo_original?.toLowerCase().includes(q) ||
        m.comprobante_raw?.toLowerCase().includes(q) ||
        String(m.importe_ars).includes(q)
      )
    }
    if (filtroOrigen !== "todos") r = r.filter((m) => m.origen === filtroOrigen)
    if (soloSinClasif) r = r.filter((m) => !clasificacion[m.id_unico])
    return r
  }, [pendientes, busqueda, filtroOrigen, soloSinClasif, clasificacion])

  function setStatus(id: string, status: StatusPendiente | null) {
    const c = { ...clasificacion }
    if (status === null) delete c[id]
    else c[id] = status
    onChange(c)
  }

  function aplicarMasivo(status: StatusPendiente | null) {
    const c = { ...clasificacion }
    for (const m of filtrados) {
      if (status === null) delete c[m.id_unico]
      else c[m.id_unico] = status
    }
    onChange(c)
  }

  const sinClasif = pendientes.filter((m) => !clasificacion[m.id_unico]).length

  if (pendientes.length === 0) {
    return (
      <div className="card text-center py-8 text-sm text-ink-400">
        No hay pendientes para clasificar
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Clasificación</div>
          <div className="font-serif text-base">Status de pendientes</div>
          <p className="text-xs text-ink-500 mt-0.5">
            Asigná un status a cada pendiente para que se clasifique en su categoría del papel.
          </p>
        </div>
        <div className="text-right">
          {sinClasif > 0 ? (
            <div className="badge badge-warn">{sinClasif} sin clasificar</div>
          ) : (
            <div className="badge badge-ok">Todos clasificados</div>
          )}
        </div>
      </div>

      {/* Filtros + masivo */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            className="input pl-9"
          />
        </div>
        <select
          value={filtroOrigen}
          onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
          className="input md:w-44"
        >
          <option value="todos">Todos los orígenes</option>
          <option value="compania">Solo compañía</option>
          <option value="contraparte">Solo contraparte</option>
        </select>
        <label className="flex items-center gap-2 px-3 text-xs">
          <input type="checkbox" checked={soloSinClasif} onChange={(e) => setSoloSinClasif(e.target.checked)} />
          Solo sin clasificar
        </label>
      </div>

      {/* Aplicar masivo */}
      {filtrados.length > 1 && (
        <div className="flex flex-wrap gap-1.5 items-center px-1 text-2xs">
          <span className="text-ink-500">Aplicar a {filtrados.length} visibles:</span>
          {(filtroOrigen === "compania" ? STATUS_COMPANIA : filtroOrigen === "contraparte" ? STATUS_CONTRAPARTE : [...STATUS_COMPANIA, ...STATUS_CONTRAPARTE.filter(s => !STATUS_COMPANIA.includes(s))]).map((s) => (
            <button
              key={s}
              onClick={() => aplicarMasivo(s)}
              className="px-2 py-0.5 border border-ink-200 rounded hover:border-accent hover:text-accent"
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
          <button
            onClick={() => aplicarMasivo(null)}
            className="px-2 py-0.5 border border-ink-200 rounded text-error hover:bg-red-50"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto border border-ink-200 rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-ink-50">
            <tr>
              <th className="text-left px-2 py-1.5 text-2xs uppercase text-ink-500">Origen</th>
              <th className="text-left px-2 py-1.5 text-2xs uppercase text-ink-500">Fecha</th>
              <th className="text-left px-2 py-1.5 text-2xs uppercase text-ink-500">Tipo</th>
              <th className="text-left px-2 py-1.5 text-2xs uppercase text-ink-500">Comp.</th>
              <th className="text-right px-2 py-1.5 text-2xs uppercase text-ink-500">ARS</th>
              <th className="text-right px-2 py-1.5 text-2xs uppercase text-ink-500">USD</th>
              <th className="text-left px-2 py-1.5 text-2xs uppercase text-ink-500 w-56">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, 200).map((m) => {
              const status = clasificacion[m.id_unico]
              const opciones = m.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
              return (
                <tr key={m.id_unico} className="border-t border-ink-100">
                  <td className="px-2 py-1">
                    <span className={`badge ${m.origen === "compania" ? "badge-ink" : "badge-ok"}`}>
                      {m.origen === "compania" ? "C" : "X"}
                    </span>
                  </td>
                  <td className="px-2 py-1">{m.fecha?.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-1 truncate max-w-[140px]" title={m.tipo_original}>{m.tipo_original}</td>
                  <td className="px-2 py-1 font-mono">{m.comprobante_raw}</td>
                  <td className="px-2 py-1 num text-right">{m.importe_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1 num text-right">{m.importe_usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1">
                    <select
                      value={status ?? ""}
                      onChange={(e) => setStatus(m.id_unico, (e.target.value || null) as StatusPendiente | null)}
                      className={`input text-xs py-1 px-1 ${!status ? "border-amber-200 bg-amber-50" : "border-accent/30 bg-accent-light"}`}
                    >
                      <option value="">— sin clasificar —</option>
                      {opciones.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtrados.length > 200 && (
          <div className="text-2xs text-ink-400 text-center py-2 border-t border-ink-200">
            Mostrando 200 de {filtrados.length} — refiná los filtros
          </div>
        )}
      </div>
    </div>
  )
}
