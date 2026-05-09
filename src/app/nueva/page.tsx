"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { leerExcel, normalizarCompania, normalizarContraparte, exportarResultadoExcel } from "@/lib/excel-parser"
import { conciliar } from "@/lib/motor-conciliacion"
import type { PlantillaProveedor, ResultadoConciliacion } from "@/types"
import { Upload, Play, Download, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react"
import TablaConFiltros from "@/components/TablaConFiltros"
import ConciliacionContable from "@/components/ConciliacionContable"

type Contraparte = { id: string; nombre: string }

export default function NuevaConciliacionPage() {
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [contraparteId, setContraparteId] = useState<string>("")
  const [plantilla, setPlantilla] = useState<PlantillaProveedor | null>(null)

  const [archivoCmp, setArchivoCmp] = useState<File | null>(null)
  const [archivoCont, setArchivoCont] = useState<File | null>(null)

  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // tab visible
  const [tab, setTab] = useState<"resumen" | "conciliados" | "dif_cambio" | "dif_real" | "pend_cmp" | "pend_cont" | "ajustes" | "no_clas">("resumen")

  useEffect(() => {
    supabase.from("contrapartes").select("id, nombre").order("nombre").then(({ data }) => {
      setContrapartes((data ?? []) as Contraparte[])
    })
  }, [])

  useEffect(() => {
    if (!contraparteId) { setPlantilla(null); return }
    supabase.from("plantillas_proveedor").select("*").eq("contraparte_id", contraparteId).single().then(({ data }) => {
      if (data) {
        setPlantilla({
          id: data.id,
          contraparte_id: data.contraparte_id,
          mapeo_compania: data.mapeo_compania,
          mapeo_contraparte: data.mapeo_contraparte,
          reglas_tipos: data.reglas_tipos ?? [],
          tipos_sin_contraparte_compania: data.tipos_sin_contraparte_compania ?? [],
          tipos_sin_contraparte_externa: data.tipos_sin_contraparte_externa ?? [],
          config: data.config,
        })
      }
    })
  }, [contraparteId])

  async function ejecutar() {
    if (!plantilla || !archivoCmp || !archivoCont) return
    setProcesando(true)
    setError(null)
    try {
      const cmpRaw = await leerExcel(archivoCmp)
      const contRaw = await leerExcel(archivoCont)

      const movsCmp = normalizarCompania(cmpRaw.filas, plantilla.mapeo_compania, "c")
      const movsCont = normalizarContraparte(contRaw.filas, plantilla.mapeo_contraparte, "x")

      const todos = [...movsCmp, ...movsCont]
      const r = conciliar(todos, plantilla)

      // Guardar conciliación en BD
      const { data: nueva } = await supabase
        .from("conciliaciones")
        .insert({
          contraparte_id: contraparteId,
          estado: "finalizada",
          resumen: r.resumen,
          saldo_final_compania_ars: r.resumen.saldo_compania_ars,
          saldo_final_contraparte_ars: r.resumen.saldo_contraparte_ars,
          diferencia_final_ars: r.resumen.diferencia_final_ars,
        })
        .select()
        .single()

      if (nueva) {
        // movimientos resumidos (no guardamos todo el raw para mantener tabla liviana)
        await supabase.from("movimientos").insert(
          r.movimientos.map((m) => ({
            conciliacion_id: nueva.id,
            origen: m.origen,
            fecha: m.fecha?.toISOString().slice(0, 10),
            tipo_original: m.tipo_original,
            tipo_normalizado: m.tipo_normalizado,
            comprobante_raw: m.comprobante_raw,
            clave_calculada: m.clave_calculada,
            importe_ars: m.importe_ars,
            importe_usd: m.importe_usd,
            moneda: m.moneda,
            descripcion: m.descripcion,
            estado_conciliacion: m.estado,
            match_id: m.match_id,
          }))
        )
      }

      setResultado(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setProcesando(false)
    }
  }

  function descargar() {
    if (!resultado) return
    const buf = exportarResultadoExcel(resultado)
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const cont = contrapartes.find((c) => c.id === contraparteId)
    a.download = `conciliacion_${cont?.nombre ?? "proveedor"}_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reglasFaltantes = plantilla && plantilla.reglas_tipos.length === 0
  const mapeoIncompleto = plantilla && (
    !plantilla.mapeo_compania.fecha || !plantilla.mapeo_compania.tipo ||
    !plantilla.mapeo_compania.comprobante || !plantilla.mapeo_compania.importe_ars ||
    !plantilla.mapeo_contraparte.fecha || !plantilla.mapeo_contraparte.tipo ||
    !plantilla.mapeo_contraparte.comprobante || !plantilla.mapeo_contraparte.importe
  )

  return (
    <div className="space-y-8">
      <div className="border-b border-ink-200 pb-6">
        <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Conciliar</div>
        <h1 className="h-display">Nueva conciliación</h1>
      </div>

      {/* Paso 1: seleccionar plantilla */}
      <section className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">1. Proveedor / plantilla</div>
        <select
          value={contraparteId}
          onChange={(e) => setContraparteId(e.target.value)}
          className="input"
        >
          <option value="">— elegir proveedor —</option>
          {contrapartes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        {plantilla && reglasFaltantes && (
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" />
            La plantilla no tiene reglas configuradas. Andá a Plantillas para configurarla antes de conciliar.
          </div>
        )}
        {plantilla && !reglasFaltantes && mapeoIncompleto && (
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" />
            Faltan campos obligatorios en el mapeo de columnas. Revisá la plantilla.
          </div>
        )}
        {plantilla && !reglasFaltantes && !mapeoIncompleto && (
          <div className="mt-3 px-3 py-2 bg-accent-light border border-accent/20 rounded text-xs text-accent-dark flex items-start gap-2">
            <CheckCircle2 size={14} className="mt-0.5" />
            Plantilla lista — {plantilla.reglas_tipos.length} reglas configuradas.
          </div>
        )}
      </section>

      {/* Paso 2: archivos */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ArchivoCard
          label="2.A Archivo COMPAÑÍA"
          file={archivoCmp}
          onFile={setArchivoCmp}
        />
        <ArchivoCard
          label="2.B Archivo CONTRAPARTE"
          file={archivoCont}
          onFile={setArchivoCont}
        />
      </section>

      {/* Botón ejecutar */}
      <div className="flex justify-end">
        <button
          onClick={ejecutar}
          disabled={!plantilla || !archivoCmp || !archivoCont || procesando || !!reglasFaltantes || !!mapeoIncompleto}
          className="btn btn-primary disabled:opacity-50"
        >
          <Play size={14} />
          {procesando ? "Procesando..." : "Conciliar"}
        </button>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-start gap-2 text-error">
            <AlertCircle size={16} />
            <div>
              <div className="font-medium text-sm">Error al procesar</div>
              <div className="text-xs mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <section className="space-y-4">
          <div className="flex items-end justify-between border-b border-ink-200 pb-3">
            <div>
              <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-1">Resultado</div>
              <h2 className="h-section">Conciliación</h2>
            </div>
            <button onClick={descargar} className="btn btn-secondary">
              <Download size={14} /> Descargar Excel
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-ink-200 overflow-x-auto">
            <Tab active={tab === "resumen"} onClick={() => setTab("resumen")}>Resumen</Tab>
            <Tab active={tab === "conciliados"} onClick={() => setTab("conciliados")}>
              Conciliados ({resultado.resumen.conciliados})
            </Tab>
            <Tab active={tab === "dif_cambio"} onClick={() => setTab("dif_cambio")}>
              Dif. cambio ({resultado.resumen.conciliados_dif_ars})
            </Tab>
            <Tab active={tab === "dif_real"} onClick={() => setTab("dif_real")}>
              Dif. real ({resultado.resumen.conciliados_dif_real})
            </Tab>
            <Tab active={tab === "pend_cmp"} onClick={() => setTab("pend_cmp")}>
              Pend. compañía ({resultado.resumen.pendientes_compania})
            </Tab>
            <Tab active={tab === "pend_cont"} onClick={() => setTab("pend_cont")}>
              Pend. contraparte ({resultado.resumen.pendientes_contraparte})
            </Tab>
            <Tab active={tab === "ajustes"} onClick={() => setTab("ajustes")}>
              Ajustes propios
            </Tab>
            <Tab active={tab === "no_clas"} onClick={() => setTab("no_clas")}>
              Sin clasificar
            </Tab>
          </div>

          {tab === "resumen" && <ResumenView r={resultado} />}
          {tab === "conciliados" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado")} />}
          {tab === "dif_cambio" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado_dif_ars")} />}
          {tab === "dif_real" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado_dif_real")} />}
          {tab === "pend_cmp" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "compania")} />}
          {tab === "pend_cont" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "contraparte")} />}
          {tab === "ajustes" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "ajuste_propio")} />}
          {tab === "no_clas" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "tipo_no_clasificado")} />}
        </section>
      )}
    </div>
  )
}

// ----- Subcomponentes -----

function ArchivoCard({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File) => void }) {
  return (
    <div className="card">
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">{label}</div>
      <label className="btn btn-secondary cursor-pointer">
        <Upload size={14} />
        {file ? file.name : "Subir Excel"}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {file && (
        <div className="mt-2 text-2xs text-ink-500 flex items-center gap-1">
          <FileSpreadsheet size={11} /> {(file.size / 1024).toFixed(1)} KB
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-ink-500 hover:text-ink-900"
      }`}
    >
      {children}
    </button>
  )
}

function ResumenView({ r }: { r: ResultadoConciliacion }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Saldos</div>
          <div className="space-y-2 text-sm">
            <Linea label="Compañía" valor={r.resumen.saldo_compania_ars} />
            <Linea label="Contraparte" valor={r.resumen.saldo_contraparte_ars} />
            <div className="border-t border-ink-200 pt-2">
              <Linea label="Diferencia" valor={r.resumen.diferencia_final_ars} highlight />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Conciliación</div>
          <div className="space-y-2 text-sm">
            <Linea label="Conciliados" valor={r.resumen.conciliados} num={false} ok />
            <Linea label="Con dif. cambio" valor={r.resumen.conciliados_dif_ars} num={false} />
            <Linea label="Con dif. real" valor={r.resumen.conciliados_dif_real} num={false} warn={r.resumen.conciliados_dif_real > 0} />
            <Linea label="Pendientes compañía" valor={r.resumen.pendientes_compania} num={false} warn={r.resumen.pendientes_compania > 0} />
            <Linea label="Pendientes contraparte" valor={r.resumen.pendientes_contraparte} num={false} warn={r.resumen.pendientes_contraparte > 0} />
            <Linea label="Ajustes propios" valor={r.resumen.ajustes_propios} num={false} />
          </div>
        </div>
        <div className="card">
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Sin clasificar</div>
          {r.resumen.tipos_no_clasificados_compania.length === 0 && r.resumen.tipos_no_clasificados_contraparte.length === 0 ? (
            <div className="text-sm text-accent flex items-center gap-1">
              <CheckCircle2 size={14} /> Todos los tipos clasificados
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {r.resumen.tipos_no_clasificados_compania.length > 0 && (
                <div>
                  <div className="text-ink-500 mb-1">Compañía:</div>
                  <ul className="space-y-0.5">
                    {r.resumen.tipos_no_clasificados_compania.map((t) => (
                      <li key={t} className="font-mono text-amber-800">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.resumen.tipos_no_clasificados_contraparte.length > 0 && (
                <div>
                  <div className="text-ink-500 mb-1">Contraparte:</div>
                  <ul className="space-y-0.5">
                    {r.resumen.tipos_no_clasificados_contraparte.map((t) => (
                      <li key={t} className="font-mono text-amber-800">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Conciliación contable a ancho completo */}
      <ConciliacionContable r={r} />
    </div>
  )
}

function Linea({ label, valor, num = true, highlight = false, ok = false, warn = false }: {
  label: string; valor: number; num?: boolean; highlight?: boolean; ok?: boolean; warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-600">{label}</span>
      <span className={`num ${
        highlight ? "font-semibold text-base" : ""
      } ${ok ? "text-accent" : ""} ${warn ? "text-amber-700" : ""}`}>
        {num ? valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : valor}
      </span>
    </div>
  )
}
