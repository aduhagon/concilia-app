"use client"
import { useState, useEffect } from "react"
import { Plus, Trash2, Save, RefreshCw, Upload, Download } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import type { Equivalencia } from "@/types"
import * as XLSX from "xlsx"

const TIPOS_NORMALIZADOS = ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "PAGO", "ANTICIPO", "RETENCION", "AJUSTE", "OTRO"]

export default function MaestroPage() {
  const [equivalencias, setEquivalencias] = useState<Equivalencia[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [mensajeImport, setMensajeImport] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null)

  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from("equivalencias").select("*").order("tipo_normalizado")
    setEquivalencias(data || [])
    setCargando(false)
  }

  function agregar() {
    const nueva = {
      id: `nuevo-${Date.now()}`,
      empresa_id: "",
      origen: "ambos" as const,
      texto_original: "",
      tipo_normalizado: "FACTURA",
      signo: 1 as const,
      activo: true,
      created_at: new Date().toISOString()
    }
    setEquivalencias(prev => [...prev, nueva])
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

  async function importarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setMensajeImport(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, string>[]

      if (!filas.length) { setMensajeImport({ tipo: "err", texto: "El archivo está vacío." }); return }

      const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "")
      const headers = Object.keys(filas[0])
      const findCol = (posibles: string[]) => headers.find(h => posibles.includes(normalizeKey(h))) || null

      const colTexto = findCol(["textooriginal", "texto", "concepto", "descripcion", "original"])
      const colTipo = findCol(["tiponormalizado", "tipo", "normalizado", "tipomovimiento"])
      const colOrigen = findCol(["origen"])
      const colSigno = findCol(["signo"])

      if (!colTexto || !colTipo) {
        setMensajeImport({ tipo: "err", texto: `Columnas no encontradas. El Excel debe tener: "texto_original" y "tipo_normalizado". Detectadas: ${headers.join(", ")}` })
        return
      }

      let importados = 0
      let omitidos = 0

      for (const fila of filas) {
        const texto = String(fila[colTexto] || "").trim().toUpperCase()
        const tipo = String(fila[colTipo] || "").trim().toUpperCase()
        if (!texto || !tipo) { omitidos++; continue }

        const origenVal = colOrigen ? String(fila[colOrigen] || "ambos").toLowerCase() : "ambos"
        const origen = (["compania", "contraparte", "ambos"].includes(origenVal) ? origenVal : "ambos") as "compania" | "contraparte" | "ambos"
        const signo = colSigno ? (parseInt(String(fila[colSigno])) === -1 ? -1 : 1) : 1
        const tipoFinal = TIPOS_NORMALIZADOS.includes(tipo) ? tipo : "OTRO"

        const { error } = await supabase.from("equivalencias").upsert(
          { texto_original: texto, tipo_normalizado: tipoFinal, origen, signo, activo: true },
          { onConflict: "empresa_id,origen,texto_original", ignoreDuplicates: false }
        )
        if (!error) importados++; else omitidos++
      }

      setMensajeImport({ tipo: "ok", texto: `✓ ${importados} equivalencias importadas.${omitidos > 0 ? ` ${omitidos} filas omitidas.` : ""}` })
      await cargar()
    } catch {
      setMensajeImport({ tipo: "err", texto: "Error al leer el archivo. Verificá que sea un Excel válido (.xlsx)." })
    } finally {
      setImportando(false)
      e.target.value = ""
    }
  }

  function descargarPlantilla() {
    const datos = [
      { texto_original: "FAC A", tipo_normalizado: "FACTURA", origen: "ambos", signo: 1 },
      { texto_original: "FC A", tipo_normalizado: "FACTURA", origen: "ambos", signo: 1 },
      { texto_original: "FACTURA A", tipo_normalizado: "FACTURA", origen: "ambos", signo: 1 },
      { texto_original: "NC A", tipo_normalizado: "NOTA_CREDITO", origen: "ambos", signo: -1 },
      { texto_original: "NOTA CRED", tipo_normalizado: "NOTA_CREDITO", origen: "ambos", signo: -1 },
      { texto_original: "PAGO", tipo_normalizado: "PAGO", origen: "ambos", signo: -1 },
      { texto_original: "PAGO TRANSF", tipo_normalizado: "PAGO", origen: "ambos", signo: -1 },
      { texto_original: "TRANSFERENCIA", tipo_normalizado: "PAGO", origen: "ambos", signo: -1 },
      { texto_original: "RECIBO", tipo_normalizado: "PAGO", origen: "ambos", signo: -1 },
      { texto_original: "RETENCION", tipo_normalizado: "RETENCION", origen: "ambos", signo: -1 },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(datos)
    ws["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws, "Equivalencias")
    XLSX.writeFile(wb, "plantilla_equivalencias.xlsx")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Maestro de equivalencias</h1>
          <p className="text-xs text-gray-400 mt-0.5">Traducción de conceptos entre compañía y contraparte</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button className="btn" onClick={descargarPlantilla}><Download size={14} />Bajar plantilla</button>
          <label className={`btn cursor-pointer ${importando ? "opacity-60 pointer-events-none" : ""}`}>
            {importando ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importarExcel} disabled={importando} />
          </label>
          <button className="btn" onClick={agregar}><Plus size={14} />Nueva fila</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {mensajeImport && (
          <div className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${mensajeImport.tipo === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            <span>{mensajeImport.texto}</span>
            <button onClick={() => setMensajeImport(null)} className="text-xs opacity-60 hover:opacity-100 ml-4">✕</button>
          </div>
        )}

        <div className="bg-brand-light border border-green-200 rounded-lg p-3 text-xs text-green-700">
          <strong>Cómo importar:</strong> Descargá la plantilla, completála con tus conceptos de Tango/SAP y subila. Tipos válidos: {TIPOS_NORMALIZADOS.join(", ")}.
        </div>

        {cargando ? (
          <div className="flex justify-center py-12 text-gray-400"><RefreshCw className="animate-spin" /></div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Origen</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Texto en Excel</th>
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
                        <option value={1}>+ Suma</option>
                        <option value={-1}>− Resta</option>
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
                  <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-xs">No hay equivalencias. Importá un Excel o agregá filas manualmente.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
