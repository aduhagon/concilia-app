"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import Link from "next/link"
import { Clock, FileSpreadsheet, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react"

type ConciliacionRow = {
  id: string
  contraparte_id: string
  periodo_label: string | null
  saldo_final_compania_ars: number | null
  saldo_final_contraparte_ars: number | null
  diferencia_final_ars: number | null
  estado: string
  created_at: string
  contrapartes: { nombre: string } | null
}

export default function HistorialPage() {
  const [items, setItems] = useState<ConciliacionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from("conciliaciones")
      .select("id, contraparte_id, periodo_label, saldo_final_compania_ars, saldo_final_contraparte_ars, diferencia_final_ars, estado, created_at, contrapartes(nombre)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setItems((data ?? []) as unknown as ConciliacionRow[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <div className="border-b border-ink-200 pb-6">
        <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Historial</div>
        <h1 className="h-display">Conciliaciones anteriores</h1>
      </div>

      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <FileSpreadsheet size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="font-serif text-lg">Sin conciliaciones aún</div>
          <p className="text-sm text-ink-500 mt-1 mb-4">Cuando ejecutes una conciliación va a aparecer acá.</p>
          <Link href="/nueva" className="btn btn-primary inline-flex">Nueva conciliación</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const ok = c.diferencia_final_ars !== null && Math.abs(c.diferencia_final_ars) < 1
            return (
              <Link
                key={c.id}
                href={`/conciliaciones/${c.id}`}
                className="card-tight flex items-center justify-between hover:border-accent hover:bg-ink-50/50 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${ok ? "bg-accent-light text-accent" : "bg-amber-100 text-amber-700"}`}>
                    {ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-base">
                      {c.contrapartes?.nombre ?? "—"}
                      {c.periodo_label && <span className="text-ink-500 font-sans text-sm font-normal"> · {c.periodo_label}</span>}
                    </div>
                    <div className="text-2xs text-ink-500 flex items-center gap-1 mt-0.5">
                      <Clock size={11} /> {new Date(c.created_at).toLocaleString("es-AR")}
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <div className="text-2xs text-ink-500">Control de diferencia</div>
                    <div className={`num text-sm font-medium ${ok ? "text-accent" : "text-amber-700"}`}>
                      {c.diferencia_final_ars?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) ?? "—"}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-ink-300 group-hover:text-accent transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
