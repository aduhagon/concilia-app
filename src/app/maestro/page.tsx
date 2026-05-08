"use client"
import { useState, useEffect } from "react"
import { Plus, Trash2, Save, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import type { Equivalencia } from "@/types"

const TIPOS_NORMALIZADOS = ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "PAGO", "ANTICIPO", "RETENCION", "AJUSTE", "OTRO"]

export default function MaestroPage() {
  const [equivalencias, setEquivalencias] = useState<Equivalencia[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from("equivalencias").select("*").order("tipo_normalizado")
    setEquivalencias(data || [])
    setCargando(false)
  }

  function agregar() {
    const nueva: Partial<Equivalencia> = {
      id: `nuevo-${Date.now()}`,
      origen: "ambos",
      texto_original: "",
      tipo_normalizado: "FACTURA",
      signo: 1,
      activo: true
    }
    setEquivalencias(prev => [...prev, nueva as Equivalencia])
  }

  function actualizar(id: string, campo: keyof Equivalencia, valor: unknown) {
    setEquivalencias(prev => prev.map(e => e.id === id ? { ...e, [campo]: valor } : e))
  }

  async function guardar() {
    setGuardando(true)
    try {
      for (const eq of equivalencias) {
        if (eq.id.startsWith("nuevo-")) {
          const { id: _, ...resto } = eq
          await supabase.from("equivalencias").insert(resto)
        } else {
          await supabase.from("equivalencias").update(eq).eq("id", eq.id)
        }
      }
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id: string) {
    if (id.startsWith("nuevo-")) {
      setEquivalencias(prev => prev.filter(e => e.id !== id))
    } else {
      await supabase.from("equivalencias").delete().eq("id", id)
      await cargar()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Maestro de equivalencias</h1>
          <p className="text-xs text-gray-400 mt-0.5">Traducción de conceptos entre compañía y contraparte</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={agregar}><Plus size={14} />Nueva fila</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-brand-light border border-green-200 rounded-lg p-3 text-xs text-green-700 mb-4">
          Completá esta tabla con los textos que aparecen en tus exportaciones de ERP. Cada fila le dice a la app cómo interpretar un concepto.
        </div>

        {cargando ? (
          <div className="flex justify-center py-12 text-gray-400"><RefreshCw className="animate-spin" /></div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Origen</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Texto detectado en Excel</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo normalizado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Signo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Activo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {equivalencias.map((eq) => (
                  <tr key={eq.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2">
                      <select className="input text-xs py-1" value={eq.origen} onChange={e => actualizar(eq.id, "origen", e.target.value)}>
                        <option value="compania">Compañía</option>
                        <option value="contraparte">Contraparte</option>
                        <option value="ambos">Ambos</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input className="input text-xs py-1 font-mono uppercase" value={eq.texto_original} onChange={e => actualizar(eq.id, "texto_original", e.target.value.toUpperCase())} placeholder="Ej: FAC A, PAGO TRANSF..." />
                    </td>
                    <td className="px-4 py-2">
                      <select className="input text-xs py-1" value={eq.tipo_normalizado} onChange={e => actualizar(eq.id, "tipo_normalizado", e.target.value)}>
                        {TIPOS_NORMALIZADOS.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select className="input text-xs py-1" value={eq.signo} onChange={e => actualizar(eq.id, "signo", parseInt(e.target.value))}>
                        <option value={1}>+ Suma deuda</option>
                        <option value={-1}>− Resta deuda</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={eq.activo} onChange={e => actualizar(eq.id, "activo", e.target.checked)} className="w-4 h-4 accent-brand" />
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => eliminar(eq.id)} className="text-gray-300 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {equivalencias.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-xs">No hay equivalencias. Agregá tu primera fila con los conceptos de tu ERP.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Equivalencias comunes Tango */}
        <div className="card mt-4 space-y-2">
          <div className="text-xs font-medium text-gray-600">Conceptos comunes en Tango / SAP — podés usarlos de referencia:</div>
          <div className="grid grid-cols-4 gap-2">
            {["FAC A","FC A","FACTURA A","NC A","NOTA CRED","PAGO","TRANSFERENCIA","RECIBO"].map(c => (
              <span key={c} className="font-mono text-xs bg-gray-50 rounded px-2 py-1 text-gray-500">{c}</span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
