"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import Link from "next/link"
import { Clock, FileSpreadsheet, ChevronRight, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Building, Plus } from "lucide-react"

type ConciliacionRow = {
  id: string
  contraparte_id: string
  contraparte_nombre: string
  cuenta_proveedor_id: string | null
  sociedad_nombre: string | null
  cuenta_interna: string | null
  periodo_label: string | null
  diferencia_final_ars: number | null
  estado: string
  created_at: string
}

type CuentaAgrupada = {
  cuenta_proveedor_id: string | null
  sociedad_nombre: string | null
  cuenta_interna: string | null
  conciliaciones: ConciliacionRow[]
}

type ProveedorAgrupado = {
  contraparte_id: string
  contraparte_nombre: string
  cuentas: CuentaAgrupada[]
  total: number
  ultima: string | null
}

type SociedadAgrupada = {
  sociedad_nombre: string
  proveedores: ProveedorAgrupado[]
}

function agrupar(items: ConciliacionRow[]): SociedadAgrupada[] {
  // Primero agrupar por sociedad
  const porSociedad: Record<string, { proveedores: Record<string, { cuentas: Record<string, ConciliacionRow[]> }> }> = {}

  for (const c of items) {
    const soc = c.sociedad_nombre ?? "Sin sociedad asignada"
    const prov = c.contraparte_id
    const cuenta = c.cuenta_proveedor_id ?? "__sin_cuenta__"

    if (!porSociedad[soc]) porSociedad[soc] = { proveedores: {} }
    if (!porSociedad[soc].proveedores[prov]) porSociedad[soc].proveedores[prov] = { cuentas: {} }
    if (!porSociedad[soc].proveedores[prov].cuentas[cuenta]) porSociedad[soc].proveedores[prov].cuentas[cuenta] = []
    porSociedad[soc].proveedores[prov].cuentas[cuenta].push(c)
  }

  // Convertir a array ordenado
  return Object.entries(porSociedad)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sociedad_nombre, { proveedores }]) => ({
      sociedad_nombre,
      proveedores: Object.entries(proveedores)
        .map(([, { cuentas }]) => {
          const todasLasConciliaciones = Object.values(cuentas).flat()
          const primera = todasLasConciliaciones[0]
          return {
            contraparte_id: primera.contraparte_id,
            contraparte_nombre: primera.contraparte_nombre,
            total: todasLasConciliaciones.length,
            ultima: todasLasConciliaciones[0]?.created_at ?? null,
            cuentas: Object.entries(cuentas).map(([cuentaId, concs]) => ({
              cuenta_proveedor_id: cuentaId === "__sin_cuenta__" ? null : cuentaId,
              sociedad_nombre: concs[0]?.sociedad_nombre ?? null,
              cuenta_interna: concs[0]?.cuenta_interna ?? null,
              conciliaciones: concs,
            })),
          }
        })
        .sort((a, b) => a.contraparte_nombre.localeCompare(b.contraparte_nombre)),
    }))
}

export default function HistorialPage() {
  const [items, setItems] = useState<ConciliacionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState("")

  useEffect(() => {
    supabase
      .from("conciliaciones")
      .select(`
        id, contraparte_id, cuenta_proveedor_id, periodo_label,
        diferencia_final_ars, estado, created_at,
        contrapartes(nombre),
        cuentas_proveedor(cuenta_interna, sociedades(nombre))
      `)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const rows: ConciliacionRow[] = (data ?? []).map((c: any) => ({
          id: c.id,
          contraparte_id: c.contraparte_id,
          contraparte_nombre: c.contrapartes?.nombre ?? "—",
          cuenta_proveedor_id: c.cuenta_proveedor_id ?? null,
          sociedad_nombre: c.cuentas_proveedor?.sociedades?.nombre ?? null,
          cuenta_interna: c.cuentas_proveedor?.cuenta_interna ?? null,
          periodo_label: c.periodo_label,
          diferencia_final_ars: c.diferencia_final_ars,
          estado: c.estado,
          created_at: c.created_at,
        }))
        setItems(rows)
        setLoading(false)
      })
  }, [])

  function toggleExpandido(key: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const agrupado = agrupar(items)

  const filtrado = filtro.trim()
    ? agrupado.map(soc => ({
        ...soc,
        proveedores: soc.proveedores.filter(p =>
          p.contraparte_nombre.toLowerCase().includes(filtro.toLowerCase()) ||
          soc.sociedad_nombre.toLowerCase().includes(filtro.toLowerCase())
        ),
      })).filter(soc => soc.proveedores.length > 0)
    : agrupado

  const totalConciliaciones = items.length

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Historial</div>
          <h1 className="h-page">Conciliaciones anteriores</h1>
          {!loading && (
            <p className="text-ink-600 mt-1 text-sm">
              {totalConciliaciones} conciliación{totalConciliaciones !== 1 ? "es" : ""} en {agrupado.length} sociedad{agrupado.length !== 1 ? "es" : ""}
            </p>
          )}
        </div>
        <Link href="/nueva" className="btn btn-primary">
          <Plus size={14} /> Nueva conciliación
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <FileSpreadsheet size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">Sin conciliaciones aún</div>
          <p className="text-sm text-ink-500 mt-1 mb-4">Cuando ejecutes una conciliación va a aparecer acá.</p>
          <Link href="/nueva" className="btn btn-primary inline-flex">Nueva conciliación</Link>
        </div>
      ) : (
        <>
          {/* Buscador */}
          <input
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar por proveedor o sociedad…"
            className="input w-full max-w-sm"
          />

          {/* Agrupado por sociedad */}
          <div className="space-y-6">
            {filtrado.map(soc => (
              <div key={soc.sociedad_nombre}>

                {/* Header sociedad */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 bg-accent flex items-center justify-center flex-shrink-0">
                    <Building size={13} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{soc.sociedad_nombre}</div>
                    <div className="text-2xs text-ink-400">
                      {soc.proveedores.length} proveedor{soc.proveedores.length !== 1 ? "es" : ""} ·{" "}
                      {soc.proveedores.reduce((acc, p) => acc + p.total, 0)} conciliacion{soc.proveedores.reduce((acc, p) => acc + p.total, 0) !== 1 ? "es" : ""}
                    </div>
                  </div>
                </div>

                {/* Proveedores de esta sociedad */}
                <div className="panel divide-y divide-ink-100 ml-0">
                  {soc.proveedores.map(prov => {
                    const keyProv = `${soc.sociedad_nombre}__${prov.contraparte_id}`
                    const expandido = expandidos.has(keyProv)
                    const todasConcs = prov.cuentas.flatMap(c => c.conciliaciones)
                    const ultimaDif = todasConcs[0]?.diferencia_final_ars ?? null
                    const ultimaOk = ultimaDif !== null && Math.abs(ultimaDif) < 1

                    return (
                      <div key={keyProv}>
                        {/* Fila proveedor */}
                        <button
                          onClick={() => toggleExpandido(keyProv)}
                          className="w-full flex items-center px-4 py-3 hover:bg-ink-50 transition-colors text-left"
                        >
                          <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mr-3 ${ultimaOk ? "bg-ok-light text-ok" : ultimaDif !== null ? "bg-warn-light text-warn" : "bg-ink-100 text-ink-400"}`}>
                            {ultimaOk ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold">{prov.contraparte_nombre}</div>
                            <div className="text-2xs text-ink-400 mt-0.5">
                              {prov.total} conciliación{prov.total !== 1 ? "es" : ""} ·{" "}
                              {prov.cuentas.map(c => c.cuenta_interna).filter(Boolean).join(", ")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {ultimaDif !== null && (
                              <div className="text-right">
                                <div className="text-2xs text-ink-400">Última diferencia</div>
                                <div className={`text-xs font-mono font-semibold ${ultimaOk ? "text-ok" : "text-warn"}`}>
                                  {ultimaOk ? "✓ $0" : `$${Math.abs(ultimaDif).toLocaleString("es-AR")}`}
                                </div>
                              </div>
                            )}
                            {expandido
                              ? <ChevronUp size={15} className="text-ink-400 flex-shrink-0" />
                              : <ChevronDown size={15} className="text-ink-400 flex-shrink-0" />
                            }
                          </div>
                        </button>

                        {/* Cuentas expandidas */}
                        {expandido && (
                          <div className="bg-ink-50 border-t border-ink-100">
                            {prov.cuentas.map(cuenta => (
                              <div key={cuenta.cuenta_proveedor_id ?? "sin-cuenta"} className="px-4 py-2">

                                {/* Sub-header cuenta */}
                                {cuenta.cuenta_interna && (
                                  <div className="text-2xs font-semibold text-ink-500 uppercase tracking-wider mb-2 pl-10">
                                    Cuenta {cuenta.cuenta_interna}
                                  </div>
                                )}

                                {/* Conciliaciones de esta cuenta */}
                                <div className="space-y-1 pl-10">
                                  {cuenta.conciliaciones.map(c => {
                                    const ok = c.diferencia_final_ars !== null && Math.abs(c.diferencia_final_ars) < 1
                                    return (
                                      <Link
                                        key={c.id}
                                        href={`/conciliaciones/${c.id}`}
                                        className="flex items-center justify-between py-2 px-3 bg-white border border-ink-200 hover:border-accent hover:bg-accent-light/10 transition-colors group rounded"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? "bg-ok-light text-ok" : "bg-warn-light text-warn"}`}>
                                            {ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                                          </div>
                                          <div>
                                            <div className="text-xs font-semibold">
                                              {c.periodo_label ?? new Date(c.created_at).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
                                            </div>
                                            <div className="text-2xs text-ink-400 flex items-center gap-1 mt-0.5">
                                              <Clock size={10} />
                                              {new Date(c.created_at).toLocaleString("es-AR")}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="text-right">
                                            <div className="text-2xs text-ink-400">Diferencia</div>
                                            <div className={`text-xs font-mono font-semibold ${ok ? "text-ok" : "text-warn"}`}>
                                              {ok ? "✓ $0" : `$${Math.abs(c.diferencia_final_ars ?? 0).toLocaleString("es-AR")}`}
                                            </div>
                                          </div>
                                          <ChevronRight size={13} className="text-ink-300 group-hover:text-accent transition-colors flex-shrink-0" />
                                        </div>
                                      </Link>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}