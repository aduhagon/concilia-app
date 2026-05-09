"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import type { AjusteManual, MovimientoResultado, StatusPendiente } from "@/types"
import { STATUS_LABELS } from "@/types"
import { ArrowLeft, CheckCircle2, AlertCircle, FileSpreadsheet, Calendar, User } from "lucide-react"

type Conciliacion = {
  id: string
  periodo_label: string | null
  saldo_inicial_compania_ars: number
  saldo_inicial_compania_usd: number
  saldo_inicial_contraparte_ars: number
  saldo_inicial_contraparte_usd: number
  saldo_final_compania_ars: number | null
  saldo_final_compania_usd: number | null
  saldo_final_contraparte_ars: number | null
  saldo_final_contraparte_usd: number | null
  tc_cierre: number | null
  diferencia_final_ars: number | null
  ajustes_manuales: AjusteManual[]
  clasificacion_pendientes: Record<string, StatusPendiente>
  firmado_por: string | null
  firmado_fecha: string | null
  aprobado_por: string | null
  aprobado_fecha: string | null
  estado: string
  created_at: string
  contrapartes: { nombre: string } | null
}

type MovGuardado = {
  id: string
  origen: "compania" | "contraparte"
  fecha: string | null
  tipo_original: string
  comprobante_raw: string
  importe_ars: number
  importe_usd: number
  moneda: string | null
  estado_conciliacion: string
}

export default function DetalleConciliacionPage() {
  const params = useParams<{ id: string }>()
  const [c, setC] = useState<Conciliacion | null>(null)
  const [pendientes, setPendientes] = useState<MovGuardado[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data: cab } = await supabase
        .from("conciliaciones")
        .select("*, contrapartes(nombre)")
        .eq("id", params.id)
        .single()

      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("conciliacion_id", params.id)
        .order("fecha")

      setC(cab as unknown as Conciliacion)
      setPendientes((movs ?? []) as unknown as MovGuardado[])
      setLoading(false)
    }
    cargar()
  }, [params.id])

  if (loading) return <div className="text-sm text-ink-400 text-center py-8">Cargando...</div>
  if (!c) return <div className="text-sm text-error text-center py-8">No se encontró la conciliación</div>

  // Agrupar pendientes por categoría (status)
  const grupos = agruparPorStatus(pendientes)
  const dif = c.diferencia_final_ars ?? 0
  const ok = Math.abs(dif) < 1

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/conciliaciones" className="text-2xs uppercase tracking-[0.2em] text-ink-500 hover:text-accent inline-flex items-center gap-1">
          <ArrowLeft size={11} /> Historial
        </Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="h-display">
            {c.contrapartes?.nombre}
            {c.periodo_label && <span className="text-ink-500 text-2xl ml-2">· {c.periodo_label}</span>}
          </h1>
          <div className={`badge ${ok ? "badge-ok" : "badge-warn"} text-xs`}>
            {ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {ok ? "Conciliada" : "Con diferencia"}
          </div>
        </div>
      </div>

      {/* Datos generales */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <Dato label="Conciliada el" valor={new Date(c.created_at).toLocaleDateString("es-AR")} icon={<Calendar size={11} />} />
          <Dato label="TC Cierre" valor={c.tc_cierre?.toLocaleString("es-AR", { maximumFractionDigits: 4 })} />
          <Dato label="Conciliado por" valor={c.firmado_por ?? "—"} icon={<User size={11} />} />
          <Dato label="Aprobado por" valor={c.aprobado_por ?? "—"} icon={<User size={11} />} />
        </div>
      </div>

      {/* Saldos USD + ARS en doble columna */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Saldos</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="text-left text-2xs uppercase text-ink-500 pb-2"></th>
              <th className="text-right text-2xs uppercase text-ink-500 pb-2 w-40">USD</th>
              <th className="text-right text-2xs uppercase text-ink-500 pb-2 w-44">PESOS</th>
            </tr>
          </thead>
          <tbody>
            <FilaSaldo label="Saldo s/Gestión (compañía)" usd={c.saldo_final_compania_usd ?? 0} ars={c.saldo_final_compania_ars ?? 0} />
            <FilaSaldo
              label="Diferencia"
              usd={(c.saldo_final_compania_usd ?? 0) - (c.saldo_final_contraparte_usd ?? 0)}
              ars={(c.saldo_final_compania_ars ?? 0) - (c.saldo_final_contraparte_ars ?? 0)}
              dif
            />
            <FilaSaldo label="Saldo s/Contraparte" usd={c.saldo_final_contraparte_usd ?? 0} ars={c.saldo_final_contraparte_ars ?? 0} />
          </tbody>
        </table>
      </div>

      {/* Composición de la diferencia (pendientes agrupados + ajustes) */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Composición de la diferencia</div>

        {Object.entries(grupos).map(([status, items]) => {
          if (items.length === 0) return null
          const totalArs = items.reduce((acc, m) => acc + Number(m.importe_ars || 0), 0)
          const totalUsd = items.reduce((acc, m) => acc + Number(m.importe_usd || 0), 0)
          return (
            <details key={status} className="border border-ink-200 rounded-md mb-2">
              <summary className="px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm">
                <div className="flex-1">
                  <div className="font-medium">{STATUS_LABELS[status as StatusPendiente] ?? status}</div>
                  <div className="text-2xs text-ink-500">{items.length} comprobantes</div>
                </div>
                <div className="text-right text-xs">
                  <div className="num">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })} USD</div>
                  <div className="num">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS</div>
                </div>
              </summary>
              <table className="w-full text-2xs border-t border-ink-200">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="text-left px-2 py-1">Origen</th>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-left px-2 py-1">Tipo</th>
                    <th className="text-left px-2 py-1">Comprobante</th>
                    <th className="text-right px-2 py-1">ARS</th>
                    <th className="text-right px-2 py-1">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 100).map((m) => (
                    <tr key={m.id} className="border-t border-ink-100">
                      <td className="px-2 py-1">
                        <span className={`badge ${m.origen === "compania" ? "badge-ink" : "badge-ok"}`}>
                          {m.origen === "compania" ? "C" : "X"}
                        </span>
                      </td>
                      <td className="px-2 py-1">{m.fecha}</td>
                      <td className="px-2 py-1 truncate max-w-[160px]">{m.tipo_original}</td>
                      <td className="px-2 py-1 font-mono">{m.comprobante_raw}</td>
                      <td className="px-2 py-1 num text-right">{Number(m.importe_ars).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 num text-right">{Number(m.importe_usd).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {items.length > 100 && (
                    <tr><td colSpan={6} className="px-2 py-1 text-center text-ink-400">+ {items.length - 100} más</td></tr>
                  )}
                </tbody>
              </table>
            </details>
          )
        })}

        {/* Ajustes manuales */}
        {(c.ajustes_manuales?.length ?? 0) > 0 && (
          <details className="border border-ink-200 rounded-md mb-2">
            <summary className="px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm">
              <div className="flex-1">
                <div className="font-medium">Ajustes a realizar por MSU</div>
                <div className="text-2xs text-ink-500">{c.ajustes_manuales.length} ajustes manuales</div>
              </div>
              <div className="text-right text-xs">
                <div className="num">{c.ajustes_manuales.reduce((acc, a) => acc + (a.importe_usd || 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })} USD</div>
                <div className="num">{c.ajustes_manuales.reduce((acc, a) => acc + (a.importe_ars || 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS</div>
              </div>
            </summary>
            <table className="w-full text-2xs border-t border-ink-200">
              <thead className="bg-ink-50">
                <tr>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Concepto</th>
                  <th className="text-left px-2 py-1">Comprobante</th>
                  <th className="text-right px-2 py-1">USD</th>
                  <th className="text-right px-2 py-1">ARS</th>
                </tr>
              </thead>
              <tbody>
                {c.ajustes_manuales.map((a) => (
                  <tr key={a.id} className="border-t border-ink-100">
                    <td className="px-2 py-1">{a.fecha}</td>
                    <td className="px-2 py-1">{a.concepto}</td>
                    <td className="px-2 py-1 font-mono">{a.comprobante ?? ""}</td>
                    <td className="px-2 py-1 num text-right">{a.importe_usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-1 num text-right">{a.importe_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {pendientes.length === 0 && (c.ajustes_manuales?.length ?? 0) === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-4">Sin pendientes ni ajustes registrados</div>
        )}

        {/* Total + control */}
        <div className={`mt-4 pt-3 border-t-2 border-ink-700 px-2 py-2 rounded ${ok ? "bg-accent-light" : "bg-amber-50"}`}>
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-1">
              {ok ? <CheckCircle2 size={14} className="text-accent" /> : <AlertCircle size={14} className="text-amber-700" />}
              Control de diferencia
            </span>
            <span className={`num ${ok ? "text-accent" : "text-amber-700"}`}>
              {dif.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dato({ label, valor, icon }: { label: string; valor?: string | null; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-0.5 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="font-medium text-ink-800 text-sm">{valor || "—"}</div>
    </div>
  )
}

function FilaSaldo({ label, usd, ars, dif }: { label: string; usd: number; ars: number; dif?: boolean }) {
  const cls = dif ? "text-amber-700 font-medium" : "text-ink-900"
  return (
    <tr className="border-b border-ink-100">
      <td className={`py-2 ${cls}`}>{label}</td>
      <td className={`py-2 num text-right ${cls}`}>{usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
      <td className={`py-2 num text-right ${cls}`}>{ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
    </tr>
  )
}

function agruparPorStatus(movs: MovGuardado[]): Record<string, MovGuardado[]> {
  const r: Record<string, MovGuardado[]> = {}
  for (const m of movs) {
    const k = m.estado_conciliacion || "pendiente"
    if (!r[k]) r[k] = []
    r[k].push(m)
  }
  return r
}
