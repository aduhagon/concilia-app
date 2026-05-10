"use client"

import { useMemo, useState } from "react"
import type { MovimientoResultado } from "@/types"
import { Search, X, Filter, ArrowUpDown } from "lucide-react"

type Props = {
  movs: MovimientoResultado[]
}

type Orden = {
  campo: "fecha" | "tipo" | "comprobante" | "clave" | "ars" | "usd" | "dif"
  asc: boolean
}

export default function TablaConFiltros({ movs }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [origen, setOrigen] = useState<"todos" | "compania" | "contraparte">("todos")
  const [moneda, setMoneda] = useState<"todas" | "ARS" | "USD">("todas")
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos")
  const [fechaDesde, setFechaDesde] = useState<string>("")
  const [fechaHasta, setFechaHasta] = useState<string>("")
  const [importeMin, setImporteMin] = useState<string>("")
  const [importeMax, setImporteMax] = useState<string>("")
  const [orden, setOrden] = useState<Orden>({ campo: "fecha", asc: true })
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)

  // Lista de tipos únicos para el dropdown
  const tipos = useMemo(() => {
    const s = new Set<string>()
    for (const m of movs) if (m.tipo_original) s.add(m.tipo_original)
    return Array.from(s).sort()
  }, [movs])

  // Aplicar filtros
  const filtrados = useMemo(() => {
    let r = movs
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      r = r.filter((m) =>
        m.tipo_original?.toLowerCase().includes(q) ||
        m.comprobante_raw?.toLowerCase().includes(q) ||
        m.clave_calculada?.toLowerCase().includes(q) ||
        m.descripcion?.toLowerCase().includes(q) ||
        String(m.importe_ars).includes(q) ||
        String(m.importe_usd).includes(q)
      )
    }
    if (origen !== "todos") r = r.filter((m) => m.origen === origen)
    if (moneda !== "todas") r = r.filter((m) => m.moneda === moneda)
    if (tipoFiltro !== "todos") r = r.filter((m) => m.tipo_original === tipoFiltro)
    if (fechaDesde) {
      const d = new Date(fechaDesde)
      r = r.filter((m) => m.fecha && m.fecha >= d)
    }
    if (fechaHasta) {
      const d = new Date(fechaHasta)
      d.setHours(23, 59, 59)
      r = r.filter((m) => m.fecha && m.fecha <= d)
    }
    if (importeMin) {
      const n = parseFloat(importeMin)
      if (!isNaN(n)) r = r.filter((m) => Math.abs(m.importe_ars) >= n)
    }
    if (importeMax) {
      const n = parseFloat(importeMax)
      if (!isNaN(n)) r = r.filter((m) => Math.abs(m.importe_ars) <= n)
    }

    // Ordenar
    const ord = [...r].sort((a, b) => {
      let va: string | number = ""
      let vb: string | number = ""
      switch (orden.campo) {
        case "fecha": va = a.fecha?.getTime() ?? 0; vb = b.fecha?.getTime() ?? 0; break
        case "tipo": va = a.tipo_original ?? ""; vb = b.tipo_original ?? ""; break
        case "comprobante": va = a.comprobante_raw ?? ""; vb = b.comprobante_raw ?? ""; break
        case "clave": va = a.clave_calculada ?? ""; vb = b.clave_calculada ?? ""; break
        case "ars": va = a.importe_ars; vb = b.importe_ars; break
        case "usd": va = a.importe_usd; vb = b.importe_usd; break
        case "dif": va = Math.abs(a.diferencia_ars ?? 0); vb = Math.abs(b.diferencia_ars ?? 0); break
      }
      if (va < vb) return orden.asc ? -1 : 1
      if (va > vb) return orden.asc ? 1 : -1
      return 0
    })

    return ord
  }, [movs, busqueda, origen, moneda, tipoFiltro, fechaDesde, fechaHasta, importeMin, importeMax, orden])

  function limpiar() {
    setBusqueda("")
    setOrigen("todos")
    setMoneda("todas")
    setTipoFiltro("todos")
    setFechaDesde("")
    setFechaHasta("")
    setImporteMin("")
    setImporteMax("")
  }

  const filtrosActivos =
    !!busqueda || origen !== "todos" || moneda !== "todas" || tipoFiltro !== "todos" ||
    !!fechaDesde || !!fechaHasta || !!importeMin || !!importeMax

  function ordenar(campo: Orden["campo"]) {
    setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))
  }

  // Totales para mostrar
  const totalArs = filtrados.reduce((acc, m) => acc + (m.importe_ars || 0), 0)
  const totalUsd = filtrados.reduce((acc, m) => acc + (m.importe_usd || 0), 0)

  if (movs.length === 0) {
    return <div className="text-sm text-ink-400 text-center py-8">Sin movimientos en esta categoría</div>
  }

  return (
    <div className="space-y-3">
      {/* Barra de búsqueda + toggle filtros */}
      <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por tipo, comprobante, clave, descripción o importe..."
            className="input pl-9 w-full"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setFiltrosAbiertos((x) => !x)}
          className={`btn ${filtrosAbiertos || filtrosActivos ? "btn-primary" : "btn-secondary"}`}
        >
          <Filter size={14} />
          Filtros {filtrosActivos && `(${[busqueda, origen !== "todos" && "1", moneda !== "todas" && "1", tipoFiltro !== "todos" && "1", fechaDesde && "1", fechaHasta && "1", importeMin && "1", importeMax && "1"].filter(Boolean).length})`}
        </button>

        {filtrosActivos && (
          <button onClick={limpiar} className="btn btn-ghost text-error">
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* Panel de filtros */}
      {filtrosAbiertos && (
        <div className="card-tight grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="label">Origen</label>
            <select value={origen} onChange={(e) => setOrigen(e.target.value as typeof origen)} className="input text-xs">
              <option value="todos">Todos</option>
              <option value="compania">Compañía</option>
              <option value="contraparte">Contraparte</option>
            </select>
          </div>
          <div>
            <label className="label">Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as typeof moneda)} className="input text-xs">
              <option value="todas">Todas</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Tipo de movimiento</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="input text-xs">
              <option value="todos">Todos los tipos</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="input text-xs" />
          </div>
          <div>
            <label className="label">Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="input text-xs" />
          </div>
          <div>
            <label className="label">Importe ARS mín.</label>
            <input type="number" value={importeMin} onChange={(e) => setImporteMin(e.target.value)} className="input text-xs" placeholder="0" />
          </div>
          <div>
            <label className="label">Importe ARS máx.</label>
            <input type="number" value={importeMax} onChange={(e) => setImporteMax(e.target.value)} className="input text-xs" placeholder="∞" />
          </div>
        </div>
      )}

      {/* Contador + totales */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
        <span className="text-ink-500">
          Mostrando <span className="font-medium text-ink-900">{filtrados.length}</span> de {movs.length}
        </span>
        <span className="text-ink-500 flex gap-4">
          <span>Total ARS: <span className="num font-medium text-ink-900">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          {totalUsd !== 0 && (
            <span>Total USD: <span className="num font-medium text-ink-900">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          )}
        </span>
      </div>

      {/* Tabla */}
      <div className="card-tight overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Origen</th>
              <ThOrd label="Fecha" campo="fecha" orden={orden} onClick={ordenar} />
              <ThOrd label="Tipo" campo="tipo" orden={orden} onClick={ordenar} />
              <ThOrd label="Comp." campo="comprobante" orden={orden} onClick={ordenar} />
              <ThOrd label="Clave" campo="clave" orden={orden} onClick={ordenar} />
              <ThOrd label="ARS" campo="ars" orden={orden} onClick={ordenar} alignRight />
              <ThOrd label="USD" campo="usd" orden={orden} onClick={ordenar} alignRight />
              <th>Mon.</th>
              <ThOrd label="Dif ARS" campo="dif" orden={orden} onClick={ordenar} alignRight />
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, 500).map((m) => (
              <tr key={m.id_unico}>
                <td>
                  <span className={`badge ${m.origen === "compania" ? "badge-ink" : "badge-ok"}`}>
                    {m.origen === "compania" ? "C" : "X"}
                  </span>
                </td>
                <td className="text-xs">{m.fecha?.toISOString().slice(0, 10) ?? ""}</td>
                <td className="text-xs truncate max-w-[180px]" title={m.tipo_original}>{m.tipo_original}</td>
                <td className="font-mono text-2xs truncate max-w-[120px]">{m.comprobante_raw}</td>
                <td className="font-mono text-2xs text-accent truncate max-w-[120px]">{m.clave_calculada ?? ""}</td>
                <td className="num text-right text-xs">{m.importe_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                <td className="num text-right text-xs">{m.importe_usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                <td className="text-2xs">{m.moneda ?? ""}</td>
                <td className={`num text-right text-xs ${m.diferencia_ars && Math.abs(m.diferencia_ars) > 1 ? "text-amber-700" : ""}`}>
                  {m.diferencia_ars?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length > 500 && (
          <div className="text-xs text-ink-400 text-center py-2 border-t border-ink-100">
            Mostrando 500 de {filtrados.length} filtrados — descargá el Excel para ver todo
          </div>
        )}
      </div>
    </div>
  )
}

function ThOrd({
  label, campo, orden, onClick, alignRight,
}: { label: string; campo: Orden["campo"]; orden: Orden; onClick: (c: Orden["campo"]) => void; alignRight?: boolean }) {
  const activo = orden.campo === campo
  return (
    <th className={alignRight ? "text-right" : ""}>
      <button
        onClick={() => onClick(campo)}
        className={`inline-flex items-center gap-1 ${alignRight ? "flex-row-reverse" : ""} hover:text-accent transition-colors`}
      >
        {label}
        <ArrowUpDown size={10} className={activo ? "text-accent" : "text-ink-300"} />
      </button>
    </th>
  )
}
