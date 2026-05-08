"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, RefreshCw, CheckCircle, Clock, FileText } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import type { Conciliacion } from "@/types"

export default function ConciliacionesPage() {
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([])
  const [cargando, setCargando] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("conciliaciones")
        .select("*, contraparte:contrapartes(nombre)")
        .order("created_at", { ascending: false })
      setConciliaciones(data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  const estadoLabel: Record<string, { label: string; cls: string }> = {
    borrador: { label: "Borrador", cls: "badge-warn" },
    en_proceso: { label: "En proceso", cls: "badge-pend" },
    finalizada: { label: "Finalizada", cls: "badge-ok" }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Conciliaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Historial y estado de todas las conciliaciones</p>
        </div>
        <Link href="/nueva" className="btn btn-primary"><Plus size={14} />Nueva</Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {cargando ? (
          <div className="flex justify-center py-12 text-gray-400"><RefreshCw className="animate-spin" /></div>
        ) : conciliaciones.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <FileText size={32} className="mx-auto text-gray-200" />
            <div className="text-sm text-gray-400">No hay conciliaciones aún</div>
            <Link href="/nueva" className="btn btn-primary mx-auto">Crear la primera</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {conciliaciones.map(c => (
              <div key={c.id} className="card flex items-center justify-between hover:border-brand transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center">
                    <CheckCircle size={16} className="text-brand" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{c.contraparte?.nombre || "Sin contraparte"}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                      <Clock size={11} />
                      {c.periodo_desde} → {c.periodo_hasta}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {c.diferencia_final !== undefined && (
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Diferencia</div>
                      <div className={`text-sm font-medium ${Math.abs(c.diferencia_final) < 1 ? "text-brand" : "text-red-600"}`}>
                        {c.diferencia_final?.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                      </div>
                    </div>
                  )}
                  <span className={`badge ${estadoLabel[c.estado]?.cls}`}>{estadoLabel[c.estado]?.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
