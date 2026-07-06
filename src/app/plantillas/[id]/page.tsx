"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { registrar } from "@/lib/auditoria"
import { leerExcel } from "@/lib/excel-parser"
import { buscarMejorClave, filtrarFilasPorTipos } from "@/lib/autoclave"
import EditorClave from "@/components/EditorClave"
import type {
  PlantillaProveedor,
  MapeoCompania,
  MapeoContraparte,
  ReglaTipo,
  ConstructorClave,
} from "@/types"
import { ArrowLeft, Save, Upload, Plus, Trash2, ChevronDown, ChevronUp, FileWarning, History, Clock, ArrowUp, ArrowDown, GripVertical } from "lucide-react"
import { useToast } from "@/components/Toast"
import { mensajeError } from "@/lib/errores"
import Link from "next/link"

const MAPEO_VACIO_CMP: MapeoCompania = {
  fecha: "", tipo: "", comprobante: "", importe_ars: "",
}
const MAPEO_VACIO_CONT: MapeoContraparte = {
  fecha: "", tipo: "", comprobante: "", importe: "",
}

export default function EditarPlantillaPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const contraparteId = params.id
  const toast = useToast()

  const [contraparte, setContraparte] = useState<{ nombre: string } | null>(null)
  const [plantilla, setPlantilla] = useState<PlantillaProveedor | null>(null)
  // Distingue "todavía cargando" de "cargó pero no hay plantilla". Sin esto,
  // una contraparte sin plantilla dejaba `plantilla` en null y la pantalla se
  // quedaba en "Cargando..." para siempre.
  const [cargando, setCargando] = useState(true)
  const [creandoPlantilla, setCreandoPlantilla] = useState(false)

  const [muestraCmp, setMuestraCmp] = useState<{ columnas: string[]; filas: Record<string, unknown>[] }>({ columnas: [], filas: [] })
  const [muestraCont, setMuestraCont] = useState<{ columnas: string[]; filas: Record<string, unknown>[] }>({ columnas: [], filas: [] })

  const [guardando, setGuardando] = useState(false)
  const [reglaAbierta, setReglaAbierta] = useState<string | null>(null)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [historial, setHistorial] = useState<{
    id: string
    accion: string
    campo_modificado: string | null
    created_at: string
    usuario_id: string | null
    valor_anterior: any
    valor_nuevo: any
    nombre_usuario: string | null
  }[]>([])
  const [cargandoHist, setCargandoHist] = useState(false)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const { data: c } = await supabase.from("contrapartes").select("nombre").eq("id", contraparteId).maybeSingle()
      setContraparte(c)

      const { data: p } = await supabase.from("plantillas_proveedor").select("*").eq("contraparte_id", contraparteId).maybeSingle()
      if (p) {
        setPlantilla({
          id: p.id,
          contraparte_id: p.contraparte_id,
          mapeo_compania: p.mapeo_compania ?? MAPEO_VACIO_CMP,
          mapeo_contraparte: p.mapeo_contraparte ?? MAPEO_VACIO_CONT,
          reglas_tipos: p.reglas_tipos ?? [],
          tipos_sin_contraparte_compania: p.tipos_sin_contraparte_compania ?? [],
          tipos_sin_contraparte_externa: p.tipos_sin_contraparte_externa ?? [],
          config: p.config ?? { tolerancia_importe: 1, moneda_separada: true, ventana_dias_default: 5 },
        })
      } else {
        // Cargó pero no hay plantilla: dejamos plantilla en null y salimos del
        // estado de carga. El render ofrece crearla en vez de colgarse.
        setPlantilla(null)
      }
      setCargando(false)
    }
    cargar()
  }, [contraparteId])

  // Crea una plantilla vacía para esta contraparte y la carga en el editor.
  async function crearPlantilla() {
    setCreandoPlantilla(true)
    const { data, error } = await supabase
      .from("plantillas_proveedor")
      .insert({ contraparte_id: contraparteId })
      .select("*")
      .maybeSingle()

    if (error || !data) {
      toast.show(mensajeError(error, "No se pudo crear la plantilla"), "error")
      setCreandoPlantilla(false)
      return
    }

    setPlantilla({
      id: data.id,
      contraparte_id: data.contraparte_id,
      mapeo_compania: data.mapeo_compania ?? MAPEO_VACIO_CMP,
      mapeo_contraparte: data.mapeo_contraparte ?? MAPEO_VACIO_CONT,
      reglas_tipos: data.reglas_tipos ?? [],
      tipos_sin_contraparte_compania: data.tipos_sin_contraparte_compania ?? [],
      tipos_sin_contraparte_externa: data.tipos_sin_contraparte_externa ?? [],
      config: data.config ?? { tolerancia_importe: 1, moneda_separada: true, ventana_dias_default: 5 },
    })
    setCreandoPlantilla(false)
  }

  async function cargarHistorial() {
    setCargandoHist(true)

    let plantillaId = plantilla?.id
    if (!plantillaId) {
      const { data: p } = await supabase
        .from("plantillas_proveedor")
        .select("id")
        .eq("contraparte_id", contraparteId)
        .maybeSingle()
      plantillaId = p?.id
    }

    if (!plantillaId) {
      setHistorial([])
      setCargandoHist(false)
      return
    }

    const { data, error } = await supabase
      .from("plantillas_historial")
      .select("id, accion, campo_modificado, created_at, usuario_id, valor_anterior, valor_nuevo")
      .eq("plantilla_id", plantillaId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error || !data) {
      setHistorial([])
      setCargandoHist(false)
      return
    }

    const userIds = Array.from(new Set(data.map(h => h.usuario_id).filter(Boolean) as string[]))
    const nombresPorId: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("usuarios")
        .select("id, nombre")
        .in("id", userIds)
      for (const u of users ?? []) nombresPorId[u.id] = u.nombre
    }

    setHistorial(data.map(h => ({
      ...h,
      nombre_usuario: h.usuario_id ? (nombresPorId[h.usuario_id] ?? null) : null,
    })))
    setCargandoHist(false)
  }

  async function subirMuestra(file: File, lado: "compania" | "contraparte") {
    const r = await leerExcel(file)
    if (lado === "compania") setMuestraCmp({ columnas: r.columnas, filas: r.filas })
    else setMuestraCont({ columnas: r.columnas, filas: r.filas })
  }

  const [autoconfigCargando, setAutoconfigCargando] = useState(false)
  const [autoconfigError, setAutoconfigError] = useState<string | null>(null)
  const [autoconfigOk, setAutoconfigOk] = useState<string | null>(null)

  // Busca el mapeo de compania de otra plantilla ya configurada del grupo.
  // Las RLS aislan por grupo a nivel DB, asi que esto solo devuelve plantillas
  // del grupo del usuario. Devuelve null si es la primera plantilla del grupo.
  async function buscarMapeoCompaniaHeredado(): Promise<MapeoCompania | null> {
    const { data } = await supabase
      .from("plantillas_proveedor")
      .select("mapeo_compania")
      .neq("contraparte_id", contraparteId)   // que no sea esta misma
      .limit(20)

    for (const p of data ?? []) {
      const m = p?.mapeo_compania as MapeoCompania | null
      // Consideramos "configurada" si tiene al menos fecha e importe mapeados.
      if (m && m.fecha && m.importe_ars) return m
    }
    return null
  }

  async function autoconfigurar() {
    if (!plantilla) return
    if (muestraCmp.columnas.length === 0 || muestraCont.columnas.length === 0) {
      setAutoconfigError("Subí primero una muestra de cada lado (compañía y contraparte)")
      return
    }

    setAutoconfigCargando(true)
    setAutoconfigError(null)
    setAutoconfigOk(null)

    try {
      // Lado compania: si hay otra plantilla del grupo ya configurada,
      // heredamos su mapeo y no se lo pedimos a la IA.
      const heredado = await buscarMapeoCompaniaHeredado()

      // Tipos unicos COMPLETOS de cada lado, usando la columna tipo del mapeo
      // actual (o el heredado para compania).
      const colTipoCmp = (heredado?.tipo ?? plantilla.mapeo_compania.tipo) || ""
      const colTipoCont = plantilla.mapeo_contraparte.tipo || ""
      const tiposCmp = tiposUnicos(muestraCmp.filas, colTipoCmp)
      const tiposCont = tiposUnicos(muestraCont.filas, colTipoCont)

      const res = await fetch("/api/autoconfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compania: {
            columnas: muestraCmp.columnas,
            filas: muestraCmp.filas.slice(0, 8),
            tipos: tiposCmp,
          },
          contraparte: {
            columnas: muestraCont.columnas,
            filas: muestraCont.filas.slice(0, 8),
            tipos: tiposCont,
          },
          mapeo_compania_heredado: heredado,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setAutoconfigError(data?.error ?? "Error al autoconfigurar")
        setAutoconfigCargando(false)
        return
      }

      // Mapeos finales (lo que el modelo propuso, fusionado con lo existente).
      const mapeoCmpFinal = { ...plantilla.mapeo_compania, ...data.mapeo_compania }
      const mapeoContFinal = { ...plantilla.mapeo_contraparte, ...data.mapeo_contraparte }

      // ---- Etapa 3: construccion automatica de clave ----
      // Para cada regla de tipo "clave", buscamos el mejor par de
      // constructores probando candidatos contra las filas reales.
      const reglasPropuestas: ReglaTipo[] = data.reglas_tipos ?? plantilla.reglas_tipos
      let reglasConClave = 0

      const reglasFinales: ReglaTipo[] = reglasPropuestas.map((r) => {
        if (r.metodo_match !== "clave") return r

        // Filtrar las filas de muestra que corresponden a esta regla en cada lado.
        const filasCmpRegla = filtrarFilasPorTipos(
          muestraCmp.filas, mapeoCmpFinal.tipo, r.tipo_compania ?? []
        )
        const filasContRegla = filtrarFilasPorTipos(
          muestraCont.filas, mapeoContFinal.tipo, r.tipo_contraparte ?? []
        )

        const mejor = buscarMejorClave(
          filasCmpRegla, filasContRegla, mapeoCmpFinal, mapeoContFinal
        )

        if (mejor) {
          reglasConClave++
          return {
            ...r,
            clave_compania: mejor.clave_compania,
            clave_contraparte: mejor.clave_contraparte,
          }
        }
        // Si no se encontro clave que coincida, la dejamos sin clave para
        // que el usuario la arme a mano en el editor.
        return r
      })

      setPlantilla({
        ...plantilla,
        mapeo_compania: mapeoCmpFinal,
        mapeo_contraparte: mapeoContFinal,
        reglas_tipos: reglasFinales,
        tipos_sin_contraparte_compania: data.tipos_sin_contraparte_compania ?? plantilla.tipos_sin_contraparte_compania,
        tipos_sin_contraparte_externa: data.tipos_sin_contraparte_externa ?? plantilla.tipos_sin_contraparte_externa,
      })

      const nReglas = reglasFinales.length
      const origenCompania = heredado ? "mapeo de compañía heredado" : "mapeo de compañía inferido"
      setAutoconfigOk(
        `Propuesta aplicada (${origenCompania}, ${nReglas} regla(s), ${reglasConClave} con clave automática). Revisá abajo y guardá.`
      )
    } catch (e) {
      setAutoconfigError(e instanceof Error ? e.message : "Error de red al autoconfigurar")
    }

    setAutoconfigCargando(false)
  }

  function actualizar<K extends keyof PlantillaProveedor>(k: K, v: PlantillaProveedor[K]) {
    if (!plantilla) return
    setPlantilla({ ...plantilla, [k]: v })
  }

  function nuevaRegla() {
    if (!plantilla) return
    const id = `regla_${Date.now()}`
    const r: ReglaTipo = {
      id, label: "Nueva regla", tipo_compania: [], tipo_contraparte: [],
      metodo_match: "clave",
    }
    actualizar("reglas_tipos", [...plantilla.reglas_tipos, r])
    setReglaAbierta(id)
  }

  function actualizarRegla(idx: number, parcial: Partial<ReglaTipo>) {
    if (!plantilla) return
    const c = [...plantilla.reglas_tipos]
    c[idx] = { ...c[idx], ...parcial }
    actualizar("reglas_tipos", c)
  }

  function eliminarRegla(idx: number) {
    if (!plantilla) return
    if (!confirm("¿Eliminar esta regla?")) return
    actualizar("reglas_tipos", plantilla.reglas_tipos.filter((_, i) => i !== idx))
  }

  function reordenarPorDrag(fromId: string, toId: string) {
    if (!plantilla || fromId === toId) return
    const ordenadas = [...plantilla.reglas_tipos].sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100))
    const fromIdx = ordenadas.findIndex(r => r.id === fromId)
    const toIdx = ordenadas.findIndex(r => r.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const result = [...ordenadas]
    const [moved] = result.splice(fromIdx, 1)
    result.splice(toIdx, 0, moved)
    const conPrio = result.map((r, i) => ({ ...r, prioridad: (i + 1) * 10 }))
    setPlantilla({ ...plantilla, reglas_tipos: conPrio })
  }

  async function guardar() {
    if (!plantilla) return
    setGuardando(true)

    const { data: anterior } = await supabase
      .from("plantillas_proveedor")
      .select("mapeo_compania, mapeo_contraparte, reglas_tipos, tipos_sin_contraparte_compania, tipos_sin_contraparte_externa, config")
      .eq("id", plantilla.id)
      .single()

    const { error } = await supabase
      .from("plantillas_proveedor")
      .update({
        mapeo_compania: plantilla.mapeo_compania,
        mapeo_contraparte: plantilla.mapeo_contraparte,
        reglas_tipos: plantilla.reglas_tipos,
        tipos_sin_contraparte_compania: plantilla.tipos_sin_contraparte_compania,
        tipos_sin_contraparte_externa: plantilla.tipos_sin_contraparte_externa,
        config: plantilla.config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plantilla.id)

    if (error) {
      setGuardando(false)
      toast.show(mensajeError(error, "No se pudo guardar la plantilla"), "error")
      return
    }

    if (anterior) {
      const { data: { user } } = await supabase.auth.getUser()
      const registros = []

      if (JSON.stringify(anterior.mapeo_compania) !== JSON.stringify(plantilla.mapeo_compania)) {
        registros.push({
          plantilla_id: plantilla.id,
          usuario_id: user?.id ?? null,
          accion: "modificada" as const,
          campo_modificado: "mapeo_compania",
          valor_anterior: anterior.mapeo_compania,
          valor_nuevo: plantilla.mapeo_compania,
        })
      }
      if (JSON.stringify(anterior.mapeo_contraparte) !== JSON.stringify(plantilla.mapeo_contraparte)) {
        registros.push({
          plantilla_id: plantilla.id,
          usuario_id: user?.id ?? null,
          accion: "modificada" as const,
          campo_modificado: "mapeo_contraparte",
          valor_anterior: anterior.mapeo_contraparte,
          valor_nuevo: plantilla.mapeo_contraparte,
        })
      }

      const reglasAnt = (anterior.reglas_tipos ?? []) as ReglaTipo[]
      const reglasNew = plantilla.reglas_tipos
      const idsAnt = new Set(reglasAnt.map((r: ReglaTipo) => r.id))
      const idsNew = new Set(reglasNew.map(r => r.id))

      for (const r of reglasNew) {
        if (!idsAnt.has(r.id)) {
          registros.push({
            plantilla_id: plantilla.id,
            usuario_id: user?.id ?? null,
            accion: "regla_agregada" as const,
            campo_modificado: r.id,
            valor_anterior: null,
            valor_nuevo: r,
          })
        }
      }
      for (const r of reglasAnt) {
        if (!idsNew.has(r.id)) {
          registros.push({
            plantilla_id: plantilla.id,
            usuario_id: user?.id ?? null,
            accion: "regla_eliminada" as const,
            campo_modificado: r.id,
            valor_anterior: r,
            valor_nuevo: null,
          })
        }
      }

      if (JSON.stringify(anterior.tipos_sin_contraparte_compania) !== JSON.stringify(plantilla.tipos_sin_contraparte_compania) ||
          JSON.stringify(anterior.tipos_sin_contraparte_externa) !== JSON.stringify(plantilla.tipos_sin_contraparte_externa)) {
        registros.push({
          plantilla_id: plantilla.id,
          usuario_id: user?.id ?? null,
          accion: "modificada" as const,
          campo_modificado: "tipos_sin_contraparte",
          valor_anterior: { compania: anterior.tipos_sin_contraparte_compania, externa: anterior.tipos_sin_contraparte_externa },
          valor_nuevo: { compania: plantilla.tipos_sin_contraparte_compania, externa: plantilla.tipos_sin_contraparte_externa },
        })
      }

      if (registros.length > 0) {
        await registrar(supabase, {
          accion: "plantilla_modificada",
          tabla_afectada: "plantillas_proveedor",
          registro_id: plantilla.id,
          observacion: `${registros.length} campo(s) modificado(s)`,
        })
        await supabase.from("plantillas_historial").insert(registros)
      }
    }

    setGuardando(false)
    toast.show("✓ Plantilla guardada", "ok")
  }

  // 1. Todavía cargando.
  if (cargando) {
    return <div className="text-sm text-ink-400 px-6 py-16 text-center">Cargando...</div>
  }

  // 2. La contraparte no existe.
  if (!contraparte) {
    return (
      <div className="px-6 py-16 text-center">
        <FileWarning size={32} className="mx-auto text-ink-300 mb-3" />
        <div className="text-base font-semibold">No se encontró la contraparte</div>
        <Link href="/plantillas" className="btn btn-secondary inline-flex mt-4">
          <ArrowLeft size={14} /> Volver a cuentas
        </Link>
      </div>
    )
  }

  // 3. La contraparte existe pero no tiene plantilla: ofrecer crearla en vez de
  //    quedarse colgado en "Cargando..." (bug anterior).
  if (!plantilla) {
    return (
      <div className="px-6 py-16">
        <div className="max-w-md mx-auto text-center">
          <FileWarning size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">
            {contraparte.nombre} todavía no tiene una plantilla
          </div>
          <p className="text-sm text-ink-500 mt-2 mb-6 leading-relaxed">
            La plantilla define cómo se leen y concilian los archivos de esta contraparte.
            Creá una para empezar a configurar el mapeo de columnas y las reglas.
          </p>
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={crearPlantilla}
              disabled={creandoPlantilla}
              className="btn btn-primary inline-flex disabled:opacity-50"
            >
              <Plus size={14} /> {creandoPlantilla ? "Creando…" : "Crear plantilla"}
            </button>
            <Link href="/plantillas" className="btn btn-secondary inline-flex">
              <ArrowLeft size={14} /> Volver
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <Link href="/plantillas" className="text-2xs uppercase tracking-[0.2em] text-ink-500 hover:text-accent inline-flex items-center gap-1">
            <ArrowLeft size={11} /> Plantillas
          </Link>
          <h1 className="h-page mt-2">{contraparte.nombre}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMostrarHistorial(v => !v)
              if (!mostrarHistorial) cargarHistorial()
            }}
            className={`btn btn-secondary flex items-center gap-1.5 ${mostrarHistorial ? "bg-ink-100" : ""}`}
          >
            <History size={14} /> Historial
          </button>
          <button onClick={guardar} disabled={guardando} className="btn btn-primary">
            <Save size={14} /> {guardando ? "Guardando..." : "Guardar plantilla"}
          </button>
        </div>
      </div>

      {/* Panel historial */}
      {mostrarHistorial && (
        <div className="card border-ink-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <History size={14} className="text-ink-400" />
              Historial de cambios
            </div>
            <button onClick={() => setMostrarHistorial(false)} className="text-2xs text-ink-400 hover:text-accent">
              Cerrar
            </button>
          </div>

          {cargandoHist ? (
            <div className="text-xs text-ink-400 py-4 text-center">Cargando…</div>
          ) : historial.length === 0 ? (
            <div className="text-xs text-ink-400 py-4 text-center italic">
              Sin cambios registrados — los cambios se registran cada vez que guardás la plantilla.
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {historial.map(h => {
                const accionLabel: Record<string, string> = {
                  modificada: "Modificó",
                  regla_agregada: "Agregó regla",
                  regla_eliminada: "Eliminó regla",
                  tipo_agregado: "Agregó tipo",
                  tipo_eliminado: "Eliminó tipo",
                  creada: "Creó la plantilla",
                }
                const campoLabel: Record<string, string> = {
                  mapeo_compania: "Mapeo compañía",
                  mapeo_contraparte: "Mapeo contraparte",
                  tipos_sin_contraparte: "Tipos sin contraparte",
                }
                return (
                  <div key={h.id} className="flex items-start gap-3 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-xs">
                        <span className="font-semibold text-ink-700">{h.nombre_usuario ?? "Usuario desconocido"}</span>
                        <span className="text-ink-500"> · {accionLabel[h.accion] ?? h.accion}</span>
                        {h.campo_modificado && (
                          <span className="text-ink-400">
                            {" "}— {campoLabel[h.campo_modificado] ?? h.campo_modificado}
                          </span>
                        )}
                      </div>
                      <DiffHistorial accion={h.accion} campo={h.campo_modificado} anterior={h.valor_anterior} nuevo={h.valor_nuevo} />
                      <div className="text-2xs text-ink-400 flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(h.created_at).toLocaleString("es-AR")}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Subir muestras */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SubirMuestra
          label="Muestra de archivo COMPAÑÍA"
          info="Para detectar las columnas y poder armar el mapeo y las claves"
          columnas={muestraCmp.columnas}
          filas={muestraCmp.filas.length}
          onFile={(f) => subirMuestra(f, "compania")}
        />
        <SubirMuestra
          label="Muestra de archivo CONTRAPARTE"
          info={`Reporte que envía ${contraparte.nombre}`}
          columnas={muestraCont.columnas}
          filas={muestraCont.filas.length}
          onFile={(f) => subirMuestra(f, "contraparte")}
        />
      </section>

      {/* Autoconfigurar con IA */}
      <section className="card border-accent/40 bg-accent-light/30 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-900">Autoconfigurar plantilla</div>
            <p className="text-xs text-ink-500">
              Analiza las muestras y propone el mapeo de columnas y las reglas de tipos.
              Revisá y ajustá la propuesta antes de guardar.
            </p>
          </div>
          <button
            onClick={autoconfigurar}
            disabled={autoconfigCargando || muestraCmp.columnas.length === 0 || muestraCont.columnas.length === 0}
            className="btn btn-primary whitespace-nowrap"
          >
            {autoconfigCargando ? "Analizando…" : "Autoconfigurar"}
          </button>
        </div>
        {autoconfigError && (
          <div className="text-xs text-danger bg-danger-light px-2.5 py-1.5 rounded">
            {autoconfigError}
          </div>
        )}
        {autoconfigOk && (
          <div className="text-xs text-ok bg-ok-light px-2.5 py-1.5 rounded">
            {autoconfigOk}
          </div>
        )}
      </section>

      {/* Mapeo de columnas */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MapeoColumnas
          titulo="Columnas COMPAÑÍA"
          columnas={muestraCmp.columnas}
          campos={[
            { key: "fecha", label: "Fecha", req: true },
            { key: "tipo", label: "Tipo movimiento", req: true },
            { key: "comprobante", label: "Nro comprobante", req: true },
            { key: "sucursal", label: "Sucursal", req: false },
            { key: "letra", label: "Letra", req: false },
            { key: "importe_ars", label: "Importe ARS", req: true, flagInvertir: "importe_ars_invertir" },
            { key: "importe_usd", label: "Importe USD", req: false, flagInvertir: "importe_usd_invertir" },
            { key: "descripcion", label: "Descripción", req: false },
          ]}
          valor={plantilla.mapeo_compania as unknown as Record<string, string | boolean>}
          onChange={(v) => actualizar("mapeo_compania", v as unknown as MapeoCompania)}
        />
        <MapeoColumnas
          titulo="Columnas CONTRAPARTE"
          columnas={muestraCont.columnas}
          campos={[
            { key: "fecha", label: "Fecha", req: true },
            { key: "tipo", label: "Tipo documento", req: true },
            { key: "comprobante", label: "Nro legal del documento", req: true },
            { key: "importe", label: "Importe", req: true, flagInvertir: "importe_invertir" },
            { key: "moneda", label: "Moneda", req: false },
            { key: "descripcion", label: "Descripción", req: false },
          ]}
          valor={plantilla.mapeo_contraparte as unknown as Record<string, string | boolean>}
          onChange={(v) => actualizar("mapeo_contraparte", v as unknown as MapeoContraparte)}
        />
      </section>

      {/* Reglas de tipos */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-1">Reglas</div>
            <h2 className="h-section">Reglas de tipos y construcción de claves</h2>
            <p className="text-sm text-ink-500 mt-1">
              Para cada par de tipos equivalentes (LIQUIDACION ↔ LPG-LIQUIDACION-COMPRAS) definí cómo armar la clave.
            </p>
          </div>
          <button onClick={nuevaRegla} className="btn btn-secondary">
            <Plus size={14} /> Nueva regla
          </button>
        </div>

        {plantilla.reglas_tipos.length === 0 && (
          <div className="card text-center py-8">
            <FileWarning size={28} className="mx-auto text-ink-300 mb-2" />
            <div className="text-sm text-ink-500">Sin reglas. Agregá la primera.</div>
          </div>
        )}

        {[...plantilla.reglas_tipos]
          .map((r, originalIdx) => ({ regla: r, originalIdx }))
          .sort((a, b) => (a.regla.prioridad ?? 100) - (b.regla.prioridad ?? 100))
          .map(({ regla, originalIdx }, posicionVisible) => {
            const reglasOrdenadas = [...plantilla.reglas_tipos].sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100))
            const esPrimero = posicionVisible === 0
            const esUltimo = posicionVisible === reglasOrdenadas.length - 1
            return (
              <div
                key={regla.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("reglaId", regla.id); e.dataTransfer.effectAllowed = "move" }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(regla.id) }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { e.preventDefault(); const fromId = e.dataTransfer.getData("reglaId"); reordenarPorDrag(fromId, regla.id); setDragOverId(null) }}
                onDragEnd={() => setDragOverId(null)}
                className={`transition-all ${dragOverId === regla.id ? "ring-2 ring-accent ring-offset-1 opacity-80" : ""}`}
              >
                <ReglaCard
                  regla={regla}
                  posicion={posicionVisible + 1}
                  totalReglas={reglasOrdenadas.length}
                  abierta={reglaAbierta === regla.id}
                  onToggle={() => setReglaAbierta(reglaAbierta === regla.id ? null : regla.id)}
                  onChange={(parcial) => actualizarRegla(originalIdx, parcial)}
                  onDelete={() => eliminarRegla(originalIdx)}
                  onSubirPrioridad={esPrimero ? undefined : () => {
                    const conPrio = reglasOrdenadas.map((r, i) => ({ ...r, prioridad: (i + 1) * 10 }))
                    const tmp = conPrio[posicionVisible].prioridad!
                    conPrio[posicionVisible].prioridad = conPrio[posicionVisible - 1].prioridad
                    conPrio[posicionVisible - 1].prioridad = tmp
                    setPlantilla({ ...plantilla, reglas_tipos: conPrio })
                  }}
                  onBajarPrioridad={esUltimo ? undefined : () => {
                    const conPrio = reglasOrdenadas.map((r, i) => ({ ...r, prioridad: (i + 1) * 10 }))
                    const tmp = conPrio[posicionVisible].prioridad!
                    conPrio[posicionVisible].prioridad = conPrio[posicionVisible + 1].prioridad
                    conPrio[posicionVisible + 1].prioridad = tmp
                    setPlantilla({ ...plantilla, reglas_tipos: conPrio })
                  }}
                  columnasCmp={muestraCmp.columnas}
                  columnasCont={muestraCont.columnas}
                  filaMuestraCmp={muestraCmp.filas[1]}
                  filaMuestraCont={muestraCont.filas[1]}
                  tiposCmpEnArchivo={tiposUnicos(muestraCmp.filas, plantilla.mapeo_compania.tipo)}
                  tiposContEnArchivo={tiposUnicos(muestraCont.filas, plantilla.mapeo_contraparte.tipo)}
                  contraparteId={contraparteId}
                />
              </div>
            )
          })}
      </section>

      {/* Tipos sin contraparte */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListaSimple
          titulo="Tipos compañía SIN contraparte"
          subtitulo="Diferencias de cambio, ajustes, notas internas — quedan como ajuste propio"
          items={plantilla.tipos_sin_contraparte_compania}
          sugerencias={tiposUnicos(muestraCmp.filas, plantilla.mapeo_compania.tipo)}
          onChange={(v) => actualizar("tipos_sin_contraparte_compania", v)}
        />
        <ListaSimple
          titulo="Tipos contraparte SIN reflejo"
          subtitulo="Ajustes internos del proveedor"
          items={plantilla.tipos_sin_contraparte_externa}
          sugerencias={tiposUnicos(muestraCont.filas, plantilla.mapeo_contraparte.tipo)}
          onChange={(v) => actualizar("tipos_sin_contraparte_externa", v)}
        />
      </section>
    </div>
  )
}

// ----- Subcomponentes -----

function SubirMuestra({
  label, info, columnas, filas, onFile,
}: { label: string; info: string; columnas: string[]; filas: number; onFile: (f: File) => void }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <p className="text-xs text-ink-500 mb-3">{info}</p>
      <label className="btn btn-secondary cursor-pointer">
        <Upload size={14} />
        {filas > 0 ? `Reemplazar (${filas} filas)` : "Subir Excel de ejemplo"}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {columnas.length > 0 && (
        <div className="mt-3 text-2xs text-ink-500">
          {columnas.length} columnas detectadas
        </div>
      )}
    </div>
  )
}

function MapeoColumnas({
  titulo, columnas, campos, valor, onChange,
}: {
  titulo: string
  columnas: string[]
  campos: { key: string; label: string; req: boolean; flagInvertir?: string }[]
  valor: Record<string, string | boolean>
  onChange: (v: Record<string, string | boolean>) => void
}) {
  return (
    <div className="card">
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">{titulo}</div>
      <div className="space-y-2">
        {campos.map((c) => (
          <div key={c.key} className="flex items-start gap-2">
            <label className="text-xs text-ink-700 w-32 flex-shrink-0 pt-1.5">
              {c.label} {c.req && <span className="text-error">*</span>}
            </label>
            <div className="flex-1 space-y-1">
              <select
                value={(valor[c.key] as string) ?? ""}
                onChange={(e) => onChange({ ...valor, [c.key]: e.target.value })}
                className="input text-xs w-full"
              >
                <option value="">— ninguna —</option>
                {columnas.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {c.flagInvertir && (valor[c.key] as string) && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={!!valor[c.flagInvertir]}
                    onChange={(e) => onChange({ ...valor, [c.flagInvertir!]: e.target.checked })}
                    className="w-3 h-3 accent-brand"
                  />
                  <span className="text-2xs text-ink-500">Invertir signo (×−1)</span>
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReglaCard({
  regla, posicion, totalReglas, abierta, onToggle, onChange, onDelete,
  onSubirPrioridad, onBajarPrioridad,
  columnasCmp, columnasCont, filaMuestraCmp, filaMuestraCont,
  tiposCmpEnArchivo, tiposContEnArchivo,
  contraparteId,
}: {
  regla: ReglaTipo
  posicion: number
  totalReglas: number
  abierta: boolean
  onToggle: () => void
  onChange: (parcial: Partial<ReglaTipo>) => void
  onDelete: () => void
  onSubirPrioridad?: () => void
  onBajarPrioridad?: () => void
  columnasCmp: string[]
  columnasCont: string[]
  filaMuestraCmp?: Record<string, unknown>
  filaMuestraCont?: Record<string, unknown>
  tiposCmpEnArchivo: string[]
  tiposContEnArchivo: string[]
  contraparteId: string
}) {
  return (
    <div className="card-tight">
      <div className="flex items-center justify-between gap-3">
        {/* Handle de drag + flechas de prioridad */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div
            className="cursor-grab active:cursor-grabbing text-ink-300 hover:text-ink-500 transition-colors px-0.5"
            title="Arrastrá para reordenar"
          >
            <GripVertical size={16} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={onSubirPrioridad}
              disabled={!onSubirPrioridad}
              className="text-ink-400 hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Subir prioridad"
            >
              <ArrowUp size={11} />
            </button>
            <span className="text-2xs font-mono font-bold text-ink-500 bg-ink-100 rounded px-1.5 py-0.5 min-w-[24px] text-center">
              {posicion}
            </span>
            <button
              onClick={onBajarPrioridad}
              disabled={!onBajarPrioridad}
              className="text-ink-400 hover:text-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title="Bajar prioridad"
            >
              <ArrowDown size={11} />
            </button>
          </div>
        </div>

        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left">
          {abierta ? <ChevronUp size={14} className="text-ink-400" /> : <ChevronDown size={14} className="text-ink-400" />}
          <input
            value={regla.label}
            onChange={(e) => onChange({ label: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold bg-transparent flex-1 focus:outline-none focus:bg-ink-50 rounded px-1"
            placeholder="Nombre de la regla"
          />
          <span className="badge badge-ink">{regla.metodo_match}</span>
          <span className="text-2xs text-ink-400">
            {regla.tipo_compania.length} ↔ {regla.tipo_contraparte.length}
          </span>
        </button>
        <button onClick={onDelete} className="btn btn-danger p-1">
          <Trash2 size={14} />
        </button>
      </div>

      {abierta && (
        <div className="mt-4 pt-4 border-t border-ink-200 space-y-5">
          {/* Tipos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SelectorTipos
              label="Tipos COMPAÑÍA"
              valor={regla.tipo_compania}
              sugerencias={tiposCmpEnArchivo}
              onChange={(v) => onChange({ tipo_compania: v })}
            />
            <SelectorTipos
              label="Tipos CONTRAPARTE"
              valor={regla.tipo_contraparte}
              sugerencias={tiposContEnArchivo}
              onChange={(v) => onChange({ tipo_contraparte: v })}
            />
          </div>

          {/* Método de match */}
          <div>
            <div className="label">Método de match</div>
            <div className="grid grid-cols-3 gap-2">
              <BotonRadio
                activo={regla.metodo_match === "clave"}
                onClick={() => onChange({ metodo_match: "clave" })}
                titulo="Por clave"
                desc="Construir clave en cada lado y matchear"
              />
              <BotonRadio
                activo={regla.metodo_match === "importe_fecha"}
                onClick={() => onChange({ metodo_match: "importe_fecha" })}
                titulo="Importe + fecha"
                desc="Para Recibos ↔ OP donde el nro no coincide"
              />
              <BotonRadio
                activo={regla.metodo_match === "manual"}
                onClick={() => onChange({ metodo_match: "manual" })}
                titulo="Manual"
                desc="No auto-conciliar, marcar para revisión"
              />
            </div>
          </div>

          {/* Constructor de claves — con contraparteId para "Probar clave" */}
          {regla.metodo_match === "clave" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EditorClave
                  label="Clave compañía"
                  constructor={regla.clave_compania}
                  columnasDisponibles={columnasCmp}
                  filaMuestra={filaMuestraCmp}
                  onChange={(c) => onChange({ clave_compania: c })}
                  contraparteId={contraparteId}
                  constructorOtroLado={regla.clave_contraparte}
                />
                <EditorClave
                  label="Clave contraparte"
                  constructor={regla.clave_contraparte}
                  columnasDisponibles={columnasCont}
                  filaMuestra={filaMuestraCont}
                  onChange={(c) => onChange({ clave_contraparte: c })}
                  contraparteId={contraparteId}
                  constructorOtroLado={regla.clave_compania}
                />
              </div>
              {/* Tolerancia de importe para esta regla (opcional, overridea el global) */}
              <div className="border border-ink-200 rounded-md p-3 bg-ink-50 space-y-1">
                <div className="label flex items-center gap-2">
                  Tolerancia de importe
                  {regla.tolerancia_importe_override !== undefined && (
                    <span className="text-accent font-normal normal-case text-2xs bg-accent-light px-1.5 py-0.5 rounded">
                      override activo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={regla.tolerancia_importe_override ?? ""}
                    placeholder="Vacío = usa el global de la plantilla"
                    onChange={(e) => onChange({
                      tolerancia_importe_override: e.target.value === "" ? undefined : Number(e.target.value)
                    })}
                    className="input w-64"
                  />
                  {regla.tolerancia_importe_override !== undefined && (
                    <button
                      type="button"
                      onClick={() => onChange({ tolerancia_importe_override: undefined })}
                      className="text-xs text-ink-400 hover:text-danger underline"
                    >
                      Volver al global
                    </button>
                  )}
                </div>
                <div className="text-2xs text-ink-400">
                  Diferencia máxima en $ entre importes para considerar match exacto. Dejá vacío para usar el valor global de la plantilla.
                </div>
              </div>
            </>
          )}

          {regla.metodo_match === "importe_fecha" && (
            <div className="border border-ink-200 rounded-md p-3 bg-ink-50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="label">Ventana de fechas (días)</div>
                  <input
                    type="number"
                    min={0}
                    value={regla.ventana_dias ?? 5}
                    onChange={(e) => onChange({ ventana_dias: Number(e.target.value) })}
                    className="input w-full"
                  />
                  <div className="text-2xs text-ink-400">
                    Días de diferencia aceptables entre fechas del mismo movimiento (±).
                    Recomendado: 3–5 días para pagos típicos.
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="label flex items-center gap-2">
                    Tolerancia de importe
                    {regla.tolerancia_importe_override !== undefined && (
                      <span className="text-accent font-normal normal-case text-2xs bg-accent-light px-1.5 py-0.5 rounded">
                        override activo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={regla.tolerancia_importe_override ?? ""}
                      placeholder="Vacío = usa el global"
                      onChange={(e) => onChange({
                        tolerancia_importe_override: e.target.value === "" ? undefined : Number(e.target.value)
                      })}
                      className="input w-full"
                    />
                    {regla.tolerancia_importe_override !== undefined && (
                      <button
                        type="button"
                        onClick={() => onChange({ tolerancia_importe_override: undefined })}
                        className="text-xs text-ink-400 hover:text-danger underline whitespace-nowrap"
                      >
                        Volver al global
                      </button>
                    )}
                  </div>
                  <div className="text-2xs text-ink-400">
                    Diferencia máxima en $ entre importes para considerar match.
                    0 = exacto. Dejá vacío para usar el global de la plantilla.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SelectorTipos({
  label, valor, sugerencias, onChange,
}: { label: string; valor: string[]; sugerencias: string[]; onChange: (v: string[]) => void }) {
  function toggle(t: string) {
    if (valor.includes(t)) onChange(valor.filter((x) => x !== t))
    else onChange([...valor, t])
  }
  return (
    <div>
      <div className="label">{label}</div>
      {sugerencias.length === 0 ? (
        <div className="text-2xs text-ink-400 italic">Subí una muestra del archivo para ver los tipos detectados</div>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1 border border-ink-200 rounded-md p-1.5 bg-ink-50">
          {sugerencias.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${
                valor.includes(t)
                  ? "bg-accent text-white"
                  : "bg-white border border-ink-200 hover:border-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BotonRadio({ activo, onClick, titulo, desc }: { activo: boolean; onClick: () => void; titulo: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-all ${
        activo ? "border-accent bg-accent-light" : "border-ink-200 hover:border-ink-400"
      }`}
    >
      <div className="text-sm font-medium text-ink-900">{titulo}</div>
      <div className="text-2xs text-ink-500 mt-0.5">{desc}</div>
    </button>
  )
}

function ListaSimple({
  titulo, subtitulo, items, sugerencias, onChange,
}: { titulo: string; subtitulo: string; items: string[]; sugerencias: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="card">
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">{titulo}</div>
      <p className="text-xs text-ink-500 mb-3">{subtitulo}</p>
      <div className="space-y-1.5 mb-2">
        {items.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs flex-1 truncate">{t}</span>
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="btn btn-danger p-1"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {sugerencias.filter((s) => !items.includes(s)).slice(0, 12).map((s) => (
          <button
            key={s}
            onClick={() => onChange([...items, s])}
            className="text-2xs px-2 py-0.5 border border-ink-200 rounded hover:border-accent hover:text-accent"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function tiposUnicos(filas: Record<string, unknown>[], col: string): string[] {
  if (!col) return []
  const set = new Set<string>()
  for (const f of filas) {
    const v = f[col]
    if (v !== null && v !== undefined && v !== "") set.add(String(v).trim())
  }
  return Array.from(set).sort()
}

function DiffHistorial({ accion, campo, anterior, nuevo }: {
  accion: string
  campo: string | null
  anterior: any
  nuevo: any
}) {
  if (campo === "tipos_sin_contraparte" && anterior && nuevo) {
    const setAntCmp = new Set<string>(anterior.compania ?? [])
    const setNewCmp = new Set<string>(nuevo.compania ?? [])
    const setAntExt = new Set<string>(anterior.externa ?? [])
    const setNewExt = new Set<string>(nuevo.externa ?? [])

    const agregadosCmp = [...setNewCmp].filter(x => !setAntCmp.has(x))
    const eliminadosCmp = [...setAntCmp].filter(x => !setNewCmp.has(x))
    const agregadosExt = [...setNewExt].filter(x => !setAntExt.has(x))
    const eliminadosExt = [...setAntExt].filter(x => !setNewExt.has(x))

    return (
      <div className="text-2xs space-y-1 pl-2 border-l-2 border-ink-100">
        {agregadosCmp.map(t => (
          <div key={"a-c-"+t} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-ok-light text-ok font-semibold px-1.5 py-0.5 rounded">AGREGÓ</span>
            <span className="text-ink-500">en Compañía:</span>
            <span className="font-mono">{t}</span>
          </div>
        ))}
        {eliminadosCmp.map(t => (
          <div key={"d-c-"+t} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-danger-light text-danger font-semibold px-1.5 py-0.5 rounded">ELIMINÓ</span>
            <span className="text-ink-500">de Compañía:</span>
            <span className="font-mono">{t}</span>
          </div>
        ))}
        {agregadosExt.map(t => (
          <div key={"a-e-"+t} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-ok-light text-ok font-semibold px-1.5 py-0.5 rounded">AGREGÓ</span>
            <span className="text-ink-500">en Externa:</span>
            <span className="font-mono">{t}</span>
          </div>
        ))}
        {eliminadosExt.map(t => (
          <div key={"d-e-"+t} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-danger-light text-danger font-semibold px-1.5 py-0.5 rounded">ELIMINÓ</span>
            <span className="text-ink-500">de Externa:</span>
            <span className="font-mono">{t}</span>
          </div>
        ))}
      </div>
    )
  }

  if (accion === "regla_agregada" && nuevo) {
    return (
      <div className="text-2xs pl-2 border-l-2 border-ok/30 flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 bg-ok-light text-ok font-semibold px-1.5 py-0.5 rounded">AGREGÓ REGLA</span>
        <span className="font-semibold">{nuevo.label ?? nuevo.id}</span>
        {nuevo.tipo_compania?.length > 0 && <span className="text-ink-500">· Comp: {nuevo.tipo_compania.join(", ")}</span>}
        {nuevo.tipo_contraparte?.length > 0 && <span className="text-ink-500">· Cont: {nuevo.tipo_contraparte.join(", ")}</span>}
      </div>
    )
  }
  if (accion === "regla_eliminada" && anterior) {
    return (
      <div className="text-2xs pl-2 border-l-2 border-danger/30 flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 bg-danger-light text-danger font-semibold px-1.5 py-0.5 rounded">ELIMINÓ REGLA</span>
        <span className="font-semibold">{anterior.label ?? anterior.id}</span>
      </div>
    )
  }

  if ((campo === "mapeo_compania" || campo === "mapeo_contraparte") && anterior && nuevo) {
    const cambios: { campo: string; antes: string; despues: string }[] = []
    const keys = new Set([...Object.keys(anterior), ...Object.keys(nuevo)])
    for (const k of keys) {
      const a = anterior[k]
      const n = nuevo[k]
      if (JSON.stringify(a) !== JSON.stringify(n)) {
        cambios.push({ campo: k, antes: a ?? "—", despues: n ?? "—" })
      }
    }
    return (
      <div className="text-2xs space-y-1 pl-2 border-l-2 border-ink-100">
        {cambios.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-warn-light text-warn font-semibold px-1.5 py-0.5 rounded">CAMBIÓ</span>
            <span className="font-mono text-ink-500">{c.campo}:</span>
            <span className="text-danger line-through">{c.antes}</span>
            <span className="text-ink-400">→</span>
            <span className="text-ok font-semibold">{c.despues}</span>
          </div>
        ))}
      </div>
    )
  }

  return null
}
