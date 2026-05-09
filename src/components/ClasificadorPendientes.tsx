"use client"

import { useState, useMemo } from "react"
import type { MovimientoResultado, ClasificacionPendientes, StatusPendiente } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Search, CheckSquare, Square, Tag } from "lucide-react"

type Props = {
  pendientes: MovimientoResultado[]
  clasificacion: ClasificacionPendientes
  onChange: (c: ClasificacionPendientes) => void
}

const STATUS_COMPANIA: StatusPendiente[] = ["posterior_msu", "no_contraparte", "arrastre"]
const STATUS_CONTRAPARTE: StatusPendiente[] = ["pendiente_msu", "posterior_contraparte", "arrastre"]
const STATUS_TODOS: StatusPendiente[] = ["posterior_msu", "pendiente_msu", "posterior_contraparte", "no_contraparte", "arrastre"]

export default function ClasificadorPendientes({ pendientes, clasificacion, onChange }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "compania" | "contraparte">("todos")
  const [soloSinClasif, setSoloSinClasif] = useState(false)

  // Selección por checkbox
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [statusAplicar, setStatusAplicar] = useState<StatusPendiente | "">("")

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

  // Toggle individual
  function toggle(id: string) {
    const s = new Set(seleccionados)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSeleccionados(s)
  }

  // Toggle todos los visibles (filtrados)
  function toggleTodos() {
    const todosSeleccionados = filtrados.every((m) => seleccionados.has(m.id_unico))
    const s = new Set(seleccionados)
    if (todosSeleccionados) {
      filtrados.forEach((m) => s.delete(m.id_unico))
    } else {
      filtrados.forEach((m) => s.add(m.id_unico))
    }
    setSeleccionados(s)
  }

  // Aplicar el status seleccionado a TODOS los marcados
  function aplicarStatus() {
    if (!statusAplicar || seleccionados.size === 0) return
    const c = { ...clasificacion }
    for (const id of seleccionados) {
      // Validar que el status sea coherente con el origen del movimiento
      const m = pendientes.find((x) => x.id_unico === id)
      if (!m) continue
      const validos = m.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
      if (!validos.includes(statusAplicar)) continue
      c[id] = statusAplicar
    }
    onChange(c)
    setSeleccionados(new Set())  // limpiar selección después de aplicar
  }

  // Limpiar el status (volver a "sin clasificar") de los seleccionados
  function limpiarSeleccionados() {
    if (seleccionados.size === 0) return
    const c = { ...clasificacion }
    for (const id of seleccionados) delete c[id]
    onChange(c)
    setSeleccionados(new Set())
  }

  // Cambiar individual (sigue funcionando para casos sueltos)
  function setStatusIndividual(id: string, status: StatusPendiente | null) {
    const c = { ...clasificacion }
    if (status === null) delete c[id]
    else c[id] = status
    onChange(c)
  }

  const sinClasif = pendientes.filter((m) => !clasificacion[m.id_unico]).length
  const todosVisiblesSeleccionados = filtrados.length > 0 && filtrados.every((m) => seleccionados.has(m.id_unico))

  // Status válidos según selección actual
  // Si todos los seleccionados son del mismo lado, mostrar solo los válidos para ese lado
  const statusDisponibles = useMemo(() => {
    if (seleccionados.size === 0) return STATUS_TODOS
    const origenes = new Set<string>()
    for (const id of seleccionados) {
      const m = pendientes.find((x) => x.id_unico === id)
      if (m) origenes.add(m.origen)
    }
    if (origenes.size === 1) {
      const o = Array.from(origenes)[0]
      return o === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
    }
    // Mezcla: solo "arrastre" es común a ambos lados
    return ["arrastre"] as StatusPendiente[]
  }, [seleccionados, pendientes])

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
            Tildá los que querés clasificar, elegí el status y aplicá. También podés cambiar uno solo desde el selector de cada fila.
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

      {/* Filtros */}
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
        <label className="flex items-center gap-2 px-3 text-xs whitespace-nowrap">
          <input type="checkbox" checked={soloSinClasif} onChange={(e) => setSoloSinClasif(e.target.checked)} />
          Solo sin clasificar
        </label>
      </div>

      {/* Barra de acción masiva */}
      <div className={`border rounded-md p-3 transition-colors ${
        seleccionados.size > 0 ? "border-accent bg-accent-light" : "border-ink-200 bg-ink-50"
      }`}>
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Tag size={14} className={seleccionados.size > 0 ? "text-accent" : "text-ink-400"} />
            <span className="text-xs font-medium">
              {seleccionados.size === 0
                ? "Tildá filas para acción masiva"
                : `${seleccionados.size} seleccionado${seleccionados.size !== 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex-1" />
          <select
            value={statusAplicar}
            onChange={(e) => setStatusAplicar(e.target.value as StatusPendiente | "")}
            className="input text-xs md:w-64"
            disabled={seleccionados.size === 0}
          >
            <option value="">— elegí status —</option>
            {statusDisponibles.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={aplicarStatus}
            disabled={seleccionados.size === 0 || !statusAplicar}
            className="btn btn-primary disabled:opacity-40 whitespace-nowrap"
          >
            Aplicar clasificación
          </button>
          {seleccionados.size > 0 && (
            <button
              onClick={limpiarSeleccionados}
              className="btn btn-ghost text-error text-xs whitespace-nowrap"
            >
              Quitar status
            </button>
          )}
        </div>
        {seleccionados.size > 0 && statusDisponibles.length === 1 && statusDisponibles[0] === "arrastre" && (
          <div className="text-2xs text-amber-700 mt-2">
            ⚠ Estás mezclando movimientos de los dos lados. Solo el status "Arrastre" aplica a ambos. Filtrá por origen para ver más opciones.
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border border-ink-200 rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-ink-50 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 w-8">
                <button
                  onClick={toggleTodos}
                  className="text-ink-700 hover:text-accent"
                  title={todosVisiblesSeleccionados ? "Deseleccionar todos" : "Seleccionar todos los visibles"}
                >
                  {todosVisiblesSeleccionados
                    ? <CheckSquare size={14} className="text-accent" />
                    : <Square size={14} />}
                </button>
              </th>
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
            {filtrados.slice(0, 500).map((m) => {
              const status = clasificacion[m.id_unico]
              const opciones = m.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
              const tildado = seleccionados.has(m.id_unico)
              return (
                <tr
                  key={m.id_unico}
                  className={`border-t border-ink-100 cursor-pointer hover:bg-ink-50 ${tildado ? "bg-accent-light/40" : ""}`}
                  onClick={(e) => {
                    // Solo togglear si el click no fue sobre el dropdown de status
                    const t = e.target as HTMLElement
                    if (t.tagName !== "SELECT" && t.tagName !== "OPTION") {
                      toggle(m.id_unico)
                    }
                  }}
                >
                  <td className="px-2 py-1">
                    {tildado
                      ? <CheckSquare size={14} className="text-accent" />
                      : <Square size={14} className="text-ink-300" />}
                  </td>
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
                  <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={status ?? ""}
                      onChange={(e) => setStatusIndividual(m.id_unico, (e.target.value || null) as StatusPendiente | null)}
                      className={`input text-xs py-1 px-1 w-full ${!status ? "border-amber-200 bg-amber-50" : "border-accent/30 bg-accent-light"}`}
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
        {filtrados.length > 500 && (
          <div className="text-2xs text-ink-400 text-center py-2 border-t border-ink-200">
            Mostrando 500 de {filtrados.length} — refiná los filtros
          </div>
        )}
      </div>

      {/* Stats abajo */}
      <div className="flex items-center justify-between text-2xs text-ink-500 px-1">
        <span>Mostrando {Math.min(filtrados.length, 500)} de {filtrados.length} filtrados — {pendientes.length} pendientes en total</span>
        {seleccionados.size > 0 && (
          <button onClick={() => setSeleccionados(new Set())} className="text-error hover:underline">
            Limpiar selección
          </button>
        )}
      </div>
    </div>
  )
}
