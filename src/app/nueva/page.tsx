"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase-client"
import { leerExcel, normalizarCompania, normalizarContraparte, exportarResultadoExcel, obtenerInfoArchivo } from "@/lib/excel-parser"
import { conciliar, type ResultadoConciliacionConLog } from "@/lib/motor-conciliacion"
import { armarPapelConciliacion } from "@/lib/papel-conciliacion"
import type {
  PlantillaProveedor, ResultadoConciliacion,
  SaldosBilaterales, AjusteManual, ClasificacionPendientes, PapelConciliacion,
} from "@/types"
import { Upload, Play, Download, AlertCircle, CheckCircle2, FileSpreadsheet, Trash2, Save } from "lucide-react"
import TablaConFiltros from "@/components/TablaConFiltros"
import EditorSaldos from "@/components/EditorSaldos"
import EditorAjustes from "@/components/EditorAjustes"
import ClasificadorPendientes from "@/components/ClasificadorPendientes"
import PapelConciliacionView from "@/components/PapelConciliacionView"
import { usePersistedState } from "@/lib/use-persisted-state"
import { useShortcuts } from "@/lib/use-shortcuts"
import { useToast } from "@/components/Toast"

type Contraparte = { id: string; nombre: string }
type CuentaProveedor = { id: string; sociedad_nombre: string; cuenta_interna: string; descripcion: string | null }

const SALDOS_VACIOS: SaldosBilaterales = {
  inicial_compania_ars: 0, inicial_compania_usd: 0,
  inicial_contraparte_ars: 0, inicial_contraparte_usd: 0,
  final_compania_ars: 0, final_compania_usd: 0,
  final_contraparte_ars: 0, final_contraparte_usd: 0,
  tc_cierre: 0,
}

export default function NuevaConciliacionPage() {
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [cuentasProveedor, setCuentasProveedor] = useState<CuentaProveedor[]>([])
  const [cuentaProveedorId, setCuentaProveedorId, clearCuentaProveedorId] = usePersistedState<string>("nueva-cuenta-proveedor-id", "")
  const [contraparteId, setContraparteId, clearContraparteId] = usePersistedState<string>("nueva-contraparte-id", "")
  // Persistir todo lo crítico del usuario
  const [periodoLabel, setPeriodoLabel, clearPeriodo] = usePersistedState<string>("nueva-periodo", "")
  const [saldos, setSaldos, clearSaldos] = usePersistedState<SaldosBilaterales>("nueva-saldos", SALDOS_VACIOS)
  const [clasificacion, setClasificacion, clearClasif] = usePersistedState<ClasificacionPendientes>("nueva-clasif", {})
  const [ajustes, setAjustes, clearAjustes] = usePersistedState<AjusteManual[]>("nueva-ajustes", [])
  const [firmadoPor, setFirmadoPor, clearFirma] = usePersistedState<string>("nueva-firma", "")
  const [aprobadoPor, setAprobadoPor, clearAprob] = usePersistedState<string>("nueva-aprob", "")

  const [plantilla, setPlantilla] = useState<PlantillaProveedor | null>(null)
  const [archivoCmp, setArchivoCmp] = useState<File | null>(null)
  const [archivoCont, setArchivoCont] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoConciliacionConLog | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()

  const [tab, setTab] = useState<"papel" | "sugerencias" | "clasificacion" | "ajustes" | "movimientos">("papel")
  const [sugerenciasRechazadas, setSugerenciasRechazadas] = useState<Set<string>>(new Set())
  const [sugerenciasAceptadas, setSugerenciasAceptadas] = useState<Set<string>>(new Set())
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
      setCuentasProveedor([])
      setCuentaProveedorId("")
      return
    }
    // Cargar cuentas por sociedad del proveedor
    supabase
      .from("cuentas_proveedor")
      .select("id, cuenta_interna, descripcion, sociedad_id, sociedades(nombre)")
      .eq("contraparte_id", contraparteId)
      .eq("activo", true)
      .order("cuenta_interna")
      .then(({ data }) => {
        setCuentasProveedor((data ?? []).map((c: any) => ({
          id: c.id,
          sociedad_nombre: c.sociedades?.nombre ?? "—",
          cuenta_interna: c.cuenta_interna,
          descripcion: c.descripcion,
        })))
        // Si solo hay una cuenta, seleccionarla automáticamente
        if (data?.length === 1) setCuentaProveedorId(data[0].id)
        else setCuentaProveedorId("")
      })
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
      // Guardar cantidad de filas para el hash posterior
      ;(window as any).__cmpRawFilas = cmpRaw.filas.length
      ;(window as any).__contRawFilas = contRaw.filas.length
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
    const cmpRawFilas: number = (window as any).__cmpRawFilas ?? 0
    const contRawFilas: number = (window as any).__contRawFilas ?? 0

    // 1. Insertar la cabecera de la conciliación
    const { data: nueva, error: errSave } = await supabase
      .from("conciliaciones")
      .insert({
        contraparte_id: contraparteId,
        cuenta_proveedor_id: cuentaProveedorId || null,
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

    // 2. Guardar pendientes Y los movimientos que pertenecen a matches agrupados aceptados
    const pendientes = resultado.movimientos.filter((m) => m.estado === "pendiente")

    // Identificar movimientos involucrados en sugerencias agrupadas aceptadas
    const sugAceptadas = (resultado.sugerencias_agrupadas ?? []).filter(s => sugerenciasAceptadas.has(s.id_unico))
    const idsUnicosAgrupados = new Set<string>()
    for (const s of sugAceptadas) {
      s.movs_lado_n.forEach(id => idsUnicosAgrupados.add(id))
      idsUnicosAgrupados.add(s.mov_lado_1)
    }
    const movsAgrupados = resultado.movimientos.filter(m => idsUnicosAgrupados.has(m.id_unico))

    // Mapa idUnico (temporal) → UUID real de la DB (lo llenamos al insertar)
    const mapIdUnicoAReal: Record<string, string> = {}

    const todosAGuardar = [...pendientes, ...movsAgrupados]

    if (todosAGuardar.length > 0) {
      const filas = todosAGuardar.map((m) => ({
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
        // Pendientes mantienen su estado clasificado; agrupados aceptados quedan como "conciliado"
        estado_conciliacion: m.estado === "conciliado"
          ? "conciliado"
          : (clasificacion[m.id_unico] ?? "pendiente"),
        match_id: null,
      }))

      const { data: movsInsertados, error: errMovs } = await supabase
        .from("movimientos")
        .insert(filas)
        .select("id")

      if (errMovs) {
        toast.show(`Guardado parcial: falló el detalle (${errMovs.message})`, "error")
        return
      }

      // Mapear id_unico → UUID real (en orden de inserción)
      if (movsInsertados) {
        todosAGuardar.forEach((m, idx) => {
          if (movsInsertados[idx]) mapIdUnicoAReal[m.id_unico] = movsInsertados[idx].id
        })
      }
    }

    // 2.b. Guardar matches agrupados aceptados (después de tener UUIDs reales)
    if (sugAceptadas.length > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const usuarioId = user?.id ?? null
        const ahoraIso = new Date().toISOString()

        const filasAgrupadas = sugAceptadas
          .map(s => {
            const movsN_uuids = s.movs_lado_n.map(id => mapIdUnicoAReal[id]).filter(Boolean)
            const movUno_uuid = mapIdUnicoAReal[s.mov_lado_1]
            if (movsN_uuids.length === 0 || !movUno_uuid) return null
            return {
              conciliacion_id: nueva.id,
              tipo: s.tipo,
              movs_lado_n: movsN_uuids,
              mov_lado_1: movUno_uuid,
              total_lado_n_ars: s.total_lado_n_ars,
              total_lado_n_usd: s.total_lado_n_usd,
              importe_lado_1_ars: s.importe_lado_1_ars,
              importe_lado_1_usd: s.importe_lado_1_usd,
              diferencia_ars: s.diferencia_ars,
              diferencia_usd: s.diferencia_usd,
              estado: "aceptado" as const,
              score_confianza: s.score_confianza,
              aceptado_por: usuarioId,
              aceptado_en: ahoraIso,
            }
          })
          .filter(Boolean)

        if (filasAgrupadas.length > 0) {
          await supabase.from("matches_agrupados").insert(filasAgrupadas as any)
        }
      } catch (e) {
        console.error("Error guardando matches agrupados:", e)
        // no bloquear el guardado principal
      }
    }

    // 3. Guardar hash de archivos fuente (trazabilidad / cadena de custodia)
    if (archivoCmp && archivoCont) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const [infoCmp, infoCont] = await Promise.all([
          obtenerInfoArchivo(archivoCmp, cmpRawFilas),
          obtenerInfoArchivo(archivoCont, contRawFilas),
        ])
        await supabase.from("archivos_fuente").insert([
          { conciliacion_id: nueva.id, usuario_id: user?.id, origen: "compania", ...infoCmp, filas_procesadas: pendientes.filter(m => m.origen === "compania").length },
          { conciliacion_id: nueva.id, usuario_id: user?.id, origen: "contraparte", ...infoCont, filas_procesadas: pendientes.filter(m => m.origen === "contraparte").length },
        ])
      } catch { /* no bloquear si falla el hash */ }
    }

    // 4. Guardar log de decisiones del motor
    if (resultado.decisiones && resultado.decisiones.length > 0) {
      try {
        const decisionesDb = resultado.decisiones.slice(0, 500).map(d => ({
          conciliacion_id: nueva.id,
          nivel_match: d.nivel_match,
          criterio: d.criterio,
          score_confianza: d.score_confianza,
          clave_compania: d.clave_compania ?? null,
          clave_contraparte: d.clave_contraparte ?? null,
          candidatos_evaluados: d.candidatos_evaluados,
          candidatos_descartados: d.candidatos_descartados ?? null,
        }))
        await supabase.from("motor_decisiones").insert(decisionesDb)
      } catch { /* no bloquear si falla el log */ }
    }

    const cantAgrupados = sugAceptadas.length
    const msgAgrupados = cantAgrupados > 0 ? ` + ${cantAgrupados} match(es) agrupado(s)` : ""
    toast.show(`✓ Conciliación guardada (${cont?.nombre ?? ""} ${periodoLabel || ""}) — ${pendientes.length} pendientes${msgAgrupados}`, "ok")
    // Limpiar el borrador después de guardar exitoso
    setTimeout(() => {
      clearContraparteId()
      clearCuentaProveedorId()
      clearPeriodo()
      clearSaldos()
      clearClasif()
      clearAjustes()
      clearFirma()
      clearAprob()
      setArchivoCmp(null)
      setArchivoCont(null)
      setResultado(null)
    }, 500)
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

  // Limpiar todo el borrador (después de guardar exitosamente o por acción del usuario)
  function limpiarBorrador() {
    clearContraparteId()
    clearCuentaProveedorId()
    clearPeriodo()
    clearSaldos()
    clearClasif()
    clearAjustes()
    clearFirma()
    clearAprob()
    setArchivoCmp(null)
    setArchivoCont(null)
    setResultado(null)
    toast.show("Borrador limpiado", "info")
  }

  // Atajos globales (Ctrl+S guardar, ? help)
  useShortcuts(
    [
      {
        key: "s", ctrl: true, description: "Guardar conciliación",
        handler: () => {
          if (resultado && papel) guardar()
        },
      },
    ],
    !!resultado
  )

  // Detectar si hay un borrador en progreso (cualquier campo crítico tiene valor)
  const hayBorrador = !!(periodoLabel || saldos.final_compania_ars !== 0 || saldos.tc_cierre !== 0 || ajustes.length > 0 || Object.keys(clasificacion).length > 0)

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-end justify-between border-b border-ink-200 pb-4">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-1">Conciliar</div>
          <h1 className="h-page">Nueva conciliación</h1>
          {hayBorrador && (
            <div className="text-2xs text-ok mt-1 flex items-center gap-1">
              <Save size={11} /> Borrador guardado automáticamente
            </div>
          )}
        </div>
        {hayBorrador && (
          <button onClick={limpiarBorrador} className="btn btn-ghost text-danger">
            <Trash2 size={12} /> Limpiar borrador
          </button>
        )}
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
        {/* Selector de cuenta por sociedad */}
        {contraparteId && cuentasProveedor.length > 0 && (
          <div className="mt-3">
            <label className="label">Sociedad / Cuenta corriente *</label>
            <select
              value={cuentaProveedorId}
              onChange={e => setCuentaProveedorId(e.target.value)}
              className="input"
            >
              <option value="">— elegir cuenta —</option>
              {cuentasProveedor.map(c => (
                <option key={c.id} value={c.id}>
                  {c.sociedad_nombre} · {c.cuenta_interna}{c.descripcion ? ` (${c.descripcion})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {contraparteId && cuentasProveedor.length === 0 && (
          <div className="mt-3 text-2xs text-warn flex items-center gap-1">
            <AlertCircle size={12} /> Este proveedor no tiene cuentas asignadas.
            <a href="/plantillas" className="underline ml-1">Ir a Plantillas →</a>
          </div>
        )}

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

      {plantilla && !reglasFaltantes && !mapeoIncompleto && cuentaProveedorId && (
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

      {plantilla && !reglasFaltantes && !mapeoIncompleto && cuentaProveedorId && (
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

      {plantilla && !reglasFaltantes && !mapeoIncompleto && cuentaProveedorId && (
        <div className="flex justify-center py-2">
          <button
            onClick={ejecutar}
            disabled={!archivoCmp || !archivoCont || procesando}
            className="btn btn-primary btn-lg disabled:opacity-50 min-w-[280px]"
          >
            <Play size={16} />
            {procesando ? "Procesando..." : "Ejecutar conciliación"}
          </button>
        </div>
      )}
      {plantilla && !reglasFaltantes && !mapeoIncompleto && cuentaProveedorId && !archivoCmp && !archivoCont && !procesando && (
        <div className="text-center text-2xs text-ink-500">
          Subí los dos archivos (compañía y contraparte) para habilitar la conciliación
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
            {(resultado.sugerencias_agrupadas?.length ?? 0) > 0 && (
              <Tab active={tab === "sugerencias"} onClick={() => setTab("sugerencias")}>
                <span className="inline-flex items-center gap-1.5">
                  <span>Agrupados ({resultado.sugerencias_agrupadas.length})</span>
                  <span className="bg-warn-light text-warn text-2xs font-bold px-1.5 py-0.5 rounded">NUEVO</span>
                </span>
              </Tab>
            )}
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

          {tab === "sugerencias" && resultado.sugerencias_agrupadas && (
            <SugerenciasAgrupadasView
              sugerencias={resultado.sugerencias_agrupadas}
              movimientos={resultado.movimientos}
              rechazadas={sugerenciasRechazadas}
              aceptadas={sugerenciasAceptadas}
              onAceptar={(id) => {
                // Marcar movimientos como conciliados localmente
                const sug = resultado.sugerencias_agrupadas.find(s => s.id_unico === id)
                if (!sug) return
                const idsN = new Set(sug.movs_lado_n)
                for (const m of resultado.movimientos) {
                  if (idsN.has(m.id_unico) || m.id_unico === sug.mov_lado_1) {
                    m.estado = "conciliado"
                    m.match_id = m.id_unico === sug.mov_lado_1 ? sug.movs_lado_n[0] : sug.mov_lado_1
                  }
                }
                setSugerenciasAceptadas(new Set([...sugerenciasAceptadas, id]))
                // Forzar re-render
                setResultado({ ...resultado })
                toast.show(`Match agrupado aceptado (${sug.movs_lado_n.length} ↔ 1)`, "ok")
              }}
              onRechazar={(id) => {
                setSugerenciasRechazadas(new Set([...sugerenciasRechazadas, id]))
              }}
            />
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

// ============================================================
// Componente: Vista de sugerencias agrupadas (Nivel 4)
// ============================================================

function SugerenciasAgrupadasView({
  sugerencias,
  movimientos,
  rechazadas,
  aceptadas,
  onAceptar,
  onRechazar,
}: {
  sugerencias: import("@/lib/motor-conciliacion").SugerenciaAgrupada[]
  movimientos: import("@/types").MovimientoResultado[]
  rechazadas: Set<string>
  aceptadas: Set<string>
  onAceptar: (id: string) => void
  onRechazar: (id: string) => void
}) {
  const movsPorId = new Map(movimientos.map(m => [m.id_unico, m]))
  const pendientes = sugerencias.filter(s => !rechazadas.has(s.id_unico) && !aceptadas.has(s.id_unico))
  const yaAceptadas = sugerencias.filter(s => aceptadas.has(s.id_unico))

  if (sugerencias.length === 0) {
    return (
      <div className="card text-center py-8 text-sm text-ink-400 italic">
        No se detectaron matches agrupados sugeridos
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card bg-warn-light/30 border-warn/30">
        <div className="flex items-start gap-2">
          <div className="text-warn flex-shrink-0">⚠</div>
          <div className="text-xs text-ink-700">
            <strong>Sugerencias del motor — requieren tu validación.</strong>
            {" "}El motor detectó combinaciones donde la suma de varios movimientos coincide con uno solo del otro lado.
            Revisá cada caso y aceptá solo los que sean correctos. Aceptar marca los movimientos como conciliados.
          </div>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">
            Pendientes de revisar ({pendientes.length})
          </div>
          <div className="space-y-3">
            {pendientes.map(s => (
              <SugerenciaCard
                key={s.id_unico}
                sugerencia={s}
                movsPorId={movsPorId}
                onAceptar={() => onAceptar(s.id_unico)}
                onRechazar={() => onRechazar(s.id_unico)}
              />
            ))}
          </div>
        </div>
      )}

      {yaAceptadas.length > 0 && (
        <div>
          <div className="text-2xs uppercase tracking-wider text-ok font-semibold mb-2">
            ✓ Aceptadas ({yaAceptadas.length})
          </div>
          <div className="space-y-3">
            {yaAceptadas.map(s => (
              <SugerenciaCard
                key={s.id_unico}
                sugerencia={s}
                movsPorId={movsPorId}
                aceptada
              />
            ))}
          </div>
        </div>
      )}

      {rechazadas.size > 0 && (
        <div className="text-2xs text-ink-400 italic">
          {rechazadas.size} sugerencia(s) rechazada(s) — los movimientos siguen pendientes
        </div>
      )}
    </div>
  )
}

function SugerenciaCard({
  sugerencia: s,
  movsPorId,
  onAceptar,
  onRechazar,
  aceptada = false,
}: {
  sugerencia: import("@/lib/motor-conciliacion").SugerenciaAgrupada
  movsPorId: Map<string, import("@/types").MovimientoResultado>
  onAceptar?: () => void
  onRechazar?: () => void
  aceptada?: boolean
}) {
  const movsN = s.movs_lado_n.map(id => movsPorId.get(id)).filter(Boolean) as import("@/types").MovimientoResultado[]
  const movUno = movsPorId.get(s.mov_lado_1)
  const fmtNum = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2 })

  const scoreColor = s.score_confianza >= 70 ? "text-ok bg-ok-light" :
                     s.score_confianza >= 60 ? "text-warn bg-warn-light" :
                     "text-danger bg-danger-light"

  return (
    <div className={`card border ${aceptada ? "border-ok/30 bg-ok-light/10" : "border-ink-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xs uppercase tracking-wider text-ink-500 font-semibold">
            {s.tipo === "N_a_1" ? `${movsN.length} de compañía → 1 de contraparte` : `1 de compañía → ${movsN.length} de contraparte`}
          </span>
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>
            {s.score_confianza.toFixed(0)}% confianza
          </span>
        </div>
        {!aceptada && (
          <div className="flex gap-2">
            <button onClick={onRechazar} className="btn btn-secondary text-2xs py-1 px-2">
              Rechazar
            </button>
            <button onClick={onAceptar} className="btn btn-primary text-2xs py-1 px-2">
              ✓ Aceptar match
            </button>
          </div>
        )}
        {aceptada && (
          <span className="text-2xs text-ok font-semibold">✓ Aceptado</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Lado N */}
        <div className="border border-ink-200 rounded-md p-2 bg-ink-50">
          <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">
            {s.origen_n === "compania" ? "COMPAÑÍA" : "CONTRAPARTE"} · {movsN.length} comprobantes
          </div>
          <div className="space-y-1">
            {movsN.map(m => (
              <div key={m.id_unico} className="flex items-center gap-2 text-2xs py-1 border-b border-ink-100 last:border-0">
                <span className="text-ink-500 font-mono">{m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "—"}</span>
                <span className="flex-1 truncate">{m.tipo_original}</span>
                <span className="font-mono">{m.comprobante_raw}</span>
                <span className="num text-right font-semibold">{fmtNum(Math.abs(m.importe_ars))}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-ink-300 font-semibold">
              <span>Total</span>
              <span className="num">{fmtNum(s.total_lado_n_ars)}</span>
            </div>
          </div>
        </div>

        {/* Lado 1 */}
        <div className="border border-accent/30 rounded-md p-2 bg-accent/5">
          <div className="text-2xs uppercase tracking-wider text-accent font-semibold mb-2">
            {s.origen_1 === "compania" ? "COMPAÑÍA" : "CONTRAPARTE"} · 1 movimiento
          </div>
          {movUno && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-2xs py-1">
                <span className="text-ink-500 font-mono">{movUno.fecha ? new Date(movUno.fecha).toLocaleDateString("es-AR") : "—"}</span>
                <span className="flex-1 truncate">{movUno.tipo_original}</span>
                <span className="font-mono">{movUno.comprobante_raw}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-accent/30 font-semibold">
                <span>Importe</span>
                <span className="num">{fmtNum(s.importe_lado_1_ars)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diferencia */}
      <div className="mt-3 flex items-center justify-between text-2xs">
        <span className="text-ink-500">Diferencia:</span>
        <span className={`font-mono font-semibold ${Math.abs(s.diferencia_ars) < 1 ? "text-ok" : "text-warn"}`}>
          {Math.abs(s.diferencia_ars) < 1 ? "✓ Match exacto" : `${fmtNum(s.diferencia_ars)} ARS`}
        </span>
      </div>
    </div>
  )
}