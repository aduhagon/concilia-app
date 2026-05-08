"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import Link from "next/link"
import { Clock, FileSpreadsheet } from "lucide-react"

type ConciliacionRow = {
  id: string
  contraparte_id: string
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
      .select("id, contraparte_id, saldo_final_compania_ars, saldo_final_contraparte_ars, diferencia_final_ars, estado, created_at, contrapartes(nombre)")
      .order("created_at", { ascending: false })
      .limit(50)
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
          {items.map((c) => (
            <div key={c.id} className="card-tight flex items-center justify-between">
              <div>
                <div className="font-serif text-base">{c.contrapartes?.nombre ?? "—"}</div>
                <div className="text-2xs text-ink-500 flex items-center gap-1 mt-0.5">
                  <Clock size={11} /> {new Date(c.created_at).toLocaleString("es-AR")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xs text-ink-500">Diferencia</div>
                <div className={`num text-sm font-medium ${
                  c.diferencia_final_ars && Math.abs(c.diferencia_final_ars) > 1 ? "text-amber-700" : "text-accent"
                }`}>
                  {c.diferencia_final_ars?.toLocaleString("es-AR", { minimumFractionDigits: 2 }) ?? "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
