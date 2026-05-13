"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { leerExcel } from "@/lib/excel-parser"
import EditorClave from "@/components/EditorClave"
import type {
  PlantillaProveedor,
  MapeoCompania,
  MapeoContraparte,
  ReglaTipo,
  ConstructorClave,
} from "@/types"
import { ArrowLeft, Save, Upload, Plus, Trash2, ChevronDown, ChevronUp, FileWarning, History, Clock, ArrowUp, ArrowDown } from "lucide-react"
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

  const [contraparte, setContraparte] = useState<{ nombre: string } | null>(null)
  const [plantilla, setPlantilla] = useState<PlantillaProveedor | null>(null)

  // muestras de archivos cargados (para preview de claves y selectores de columna)
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

  useEffect(() => {
    async function cargar() {
      const { data: c } = await supabase.from("contrapartes").select("nombre").eq("id", contraparteId).single()
      setContraparte(c)

      const { data: p } = await supabase.from("plantillas_proveedor").select("*").eq("contraparte_id", contraparteId).single()
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
      }
    }
    cargar()
  }, [contraparteId])

  async function cargarHistorial() {
    setCargandoHist(true)

    // Obtener plantilla_id de forma robusta
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

    // Resolver nombres de usuarios
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

  async function guardar() {
    if (!plantilla) return
    setGuardando(true)

    // Leer versión anterior para comparar
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
      alert("Error al guardar: " + error.message)
      return
    }

    // Registrar en historial qué cambió
    if (anterior) {
      const { data: { user } } = await supabase.auth.getUser()
      const registros = []

      // Detectar cambios en mapeo
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

      // Detectar reglas agregadas/eliminadas
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

      // Detectar tipos sin contraparte modificados
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
        await supabase.from("plantillas_historial").insert(registros)
      }
    }

    setGuardando(false)
    alert("Plantilla guardada")
  }

  if (!plantilla || !contraparte) {
    return <div className="text-sm text-ink-400">Cargando...</div>
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

                      {/* Diff visual */}
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
            { key: "importe_ars", label: "Importe ARS", req: true },
            { key: "importe_usd", label: "Importe USD", req: false },
            { key: "descripcion", label: "Descripción", req: false },
          ]}
          valor={plantilla.mapeo_compania as unknown as Record<string, string>}
          onChange={(v) => actualizar("mapeo_compania", v as unknown as MapeoCompania)}
        />
        <MapeoColumnas
          titulo="Columnas CONTRAPARTE"
          columnas={muestraCont.columnas}
          campos={[
            { key: "fecha", label: "Fecha", req: true },
            { key: "tipo", label: "Tipo documento", req: true },
            { key: "comprobante", label: "Nro legal del documento", req: true },
            { key: "importe", label: "Importe", req: true },
            { key: "moneda", label: "Moneda", req: false },
            { key: "descripcion", label: "Descripción", req: false },
          ]}
          valor={plantilla.mapeo_contraparte as unknown as Record<string, string>}
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
              <ReglaCard
                key={regla.id}
                regla={regla}
                posicion={posicionVisible + 1}
                totalReglas={reglasOrdenadas.length}
                abierta={reglaAbierta === regla.id}
                onToggle={() => setReglaAbierta(reglaAbierta === regla.id ? null : regla.id)}
                onChange={(parcial) => actualizarRegla(originalIdx, parcial)}
                onDelete={() => eliminarRegla(originalIdx)}
                onSubirPrioridad={esPrimero ? undefined : () => {
                  // Asignar prioridades secuenciales 10, 20, 30... y swap con el anterior
                  const conPrio = reglasOrdenadas.map((r, i) => ({ ...r, prioridad: (i + 1) * 10 }))
                  // Swap
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
              />
            )
          })}
      </section>

      {/* Tipos sin contraparte (ajustes propios) */}
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
  campos: { key: string; label: string; req: boolean }[]
  valor: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  return (
    <div className="card">
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">{titulo}</div>
      <div className="space-y-2">
        {campos.map((c) => (
          <div key={c.key} className="flex items-center gap-2">
            <label className="text-xs text-ink-700 w-32 flex-shrink-0">
              {c.label} {c.req && <span className="text-error">*</span>}
            </label>
            <select
              value={valor[c.key] ?? ""}
              onChange={(e) => onChange({ ...valor, [c.key]: e.target.value })}
              className="input text-xs flex-1"
            >
              <option value="">— ninguna —</option>
              {columnas.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
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
}) {
  return (
    <div className="card-tight">
      <div className="flex items-center justify-between gap-3">
        {/* Controles de prioridad */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
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

          {/* Constructor de claves */}
          {regla.metodo_match === "clave" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditorClave
                label="Clave compañía"
                constructor={regla.clave_compania}
                columnasDisponibles={columnasCmp}
                filaMuestra={filaMuestraCmp}
                onChange={(c) => onChange({ clave_compania: c })}
              />
              <EditorClave
                label="Clave contraparte"
                constructor={regla.clave_contraparte}
                columnasDisponibles={columnasCont}
                filaMuestra={filaMuestraCont}
                onChange={(c) => onChange({ clave_contraparte: c })}
              />
            </div>
          )}

          {regla.metodo_match === "importe_fecha" && (
            <div>
              <div className="label">Ventana de tolerancia (días)</div>
              <input
                type="number"
                min={0}
                value={regla.ventana_dias ?? 5}
                onChange={(e) => onChange({ ventana_dias: Number(e.target.value) })}
                className="input w-32"
              />
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
  // Tipos sin contraparte: comparar listas
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

  // Regla agregada/eliminada
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

  // Mapeos: comparar campo por campo
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