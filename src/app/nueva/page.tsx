"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase-client"
import { leerExcel, normalizarCompania, normalizarContraparte, exportarResultadoExcel } from "@/lib/excel-parser"
import { conciliar } from "@/lib/motor-conciliacion"
import { armarPapelConciliacion } from "@/lib/papel-conciliacion"
import type {
  PlantillaProveedor, ResultadoConciliacion,
  SaldosBilaterales, AjusteManual, ClasificacionPendientes, PapelConciliacion,
} from "@/types"
import { Upload, Play, Download, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react"
import TablaConFiltros from "@/components/TablaConFiltros"
import EditorSaldos from "@/components/EditorSaldos"
import EditorAjustes from "@/components/EditorAjustes"
import ClasificadorPendientes from "@/components/ClasificadorPendientes"
import PapelConciliacionView from "@/components/PapelConciliacionView"

type Contraparte = { id: string; nombre: string }

const SALDOS_VACIOS: SaldosBilaterales = {
  inicial_compania_ars: 0, inicial_compania_usd: 0,
  inicial_contraparte_ars: 0, inicial_contraparte_usd: 0,
  final_compania_ars: 0, final_compania_usd: 0,
  final_contraparte_ars: 0, final_contraparte_usd: 0,
  tc_cierre: 0,
}

export default function NuevaConciliacionPage() {
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [contraparteId, setContraparteId] = useState<string>("")
  const [plantilla, setPlantilla] = useState<PlantillaProveedor | null>(null)

  const [periodoLabel, setPeriodoLabel] = useState("")
  const [saldos, setSaldos] = useState<SaldosBilaterales>(SALDOS_VACIOS)

  const [archivoCmp, setArchivoCmp] = useState<File | null>(null)
  const [archivoCont, setArchivoCont] = useState<File | null>(null)

  const [resultado, setResultado] = useState<ResultadoConciliacion | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clasificacion, setClasificacion] = useState<ClasificacionPendientes>({})
  const [ajustes, setAjustes] = useState<AjusteManual[]>([])

  const [firmadoPor, setFirmadoPor] = useState("")
  const [aprobadoPor, setAprobadoPor] = useState("")

  const [tab, setTab] = useState<"papel" | "clasificacion" | "ajustes" | "movimientos">("papel")
  const [tabMovs, setTabMovs] = useState<"conciliados" | "dif_cambio" | "dif_real" | "pend_cmp" | "pend_cont" | "ajustes_propios" | "no_clas">("pend_cmp")

  // Última conciliación de este proveedor (para botón "Copiar de mes anterior")
  type UltimaConc = {
    periodo_label: string | null
    saldo_final_compania_ars: number | null
    saldo_final_compania_usd: number | null
    saldo_final_contraparte_ars: number | null
    saldo_final_contraparte_usd: number | null
    tc_cierre: number | null
  }
  const [ultimaConc, setUltimaConc] = useState<UltimaConc | null>(null)

  useEffect(() => {
    supabase.from("contrapartes").select("id, nombre").order("nombre").then(({ data }) => {
      setContrapartes((data ?? []) as Contraparte[])
    })
  }, [])

  useEffect(() => {
    if (!contraparteId) {
      setPlantilla(null)
      setUltimaConc(null)
      return
    }
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
    // Cargar la última conciliación de este proveedor
    supabase
      .from("conciliaciones")
      .select("periodo_label, saldo_final_compania_ars, saldo_final_compania_usd, saldo_final_contraparte_ars, saldo_final_contraparte_usd, tc_cierre")
      .eq("contraparte_id", contraparteId)
      .eq("estado", "finalizada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setUltimaConc(data as UltimaConc | null)
      })
  }, [contraparteId])

  // Botón "Copiar de mes anterior": usa los saldos finales del mes anterior como saldos iniciales del mes nuevo
  function copiarDeAnterior() {
    if (!ultimaConc) return
    setSaldos({
      ...saldos,
      inicial_compania_ars: Number(ultimaConc.saldo_final_compania_ars ?? 0),
      inicial_compania_usd: Number(ultimaConc.saldo_final_compania_usd ?? 0),
      inicial_contraparte_ars: Number(ultimaConc.saldo_final_contraparte_ars ?? 0),
      inicial_contraparte_usd: Number(ultimaConc.saldo_final_contraparte_usd ?? 0),
      tc_cierre: Number(ultimaConc.tc_cierre ?? saldos.tc_cierre),
    })
  }

  const papel: PapelConciliacion | null = useMemo(() => {
    if (!resultado) return null
    return armarPapelConciliacion(resultado, saldos, ajustes, clasificacion)
  }, [resultado, saldos, ajustes, clasificacion])

  async function ejecutar() {
    if (!plantilla || !archivoCmp || !archivoCont) return
    setProcesando(true)
    setError(null)
    try {
      const cmpRaw = await leerExcel(archivoCmp)
      const contRaw = await leerExcel(archivoCont)
      const movsCmp = normalizarCompania(cmpRaw.filas, plantilla.mapeo_compania, "c")
      const movsCont = normalizarContraparte(contRaw.filas, plantilla.mapeo_contraparte, "x")
      const r = conciliar([...movsCmp, ...movsCont], plantilla)
      setResultado(r)
      setTab("papel")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setProcesando(false)
    }
  }

  async function guardar() {
    if (!resultado || !papel) return
    const cont = contrapartes.find((c) => c.id === contraparteId)

    // 1. Insertar la cabecera de la conciliación
    const { data: nueva, error: errSave } = await supabase
      .from("conciliaciones")
      .insert({
        contraparte_id: contraparteId,
        periodo_label: periodoLabel,
        saldo_inicial_compania_ars: saldos.inicial_compania_ars,
        saldo_inicial_compania_usd: saldos.inicial_compania_usd,
        saldo_inicial_contraparte_ars: saldos.inicial_contraparte_ars,
        saldo_inicial_contraparte_usd: saldos.inicial_contraparte_usd,
        saldo_final_compania_ars: saldos.final_compania_ars,
        saldo_final_compania_usd: saldos.final_compania_usd,
        saldo_final_contraparte_ars: saldos.final_contraparte_ars,
        saldo_final_contraparte_usd: saldos.final_contraparte_usd,
        tc_cierre: saldos.tc_cierre,
        diferencia_final_ars: papel.diferencia_sin_explicar_ars,
        ajustes_manuales: ajustes,
        clasificacion_pendientes: clasificacion,
        firmado_por: firmadoPor || null,
        firmado_fecha: firmadoPor ? new Date().toISOString().slice(0, 10) : null,
        aprobado_por: aprobadoPor || null,
        aprobado_fecha: aprobadoPor ? new Date().toISOString().slice(0, 10) : null,
        estado: "finalizada",
        resumen: resultado.resumen,
      })
      .select()
      .single()

    if (errSave || !nueva) {
      alert("Error al guardar: " + (errSave?.message ?? "desconocido"))
      return
    }

    // 2. Guardar SOLO los pendientes (cmp + cont) — son los que hacen falta para arrastres
    //    Los conciliados/dif_cambio/ajustes propios no aportan valor histórico.
    const pendientes = resultado.movimientos.filter((m) => m.estado === "pendiente")

    if (pendientes.length > 0) {
      const filas = pendientes.map((m) => ({
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
        // Guardamos en estado_conciliacion el STATUS clasificado, no "pendiente" plano,
        // para que en el historial sepamos a qué categoría pertenecía.
        // Si no hay clasificación, queda como "pendiente".
        estado_conciliacion: clasificacion[m.id_unico] ?? "pendiente",
        match_id: null,
      }))

      const { error: errMovs } = await supabase.from("movimientos").insert(filas)
      if (errMovs) {
        alert(`Conciliación guardada pero falló el detalle de pendientes: ${errMovs.message}`)
        return
      }
    }

    alert(`Conciliación guardada (${cont?.nombre ?? ""} ${periodoLabel || ""}) — ${pendientes.length} pendientes archivados`)
  }

  function descargar() {
    if (!resultado || !papel) return
    const cont = contrapartes.find((c) => c.id === contraparteId)
    const buf = exportarResultadoExcel(resultado, {
      papel,
      contraparte: cont?.nombre ?? "",
      periodoLabel,
      firmadoPor,
      aprobadoPor,
    })
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `conciliacion_${cont?.nombre ?? "proveedor"}_${periodoLabel || new Date().toISOString().slice(0, 10)}.xlsx`
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

  const pendientes = resultado?.movimientos.filter((m) => m.estado === "pendiente") ?? []
  const sinClasif = pendientes.filter((m) => !clasificacion[m.id_unico]).length
  const contraparteName = contrapartes.find((c) => c.id === contraparteId)?.nombre

  return (
    <div className="space-y-6">
      <div className="border-b border-ink-200 pb-4">
        <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Conciliar</div>
        <h1 className="h-display">Nueva conciliación</h1>
      </div>

      <section className="card">
        <PasoTitulo num="1" titulo="Proveedor / plantilla" />
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
          <Aviso variant="warn">La plantilla no tiene reglas configuradas. Andá a Plantillas para configurarla.</Aviso>
        )}
        {plantilla && !reglasFaltantes && mapeoIncompleto && (
          <Aviso variant="warn">Faltan campos obligatorios en el mapeo de columnas.</Aviso>
        )}
        {plantilla && !reglasFaltantes && !mapeoIncompleto && (
          <Aviso variant="ok">Plantilla lista — {plantilla.reglas_tipos.length} reglas configuradas.</Aviso>
        )}
      </section>

      {plantilla && !reglasFaltantes && !mapeoIncompleto && (
        <section>
          <div className="flex items-center gap-2 mb-2 px-1">
            <PasoNum num="2" />
            <h2 className="h-section">Período y saldos</h2>
          </div>
          <EditorSaldos
            saldos={saldos}
            onChange={setSaldos}
            periodoLabel={periodoLabel}
            onPeriodoChange={setPeriodoLabel}
            onCopiarAnterior={ultimaConc ? copiarDeAnterior : undefined}
            copiarAnteriorLabel={ultimaConc?.periodo_label ? `Copiar saldos del ${ultimaConc.periodo_label}` : "Copiar de mes anterior"}
          />
        </section>
      )}

      {plantilla && !reglasFaltantes && !mapeoIncompleto && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 mb-2 px-1">
            <PasoNum num="3" />
            <h2 className="h-section">Archivos del período</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ArchivoCard label="Archivo COMPAÑÍA" file={archivoCmp} onFile={setArchivoCmp} />
            <ArchivoCard label="Archivo CONTRAPARTE" file={archivoCont} onFile={setArchivoCont} />
          </div>
        </section>
      )}

      {plantilla && !reglasFaltantes && !mapeoIncompleto && (
        <div className="flex justify-end">
          <button
            onClick={ejecutar}
            disabled={!archivoCmp || !archivoCont || procesando}
            className="btn btn-primary disabled:opacity-50"
          >
            <Play size={14} />
            {procesando ? "Procesando..." : "Conciliar"}
          </button>
        </div>
      )}

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

      {resultado && papel && (
        <section className="space-y-4">
          <div className="flex items-end justify-between border-b border-ink-200 pb-3">
            <div className="flex items-center gap-2">
              <PasoNum num="4" />
              <h2 className="h-section">Papel de conciliación</h2>
              {sinClasif > 0 && (
                <span className="badge badge-warn ml-2">{sinClasif} pendientes sin clasificar</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={guardar} className="btn btn-secondary">
                <CheckCircle2 size={14} /> Guardar
              </button>
              <button onClick={descargar} className="btn btn-primary">
                <Download size={14} /> Descargar Excel
              </button>
            </div>
          </div>

          <div className="flex gap-1 border-b border-ink-200 overflow-x-auto">
            <Tab active={tab === "papel"} onClick={() => setTab("papel")}>Presentación</Tab>
            <Tab active={tab === "clasificacion"} onClick={() => setTab("clasificacion")}>
              Clasificar pendientes ({pendientes.length})
            </Tab>
            <Tab active={tab === "ajustes"} onClick={() => setTab("ajustes")}>
              Ajustes manuales ({ajustes.length})
            </Tab>
            <Tab active={tab === "movimientos"} onClick={() => setTab("movimientos")}>
              Movimientos detalle
            </Tab>
          </div>

          {tab === "papel" && (
            <div className="space-y-3">
              <div className="card-tight grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="label">Conciliado por</label>
                  <input value={firmadoPor} onChange={(e) => setFirmadoPor(e.target.value)} placeholder="Nombre" className="input" />
                </div>
                <div>
                  <label className="label">Aprobado por</label>
                  <input value={aprobadoPor} onChange={(e) => setAprobadoPor(e.target.value)} placeholder="Nombre" className="input" />
                </div>
              </div>
              <PapelConciliacionView
                papel={papel}
                contraparte={contraparteName ?? "—"}
                periodoLabel={periodoLabel}
                fechaCierre={new Date().toISOString().slice(0, 10)}
                conciliadoPor={firmadoPor}
                conciliadoFecha={firmadoPor ? new Date().toISOString().slice(0, 10) : ""}
                aprobadoPor={aprobadoPor}
              />
            </div>
          )}

          {tab === "clasificacion" && (
            <ClasificadorPendientes
              pendientes={pendientes}
              clasificacion={clasificacion}
              onChange={setClasificacion}
            />
          )}

          {tab === "ajustes" && (
            <EditorAjustes ajustes={ajustes} onChange={setAjustes} />
          )}

          {tab === "movimientos" && (
            <div className="space-y-3">
              <div className="flex gap-1 border-b border-ink-200 overflow-x-auto">
                <Tab active={tabMovs === "pend_cmp"} onClick={() => setTabMovs("pend_cmp")}>Pend. compañía ({resultado.resumen.pendientes_compania})</Tab>
                <Tab active={tabMovs === "pend_cont"} onClick={() => setTabMovs("pend_cont")}>Pend. contraparte ({resultado.resumen.pendientes_contraparte})</Tab>
                <Tab active={tabMovs === "conciliados"} onClick={() => setTabMovs("conciliados")}>Conciliados ({resultado.resumen.conciliados})</Tab>
                <Tab active={tabMovs === "dif_cambio"} onClick={() => setTabMovs("dif_cambio")}>Dif. cambio ({resultado.resumen.conciliados_dif_ars})</Tab>
                <Tab active={tabMovs === "dif_real"} onClick={() => setTabMovs("dif_real")}>Dif. real ({resultado.resumen.conciliados_dif_real})</Tab>
                <Tab active={tabMovs === "ajustes_propios"} onClick={() => setTabMovs("ajustes_propios")}>Ajustes propios</Tab>
                <Tab active={tabMovs === "no_clas"} onClick={() => setTabMovs("no_clas")}>Sin clasificar</Tab>
              </div>
              {tabMovs === "pend_cmp" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "compania")} />}
              {tabMovs === "pend_cont" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "pendiente" && m.origen === "contraparte")} />}
              {tabMovs === "conciliados" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado")} />}
              {tabMovs === "dif_cambio" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado_dif_ars")} />}
              {tabMovs === "dif_real" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "conciliado_dif_real")} />}
              {tabMovs === "ajustes_propios" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "ajuste_propio")} />}
              {tabMovs === "no_clas" && <TablaConFiltros movs={resultado.movimientos.filter((m) => m.estado === "tipo_no_clasificado")} />}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PasoTitulo({ num, titulo }: { num: string; titulo: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <PasoNum num={num} />
      <span className="text-2xs uppercase tracking-wider text-ink-500">{titulo}</span>
    </div>
  )
}

function PasoNum({ num }: { num: string }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-white text-2xs font-medium">
      {num}
    </span>
  )
}

function Aviso({ variant, children }: { variant: "ok" | "warn"; children: React.ReactNode }) {
  const cls = variant === "ok"
    ? "bg-accent-light border-accent/20 text-accent-dark"
    : "bg-amber-50 border-amber-200 text-amber-900"
  const Icon = variant === "ok" ? CheckCircle2 : AlertCircle
  return (
    <div className={`mt-3 px-3 py-2 border rounded text-xs flex items-start gap-2 ${cls}`}>
      <Icon size={14} className="mt-0.5" />
      <div>{children}</div>
    </div>
  )
}

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
