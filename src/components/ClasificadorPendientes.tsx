"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import type { MovimientoResultado, ClasificacionPendientes, StatusPendiente } from "@/types"
import { STATUS_LABELS } from "@/types"
import { Search, CheckSquare, Square, HelpCircle, Filter, X, Tag, Zap, Calendar } from "lucide-react"
import { useShortcuts } from "@/lib/use-shortcuts"
import { formatNum, antiguedad } from "@/lib/format"
import { useToast } from "@/components/Toast"
import ShortcutHelp from "@/components/ShortcutHelp"

type Props = {
  pendientes: MovimientoResultado[]
  clasificacion: ClasificacionPendientes
  onChange: (c: ClasificacionPendientes) => void
}

// Mapeo de teclas numéricas a status
const ATAJOS_STATUS_CMP: Record<string, StatusPendiente> = {
  "1": "posterior_msu",
  "2": "no_contraparte",
  "3": "arrastre",
}
const ATAJOS_STATUS_CONT: Record<string, StatusPendiente> = {
  "1": "pendiente_msu",
  "2": "posterior_contraparte",
  "3": "arrastre",
}

const STATUS_COMPANIA: StatusPendiente[] = ["posterior_msu", "no_contraparte", "arrastre"]
const STATUS_CONTRAPARTE: StatusPendiente[] = ["pendiente_msu", "posterior_contraparte", "arrastre"]

export default function ClasificadorPendientes({ pendientes, clasificacion, onChange }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "compania" | "contraparte">("todos")
  const [soloSinClasif, setSoloSinClasif] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [activo, setActivo] = useState(0)         // índice en filtrados (cursor de teclado)
  const [showFiltros, setShowFiltros] = useState(false)
  const buscadorRef = useRef<HTMLInputElement>(null)
  const filaActivaRef = useRef<HTMLTableRowElement>(null)

  const toast = useToast()

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

  // Movimiento activo (donde está el cursor)
  const movActivo = filtrados[activo]

  // Cuando cambian los filtrados, resetear el cursor
  useEffect(() => {
    if (activo >= filtrados.length) setActivo(0)
  }, [filtrados.length, activo])

  // Scroll automático cuando se mueve el cursor con teclado
  useEffect(() => {
    filaActivaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activo])

  // Funciones de acción
  function toggle(id: string) {
    const s = new Set(seleccionados)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSeleccionados(s)
  }

  function toggleTodos() {
    const todos = filtrados.every((m) => seleccionados.has(m.id_unico))
    const s = new Set(seleccionados)
    if (todos) filtrados.forEach((m) => s.delete(m.id_unico))
    else filtrados.forEach((m) => s.add(m.id_unico))
    setSeleccionados(s)
  }

  function asignarStatus(status: StatusPendiente, target: "activo" | "seleccionados") {
    const c = { ...clasificacion }
    let n = 0
    if (target === "activo") {
      if (!movActivo) return
      const validos = movActivo.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
      if (!validos.includes(status)) return
      c[movActivo.id_unico] = status
      n = 1
    } else {
      for (const id of seleccionados) {
        const m = pendientes.find((x) => x.id_unico === id)
        if (!m) continue
        const validos = m.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE
        if (!validos.includes(status)) continue
        c[id] = status
        n++
      }
      setSeleccionados(new Set())
    }
    onChange(c)
    toast.show(`${n} clasificado${n !== 1 ? "s" : ""} como ${STATUS_LABELS[status]}`, "ok")
  }

  function limpiarStatus(target: "activo" | "seleccionados") {
    const c = { ...clasificacion }
    let n = 0
    if (target === "activo") {
      if (!movActivo) return
      delete c[movActivo.id_unico]
      n = 1
    } else {
      for (const id of seleccionados) {
        delete c[id]
        n++
      }
      setSeleccionados(new Set())
    }
    onChange(c)
    if (n > 0) toast.show(`${n} status removido${n !== 1 ? "s" : ""}`, "info")
  }

  // === ATAJOS DE TECLADO ===
  useShortcuts(
    [
      { key: "j", description: "Mover cursor abajo", group: "Navegación", handler: () => setActivo((x) => Math.min(x + 1, filtrados.length - 1)) },
      { key: "k", description: "Mover cursor arriba", group: "Navegación", handler: () => setActivo((x) => Math.max(x - 1, 0)) },
      { key: "ArrowDown", description: "Mover cursor abajo", group: "Navegación", handler: () => setActivo((x) => Math.min(x + 1, filtrados.length - 1)) },
      { key: "ArrowUp", description: "Mover cursor arriba", group: "Navegación", handler: () => setActivo((x) => Math.max(x - 1, 0)) },
      { key: "g", description: "Ir al primer movimiento", group: "Navegación", handler: () => setActivo(0) },
      { key: "G", shift: true, description: "Ir al último movimiento", group: "Navegación", handler: () => setActivo(filtrados.length - 1) },
      { key: " ", description: "Tildar / destildar movimiento activo", group: "Selección", handler: () => movActivo && toggle(movActivo.id_unico) },
      { key: "a", ctrl: true, description: "Tildar todos los visibles", group: "Selección", handler: toggleTodos },
      { key: "Escape", description: "Limpiar selección", group: "Selección", handler: () => setSeleccionados(new Set()) },
      { key: "1", description: "Status 1 (Posterior MSU / Pendiente MSU)", group: "Clasificación", handler: () => aplicarAtajoStatus("1") },
      { key: "2", description: "Status 2 (No contraparte / Posterior contraparte)", group: "Clasificación", handler: () => aplicarAtajoStatus("2") },
      { key: "3", description: "Status 3 (Arrastre)", group: "Clasificación", handler: () => aplicarAtajoStatus("3") },
      { key: "0", description: "Quitar status", group: "Clasificación", handler: () => limpiarStatus(seleccionados.size > 0 ? "seleccionados" : "activo") },
      { key: "f", description: "Buscar", group: "General", handler: () => buscadorRef.current?.focus() },
      { key: "?", shift: true, description: "Mostrar atajos", group: "General", handler: () => setShowHelp(true) },
    ],
    true
  )

  function aplicarAtajoStatus(numero: string) {
    if (seleccionados.size > 0) {
      // Modo masivo: aplicar a todos los seleccionados
      // Determinar el status según el origen mayoritario
      let cmp = 0, cont = 0
      for (const id of seleccionados) {
        const m = pendientes.find((x) => x.id_unico === id)
        if (!m) continue
        if (m.origen === "compania") cmp++; else cont++
      }
      const mapa = cmp >= cont ? ATAJOS_STATUS_CMP : ATAJOS_STATUS_CONT
      const status = mapa[numero]
      if (status) asignarStatus(status, "seleccionados")
    } else {
      // Modo individual: aplicar al activo
      if (!movActivo) return
      const mapa = movActivo.origen === "compania" ? ATAJOS_STATUS_CMP : ATAJOS_STATUS_CONT
      const status = mapa[numero]
      if (status) asignarStatus(status, "activo")
    }
  }

  const sinClasif = pendientes.filter((m) => !clasificacion[m.id_unico]).length
  const progreso = pendientes.length > 0 ? Math.round(((pendientes.length - sinClasif) / pendientes.length) * 100) : 100
  const todosVisiblesSeleccionados = filtrados.length > 0 && filtrados.every((m) => seleccionados.has(m.id_unico))

  if (pendientes.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-ink-400">
        No hay pendientes para clasificar
      </div>
    )
  }

  return (
    <>
      <div className="panel">
        {/* Header con progreso */}
        <div className="border-b border-ink-200 px-3 py-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold">Clasificación de pendientes</div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-1 flex-1 max-w-32 bg-ink-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${progreso === 100 ? "bg-ok" : "bg-accent"}`}
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <span className="text-2xs text-ink-500">
                {pendientes.length - sinClasif} / {pendientes.length} ({progreso}%)
              </span>
            </div>
          </div>
          <button onClick={() => setShowHelp(true)} className="btn btn-ghost text-2xs">
            <HelpCircle size={12} /> Atajos <span className="kbd ml-1">?</span>
          </button>
        </div>

        {/* Toolbar de filtros */}
        <div className="border-b border-ink-200 px-3 py-2 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              ref={buscadorRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por tipo, comprobante o importe..."
              className="input pl-7"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                <X size={12} />
              </button>
            )}
            <span className="absolute right-7 top-1/2 -translate-y-1/2 kbd text-2xs">F</span>
          </div>
          <select
            value={filtroOrigen}
            onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
            className="input w-40"
          >
            <option value="todos">Todos los orígenes</option>
            <option value="compania">Compañía</option>
            <option value="contraparte">Contraparte</option>
          </select>
          <button
            onClick={() => setSoloSinClasif((x) => !x)}
            className={`btn ${soloSinClasif ? "btn-primary" : "btn-secondary"}`}
          >
            <Filter size={12} />
            Solo sin clasificar
          </button>
        </div>

        {/* Barra de acción masiva */}
        {seleccionados.size > 0 && (
          <div className="bg-info-light border-b border-info/20 px-3 py-2 flex items-center gap-3 fade-in">
            <Tag size={14} className="text-info" />
            <span className="text-xs font-medium text-info-dark flex-1">
              {seleccionados.size} seleccionado{seleccionados.size !== 1 ? "s" : ""}
            </span>
            <span className="text-2xs text-info-dark/70">
              <span className="kbd">1</span> <span className="kbd">2</span> <span className="kbd">3</span> aplicar  ·
              <span className="kbd ml-2">0</span> quitar  ·
              <span className="kbd ml-2">Esc</span> cancelar
            </span>
            <button onClick={() => setSeleccionados(new Set())} className="btn btn-ghost text-xs">Limpiar</button>
          </div>
        )}

        {/* Tabla densa */}
        <div className="max-h-[calc(100vh-22rem)] overflow-y-auto">
          <table className="tbl-dense">
            <thead>
              <tr>
                <th className="w-8">
                  <button onClick={toggleTodos} className="text-ink-700 hover:text-accent">
                    {todosVisiblesSeleccionados ? <CheckSquare size={12} className="text-accent" /> : <Square size={12} />}
                  </button>
                </th>
                <th className="w-8"></th>
                <th className="w-16">Fecha</th>
                <th>Tipo</th>
                <th className="w-32">Comprobante</th>
                <th className="text-right w-32">ARS</th>
                <th className="text-right w-24">USD</th>
                <th className="w-12">Antig.</th>
                <th className="w-44">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 1000).map((m, idx) => {
                const status = clasificacion[m.id_unico]
                const tildado = seleccionados.has(m.id_unico)
                const isActivo = idx === activo
                return (
                  <tr
                    key={m.id_unico}
                    ref={isActivo ? filaActivaRef : null}
                    className={`${tildado ? "row-selected" : ""} ${isActivo ? "row-active" : ""} cursor-pointer`}
                    onClick={() => { setActivo(idx); toggle(m.id_unico) }}
                  >
                    <td onClick={(e) => { e.stopPropagation(); toggle(m.id_unico) }}>
                      {tildado ? <CheckSquare size={12} className="text-accent" /> : <Square size={12} className="text-ink-300" />}
                    </td>
                    <td>
                      <span className={`pill ${m.origen === "compania" ? "bg-ink-100 text-ink-700" : "bg-info-light text-info-dark"}`}>
                        {m.origen === "compania" ? "C" : "X"}
                      </span>
                    </td>
                    <td className="text-2xs">{m.fecha?.toISOString().slice(0, 10)}</td>
                    <td className="truncate max-w-[200px]" title={m.tipo_original}>{m.tipo_original}</td>
                    <td className="font-mono text-2xs">{m.comprobante_raw}</td>
                    <td className="num text-right">{formatNum(m.importe_ars)}</td>
                    <td className="num text-right">{formatNum(m.importe_usd)}</td>
                    <td className="text-2xs text-ink-500">{antiguedad(m.fecha?.toISOString().slice(0, 10) ?? null)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        value={status ?? ""}
                        onChange={(e) => {
                          const v = e.target.value
                          const c = { ...clasificacion }
                          if (v) c[m.id_unico] = v as StatusPendiente
                          else delete c[m.id_unico]
                          onChange(c)
                        }}
                        className={`input input-sm w-full ${
                          !status ? "border-warn/30 bg-warn-light/50" : "border-ok/30 bg-ok-light/40"
                        }`}
                      >
                        <option value="">— sin clasif —</option>
                        {(m.origen === "compania" ? STATUS_COMPANIA : STATUS_CONTRAPARTE).map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtrados.length > 1000 && (
            <div className="text-2xs text-ink-400 text-center py-2 border-t border-ink-100">
              Mostrando 1000 de {filtrados.length} — refiná los filtros
            </div>
          )}
        </div>

        {/* Footer con stats */}
        <div className="border-t border-ink-200 px-3 py-2 flex items-center justify-between text-2xs text-ink-500">
          <span>{filtrados.length} de {pendientes.length} pendientes visibles</span>
          {sinClasif > 0 && <span className="text-warn">⚠ {sinClasif} sin clasificar</span>}
        </div>
      </div>

      <ShortcutHelp
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        shortcuts={[
          { keys: "J / ↓", description: "Bajar cursor", group: "Navegación" },
          { keys: "K / ↑", description: "Subir cursor", group: "Navegación" },
          { keys: "G", description: "Ir al primero", group: "Navegación" },
          { keys: "Shift + G", description: "Ir al último", group: "Navegación" },
          { keys: "Espacio", description: "Tildar/destildar movimiento activo", group: "Selección" },
          { keys: "Ctrl + A", description: "Tildar todos los visibles", group: "Selección" },
          { keys: "Esc", description: "Limpiar selección", group: "Selección" },
          { keys: "1", description: "Posterior MSU (cmp) / Pendiente MSU (cont)", group: "Clasificación" },
          { keys: "2", description: "No contraparte (cmp) / Posterior contraparte (cont)", group: "Clasificación" },
          { keys: "3", description: "Arrastre", group: "Clasificación" },
          { keys: "0", description: "Quitar status", group: "Clasificación" },
          { keys: "F", description: "Foco en el buscador", group: "General" },
          { keys: "?", description: "Mostrar este panel de ayuda", group: "General" },
        ]}
      />
    </>
  )
}
