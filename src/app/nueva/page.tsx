"use client"
import { useState } from "react"
import { Upload, ChevronRight, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react"
import { leerExcel, detectarColumnas, normalizarMovimientos } from "@/lib/excel-parser"
import { ejecutarConciliacion } from "@/lib/motor-conciliacion"
import type { MapeoColumnas, MovimientoNormalizado, ResultadoConciliacion, Equivalencia } from "@/types"

type Paso = "archivos" | "mapeo" | "validacion" | "resultado"

const COLUMNAS_REQUERIDAS = [
  { key: "fecha", label: "Fecha" },
  { key: "comprobante", label: "Comprobante / Nro Doc" },
  { key: "descripcion", label: "Descripción / Concepto" },
  { key: "importe", label: "Importe (o usar Debe/Haber)" },
]

export default function NuevaConciliacionPage() {
  const [paso, setPaso] = useState<Paso>("archivos")
  const [fileCompania, setFileCompania] = useState<File | null>(null)
  const [fileContraparte, setFileContraparte] = useState<File | null>(null)
  const [saldoInicial, setSaldoInicial] = useState("")
  const [saldoContraparte, setSaldoContraparte] = useState("")

  const [colsCompania, setColsCompania] = useState<string[]>([])
  const [colsContraparte, setColsContraparte] = useState<string[]>([])
  const [mapeoC, setMapeoC] = useState<Partial<MapeoColumnas>>({})
  const [mapeoP, setMapeoP] = useState<Partial<MapeoColumnas>>({})

  const [filasCompania, setFilasCompania] = useState<Record<string, unknown>[]>([])
  const [filasContraparte, setFilasContraparte] = useState<Record<string, unknown>[]>([])
  const [noClasificados, setNoClasificados] = useState<string[]>([])
  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null)
  const [cargando, setCargando] = useState(false)

  const equivalencias: Equivalencia[] = [] // TODO: cargar desde Supabase

  async function procesarArchivos() {
    if (!fileCompania || !fileContraparte) return
    setCargando(true)
    try {
      const bufC = await fileCompania.arrayBuffer()
      const bufP = await fileContraparte.arrayBuffer()
      const fc = leerExcel(bufC)
      const fp = leerExcel(bufP)
      setFilasCompania(fc)
      setFilasContraparte(fp)
      setColsCompania(detectarColumnas(fc))
      setColsContraparte(detectarColumnas(fp))
      setPaso("mapeo")
    } finally {
      setCargando(false)
    }
  }

  function ejecutar() {
    setCargando(true)
    try {
      const { movimientos: mc, no_clasificados: nc1 } = normalizarMovimientos(
        filasCompania, mapeoC as MapeoColumnas, "compania", equivalencias
      )
      const { movimientos: mp, no_clasificados: nc2 } = normalizarMovimientos(
        filasContraparte, mapeoP as MapeoColumnas, "contraparte", equivalencias
      )
      const todos = Array.from(new Set([...nc1, ...nc2]))
      setNoClasificados(todos)
      if (todos.length > 0) { setPaso("validacion"); return }
      const res = ejecutarConciliacion(mc, mp, parseFloat(saldoInicial) || 0)
      setResultado(res)
      setPaso("resultado")
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="font-semibold">Nueva conciliación</h1>
        {/* Stepper */}
        <div className="flex items-center gap-2 mt-3">
          {(["archivos","mapeo","validacion","resultado"] as Paso[]).map((p, i, arr) => (
            <div key={p} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-medium ${paso === p ? "bg-brand text-white" : "bg-gray-100 text-gray-400"}`}>{i+1}</div>
              <span className={`text-xs ${paso === p ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                {p === "archivos" ? "Archivos" : p === "mapeo" ? "Mapeo" : p === "validacion" ? "Validación" : "Resultado"}
              </span>
              {i < arr.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
            </div>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">

        {/* PASO 1: Archivos */}
        {paso === "archivos" && (
          <div className="space-y-5">
            <div className="card space-y-4">
              <h2 className="font-medium">Datos generales</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Saldo inicial conciliado</label>
                  <input className="input" type="number" placeholder="0.00" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Saldo informado por contraparte</label>
                  <input className="input" type="number" placeholder="0.00" value={saldoContraparte} onChange={e => setSaldoContraparte(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FileDropZone label="Excel compañía" sublabel="Exportación de tu ERP" file={fileCompania} onFile={setFileCompania} />
              <FileDropZone label="Excel contraparte" sublabel="Extracto del proveedor/cliente" file={fileContraparte} onFile={setFileContraparte} />
            </div>

            <button className="btn btn-primary w-full justify-center" disabled={!fileCompania || !fileContraparte || cargando} onClick={procesarArchivos}>
              {cargando ? <RefreshCw size={14} className="animate-spin" /> : null}
              Continuar al mapeo
            </button>
          </div>
        )}

        {/* PASO 2: Mapeo */}
        {paso === "mapeo" && (
          <div className="space-y-5">
            <MapeadorColumnas titulo="Columnas — Excel compañía" columnas={colsCompania} mapeo={mapeoC} onChange={setMapeoC} />
            <MapeadorColumnas titulo="Columnas — Excel contraparte" columnas={colsContraparte} mapeo={mapeoP} onChange={setMapeoP} />
            <div className="text-xs text-gray-400 bg-brand-light p-3 rounded-lg">
              Esta configuración se guardará automáticamente para la próxima conciliación con la misma contraparte.
            </div>
            <button className="btn btn-primary w-full justify-center" onClick={ejecutar} disabled={cargando}>
              {cargando && <RefreshCw size={14} className="animate-spin" />}
              Ejecutar conciliación
            </button>
          </div>
        )}

        {/* PASO 3: Validación */}
        {paso === "validacion" && noClasificados.length > 0 && (
          <div className="card space-y-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Conceptos sin clasificar</div>
                <div className="text-sm text-gray-500 mt-1">Antes de conciliar, clasificá estos conceptos en el maestro de equivalencias.</div>
              </div>
            </div>
            <div className="space-y-2">
              {noClasificados.map((nc) => (
                <div key={nc} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs text-gray-700">{nc}</span>
                  <span className="badge badge-warn">Sin clasificar</span>
                </div>
              ))}
            </div>
            <a href="/maestro" className="btn btn-primary w-full justify-center">Ir al maestro de equivalencias</a>
          </div>
        )}

        {/* PASO 4: Resultado */}
        {paso === "resultado" && resultado && (
          <ResultadoPanel resultado={resultado} saldoContraparte={parseFloat(saldoContraparte) || 0} />
        )}
      </main>
    </div>
  )
}

function FileDropZone({ label, sublabel, file, onFile }: { label: string; sublabel: string; file: File | null; onFile: (f: File) => void }) {
  return (
    <label className="card border-dashed cursor-pointer hover:border-brand transition-colors flex flex-col items-center justify-center py-8 gap-2">
      <Upload size={20} className={file ? "text-brand" : "text-gray-300"} />
      <div className="text-sm font-medium text-center">{file ? file.name : label}</div>
      <div className="text-xs text-gray-400">{sublabel}</div>
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  )
}

function MapeadorColumnas({ titulo, columnas, mapeo, onChange }: { titulo: string; columnas: string[]; mapeo: Partial<MapeoColumnas>; onChange: (m: Partial<MapeoColumnas>) => void }) {
  return (
    <div className="card space-y-3">
      <div className="font-medium text-sm">{titulo}</div>
      {COLUMNAS_REQUERIDAS.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-2 gap-3 items-center">
          <label className="text-xs text-gray-500">{label}</label>
          <select className="input text-sm" value={(mapeo as Record<string, string>)[key] || ""} onChange={e => onChange({ ...mapeo, [key]: e.target.value })}>
            <option value="">— seleccionar —</option>
            {columnas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      ))}
    </div>
  )
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })
}

function ResultadoPanel({ resultado, saldoContraparte }: { resultado: ResultadoConciliacion; saldoContraparte: number }) {
  const diferencia = resultado.saldo_conciliado - saldoContraparte
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Conciliados" value={resultado.conciliados.length} color="ok" />
        <MetricCard label="Pend. compañía" value={resultado.pendientes_compania.length} color="pend" />
        <MetricCard label="Pend. contraparte" value={resultado.pendientes_contraparte.length} color="pend" />
        <MetricCard label="Diferencias" value={resultado.diferencias.length} color="err" />
      </div>

      <div className="card space-y-2">
        <div className="font-medium text-sm mb-3">Resumen de saldos</div>
        {[
          ["Saldo conciliado calculado", resultado.saldo_conciliado],
          ["Saldo informado por contraparte", saldoContraparte],
        ].map(([k, v]) => (
          <div key={String(k)} className="flex justify-between text-sm">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium">{fmt(v as number)}</span>
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between text-sm font-semibold">
          <span>Diferencia final</span>
          <span className={Math.abs(diferencia) < 1 ? "text-brand" : "text-red-600"}>{fmt(diferencia)}</span>
        </div>
      </div>

      {Math.abs(diferencia) < 1 && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-lg p-3 text-sm">
          <CheckCircle size={16} /> Conciliación perfecta — saldos coinciden
        </div>
      )}

      <button className="btn btn-primary w-full justify-center">Exportar a Excel</button>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls = color === "ok" ? "text-brand" : color === "err" ? "text-red-600" : "text-blue-600"
  return (
    <div className="card text-center">
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}
