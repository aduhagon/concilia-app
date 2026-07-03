"use client"

export const dynamic = "force-dynamic"

// ============================================================
// Comparador de Bases de Datos
//
// Flujo:
//  1. Subir archivo origen y destino (xlsx, xls, csv, txt)
//  2. Homologar columnas (origen → destino) y elegir cuáles comparar
//  3. Armar la clave de match por lado (reutiliza EditorClave)
//  4. Ejecutar y ver resultado en pantalla / exportar a Excel
//
// Todo en memoria: no se persiste nada en la base.
// ============================================================

import { useMemo, useState } from "react"
import type { ConstructorClave } from "@/types"
import type {
  ColumnaComparacion,
  ResultadoComparacion,
  TipoComparacion,
} from "@/types/comparador"
import { leerArchivoComparacion, type ArchivoParseado, EXTENSIONES_SOPORTADAS } from "@/lib/comparador/parser"
import { compararBases, homologarColumnas } from "@/lib/comparador/motor-comparacion"
import { exportarComparacionExcel } from "@/lib/comparador/exportar"
import { construirClave } from "@/lib/constructor-clave"
import EditorClave from "@/components/EditorClave"
import {
  Upload, Play, Download, AlertCircle, CheckCircle2, XCircle,
  FileSpreadsheet, Trash2, Search, FlaskConical, Loader2,
} from "lucide-react"

const CLAVE_VACIA: ConstructorClave = { tipo: "visual", operaciones: [] }
const MUESTRA_CLAVE = 500 // filas por lado para la prueba rápida de clave

type TabResultado = "diferencias" | "solo_origen" | "solo_destino" | "duplicados"

export default function ComparadorPage() {
  // ----- Paso 1: archivos -----
  const [origen, setOrigen] = useState<ArchivoParseado | null>(null)
  const [destino, setDestino] = useState<ArchivoParseado | null>(null)
  const [errorArchivo, setErrorArchivo] = useState("")
  const [cargando, setCargando] = useState<"origen" | "destino" | null>(null)

  // ----- Paso 2: homologación de columnas -----
  const [columnas, setColumnas] = useState<ColumnaComparacion[]>([])

  // ----- Paso 3: claves -----
  const [claveOrigen, setClaveOrigen] = useState<ConstructorClave>(CLAVE_VACIA)
  const [claveDestino, setClaveDestino] = useState<ConstructorClave>(CLAVE_VACIA)

  // ----- Paso 4: resultado -----
  const [resultado, setResultado] = useState<ResultadoComparacion | null>(null)
  const [ejecutando, setEjecutando] = useState(false)
  const [tab, setTab] = useState<TabResultado>("diferencias")
  const [busqueda, setBusqueda] = useState("")

  // ------------------------------------------------------------
  // Carga de archivos
  // ------------------------------------------------------------
  async function cargarArchivo(file: File | undefined, lado: "origen" | "destino") {
    if (!file) return
    setErrorArchivo("")
    setResultado(null)
    setCargando(lado)
    try {
      const parseado = await leerArchivoComparacion(file)
      if (lado === "origen") {
        setOrigen(parseado)
        if (destino) setColumnas(homologarColumnas(parseado.columnas, destino.columnas, parseado.filas[0]))
      } else {
        setDestino(parseado)
        if (origen) setColumnas(homologarColumnas(origen.columnas, parseado.columnas, origen.filas[0]))
      }
    } catch (e: unknown) {
      setErrorArchivo(e instanceof Error ? e.message : "Error al leer el archivo")
    } finally {
      setCargando(null)
    }
  }

  function limpiarTodo() {
    setOrigen(null)
    setDestino(null)
    setColumnas([])
    setClaveOrigen(CLAVE_VACIA)
    setClaveDestino(CLAVE_VACIA)
    setResultado(null)
    setErrorArchivo("")
    setBusqueda("")
  }

  // ------------------------------------------------------------
  // Homologación
  // ------------------------------------------------------------
  function modificarColumna(idx: number, parcial: Partial<ColumnaComparacion>) {
    setColumnas((prev) => {
      const c = [...prev]
      c[idx] = { ...c[idx], ...parcial }
      return c
    })
    setResultado(null)
  }

  function marcarTodas(valor: boolean) {
    setColumnas((prev) =>
      prev.map((c) => ({ ...c, comparar: valor && c.columna_destino !== "" }))
    )
    setResultado(null)
  }

  const columnasActivas = columnas.filter((c) => c.comparar && c.columna_destino !== "")

  // ------------------------------------------------------------
  // Prueba rápida de clave (en memoria, sobre una muestra)
  // ------------------------------------------------------------
  const pruebaClave = useMemo(() => {
    if (!origen || !destino) return null
    const opsO = claveOrigen.tipo === "visual" ? claveOrigen.operaciones.length : 0
    const opsD = claveDestino.tipo === "visual" ? claveDestino.operaciones.length : 0
    if (opsO === 0 || opsD === 0) return null

    const clavesO = origen.filas
      .slice(0, MUESTRA_CLAVE)
      .map((f) => construirClave(f, claveOrigen))
    const clavesD = new Set(
      destino.filas
        .slice(0, MUESTRA_CLAVE)
        .map((f) => construirClave(f, claveDestino))
        .filter((c) => c !== "")
    )
    const validasO = clavesO.filter((c) => c !== "")
    const coinciden = validasO.filter((c) => clavesD.has(c)).length
    return {
      muestra: Math.min(origen.filas.length, MUESTRA_CLAVE),
      validas: validasO.length,
      coinciden,
    }
  }, [origen, destino, claveOrigen, claveDestino])

  // ------------------------------------------------------------
  // Ejecución
  // ------------------------------------------------------------
  const puedeEjecutar =
    !!origen &&
    !!destino &&
    columnasActivas.length > 0 &&
    claveOrigen.tipo === "visual" && claveOrigen.operaciones.length > 0 &&
    claveDestino.tipo === "visual" && claveDestino.operaciones.length > 0

  function ejecutar() {
    if (!origen || !destino || !puedeEjecutar) return
    setEjecutando(true)
    setBusqueda("")
    // setTimeout para que el spinner alcance a renderizar antes del cálculo sincrónico
    setTimeout(() => {
      try {
        const r = compararBases(origen.filas, destino.filas, {
          clave_origen: claveOrigen,
          clave_destino: claveDestino,
          columnas,
        })
        setResultado(r)
        setTab("diferencias")
      } finally {
        setEjecutando(false)
      }
    }, 50)
  }

  function exportar() {
    if (!resultado) return
    const buffer = exportarComparacionExcel(resultado, {
      nombreOrigen: origen?.nombre,
      nombreDestino: destino?.nombre,
      columnas,
    })
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comparacion_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ------------------------------------------------------------
  // Filtrado del detalle de diferencias
  // ------------------------------------------------------------
  const diferenciasPlanas = useMemo(() => {
    if (!resultado) return []
    const filas: { clave: string; columna: string; origen: string; destino: string }[] = []
    for (const m of resultado.matches) {
      for (const d of m.diferencias) {
        filas.push({
          clave: m.clave,
          columna: d.columna_origen === d.columna_destino
            ? d.columna_origen
            : `${d.columna_origen} → ${d.columna_destino}`,
          origen: d.valor_origen,
          destino: d.valor_destino,
        })
      }
    }
    if (!busqueda.trim()) return filas
    const q = busqueda.toLowerCase().trim()
    return filas.filter(
      (f) =>
        f.clave.toLowerCase().includes(q) ||
        f.columna.toLowerCase().includes(q) ||
        f.origen.toLowerCase().includes(q) ||
        f.destino.toLowerCase().includes(q)
    )
  }, [resultado, busqueda])

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Comparador de bases de datos</h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Compará un archivo de origen contra uno de destino y obtené el detalle de las columnas que cambiaron.
            El análisis es en memoria: no se guarda nada.
          </p>
        </div>
        {(origen || destino) && (
          <button onClick={limpiarTodo} className="btn btn-secondary">
            <Trash2 size={14} /> Limpiar todo
          </button>
        )}
      </div>

      {/* ── Paso 1: Archivos ── */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Paso 1 · Archivos</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ZonaArchivo
            label="Archivo de origen"
            archivo={origen}
            cargando={cargando === "origen"}
            onFile={(f) => cargarArchivo(f, "origen")}
          />
          <ZonaArchivo
            label="Archivo de destino"
            archivo={destino}
            cargando={cargando === "destino"}
            onFile={(f) => cargarArchivo(f, "destino")}
          />
        </div>
        {errorArchivo && (
          <div className="mt-3 flex items-center gap-2 text-xs text-error">
            <AlertCircle size={14} /> {errorArchivo}
          </div>
        )}
      </div>

      {/* ── Paso 2: Homologación de columnas ── */}
      {origen && destino && (
        <div className="card">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Paso 2 · Columnas</div>
              <div className="text-sm font-semibold">Homologación y selección</div>
              <p className="text-xs text-ink-500 mt-0.5">
                Indicá qué columna de destino equivale a cada columna de origen y destildá las que no quieras analizar.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => marcarTodas(true)} className="btn btn-secondary text-xs">Marcar todas</button>
              <button onClick={() => marcarTodas(false)} className="btn btn-secondary text-xs">Desmarcar todas</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-ink-500 border-b border-ink-200">
                  <th className="py-2 pr-2 w-10">Comp.</th>
                  <th className="py-2 pr-2">Columna origen</th>
                  <th className="py-2 pr-2">Columna destino</th>
                  <th className="py-2 pr-2 w-28">Tipo</th>
                  <th className="py-2 pr-2 w-24">Tolerancia</th>
                </tr>
              </thead>
              <tbody>
                {columnas.map((c, idx) => (
                  <tr key={c.columna_origen} className={`border-b border-ink-100 ${!c.comparar ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={c.comparar}
                        disabled={c.columna_destino === ""}
                        onChange={(e) => modificarColumna(idx, { comparar: e.target.checked })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{c.columna_origen}</td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={c.columna_destino}
                        onChange={(e) =>
                          modificarColumna(idx, {
                            columna_destino: e.target.value,
                            comparar: e.target.value !== "" && c.comparar,
                          })
                        }
                        className="input text-xs w-full"
                      >
                        <option value="">— sin equivalente —</option>
                        {destino.columnas.map((cd) => (
                          <option key={cd} value={cd}>{cd}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={c.tipo}
                        onChange={(e) => modificarColumna(idx, { tipo: e.target.value as TipoComparacion })}
                        className="input text-xs w-full"
                        disabled={!c.comparar}
                      >
                        <option value="texto">Texto</option>
                        <option value="numero">Número</option>
                        <option value="fecha">Fecha</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      {c.tipo === "numero" ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={c.tolerancia ?? 0}
                          onChange={(e) => modificarColumna(idx, { tolerancia: Number(e.target.value) || 0 })}
                          className="input text-xs w-full"
                          disabled={!c.comparar}
                        />
                      ) : c.tipo === "texto" ? (
                        <label className="flex items-center gap-1 text-2xs text-ink-500">
                          <input
                            type="checkbox"
                            checked={c.ignorar_mayusculas ?? false}
                            onChange={(e) => modificarColumna(idx, { ignorar_mayusculas: e.target.checked })}
                            disabled={!c.comparar}
                          />
                          Ign. mayús.
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-2xs text-ink-500">
            {columnasActivas.length} columna{columnasActivas.length === 1 ? "" : "s"} se van a analizar.
          </div>
        </div>
      )}

      {/* ── Paso 3: Clave de match ── */}
      {origen && destino && (
        <div className="card">
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Paso 3 · Clave de match</div>
          <p className="text-xs text-ink-500 mb-3">
            La clave identifica cada fila para emparejar origen con destino. Puede ser una columna
            (ej: ID) o una combinación (ej: sucursal + comprobante con padding).
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EditorClave
              label="Clave del origen"
              constructor={claveOrigen}
              columnasDisponibles={origen.columnas}
              filaMuestra={origen.filas[0]}
              onChange={(c) => { setClaveOrigen(c); setResultado(null) }}
            />
            <EditorClave
              label="Clave del destino"
              constructor={claveDestino}
              columnasDisponibles={destino.columnas}
              filaMuestra={destino.filas[0]}
              onChange={(c) => { setClaveDestino(c); setResultado(null) }}
            />
          </div>

          {pruebaClave && (
            <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-md border ${
              pruebaClave.coinciden > 0
                ? "border-ink-200 bg-ink-50 text-ink-600"
                : "border-warning/40 bg-warning/5 text-ink-600"
            }`}>
              <FlaskConical size={14} className="flex-shrink-0" />
              <span>
                Prueba rápida sobre las primeras {pruebaClave.muestra} filas:{" "}
                <strong>{pruebaClave.coinciden}</strong> claves de origen coinciden en destino
                ({pruebaClave.validas} claves válidas construidas).
                {pruebaClave.coinciden === 0 && " Revisá la configuración de la clave antes de ejecutar."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 4: Ejecutar ── */}
      {origen && destino && (
        <div className="flex items-center gap-3">
          <button onClick={ejecutar} disabled={!puedeEjecutar || ejecutando} className="btn btn-primary">
            {ejecutando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {ejecutando ? "Comparando…" : "Ejecutar comparación"}
          </button>
          {!puedeEjecutar && (
            <span className="text-xs text-ink-500">
              Configurá al menos una columna a comparar y la clave de ambos lados.
            </span>
          )}
        </div>
      )}

      {/* ── Resultado ── */}
      {resultado && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <CardResumen label="Filas origen" valor={resultado.resumen.total_origen} />
            <CardResumen label="Filas destino" valor={resultado.resumen.total_destino} />
            <CardResumen label="Sin cambios" valor={resultado.resumen.sin_cambios} icono={<CheckCircle2 size={14} className="text-success" />} />
            <CardResumen label="Con diferencias" valor={resultado.resumen.con_diferencias} icono={<XCircle size={14} className="text-error" />} destacado={resultado.resumen.con_diferencias > 0} />
            <CardResumen label="Solo en origen" valor={resultado.resumen.solo_origen} />
            <CardResumen label="Solo en destino" valor={resultado.resumen.solo_destino} />
          </div>

          {(resultado.resumen.sin_clave_origen > 0 || resultado.resumen.sin_clave_destino > 0) && (
            <div className="flex items-center gap-2 text-xs text-ink-600 px-3 py-2 rounded-md border border-warning/40 bg-warning/5">
              <AlertCircle size={14} />
              {resultado.resumen.sin_clave_origen > 0 && (
                <span>{resultado.resumen.sin_clave_origen} filas de origen sin clave construible.</span>
              )}
              {resultado.resumen.sin_clave_destino > 0 && (
                <span>{resultado.resumen.sin_clave_destino} filas de destino sin clave construible.</span>
              )}
              <span>Aparecen en las solapas &quot;Solo origen/destino&quot;.</span>
            </div>
          )}

          {/* Tabs + export */}
          <div className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex gap-1">
                <TabBtn activo={tab === "diferencias"} onClick={() => setTab("diferencias")}>
                  Diferencias ({resultado.resumen.total_diferencias_columna})
                </TabBtn>
                <TabBtn activo={tab === "solo_origen"} onClick={() => setTab("solo_origen")}>
                  Solo origen ({resultado.resumen.solo_origen})
                </TabBtn>
                <TabBtn activo={tab === "solo_destino"} onClick={() => setTab("solo_destino")}>
                  Solo destino ({resultado.resumen.solo_destino})
                </TabBtn>
                <TabBtn activo={tab === "duplicados"} onClick={() => setTab("duplicados")}>
                  Duplicados ({resultado.duplicados_origen.length + resultado.duplicados_destino.length})
                </TabBtn>
              </div>
              <button onClick={exportar} className="btn btn-secondary">
                <Download size={14} /> Exportar Excel
              </button>
            </div>

            {tab === "diferencias" && (
              <>
                <div className="relative mb-3 max-w-sm">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por clave, columna o valor…"
                    className="input text-xs w-full pl-8"
                  />
                </div>
                {diferenciasPlanas.length === 0 ? (
                  <VacioMsg texto={busqueda ? "Sin resultados para la búsqueda." : "No hay diferencias: todas las filas matcheadas son idénticas en las columnas analizadas."} />
                ) : (
                  <TablaSimple
                    headers={["Clave", "Columna", "Valor origen", "Valor destino"]}
                    filas={diferenciasPlanas.slice(0, 1000).map((f) => [f.clave, f.columna, f.origen, f.destino])}
                    truncadoEn={diferenciasPlanas.length > 1000 ? 1000 : undefined}
                    total={diferenciasPlanas.length}
                  />
                )}
              </>
            )}

            {tab === "solo_origen" && (
              <TablaSinMatch
                filas={resultado.solo_origen}
                columnas={columnas.map((c) => c.columna_origen)}
              />
            )}

            {tab === "solo_destino" && (
              <TablaSinMatch
                filas={resultado.solo_destino}
                columnas={columnas.map((c) => c.columna_destino).filter((c) => c !== "")}
              />
            )}

            {tab === "duplicados" && (
              resultado.duplicados_origen.length + resultado.duplicados_destino.length === 0 ? (
                <VacioMsg texto="No hay claves duplicadas en ninguno de los dos archivos." />
              ) : (
                <TablaSimple
                  headers={["Lado", "Clave", "Cantidad de filas"]}
                  filas={[
                    ...resultado.duplicados_origen.map((d) => ["Origen", d.clave, String(d.cantidad)]),
                    ...resultado.duplicados_destino.map((d) => ["Destino", d.clave, String(d.cantidad)]),
                  ]}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

function ZonaArchivo({
  label,
  archivo,
  cargando,
  onFile,
}: {
  label: string
  archivo: ArchivoParseado | null
  cargando: boolean
  onFile: (f: File | undefined) => void
}) {
  const inputId = `file-${label.replace(/\s/g, "-")}`
  return (
    <div className="border border-dashed border-ink-300 rounded-md p-4">
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">{label}</div>
      {archivo ? (
        <div className="flex items-center gap-2 text-xs">
          <FileSpreadsheet size={16} className="text-success flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{archivo.nombre}</div>
            <div className="text-ink-500">
              {archivo.filas.length.toLocaleString("es-AR")} filas · {archivo.columnas.length} columnas
            </div>
          </div>
        </div>
      ) : (
        <label htmlFor={inputId} className="btn btn-secondary cursor-pointer inline-flex">
          {cargando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {cargando ? "Leyendo…" : "Elegir archivo"}
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept={EXTENSIONES_SOPORTADAS.map((e) => `.${e}`).join(",")}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {archivo && (
        <label htmlFor={inputId} className="mt-2 inline-block text-2xs text-ink-500 underline cursor-pointer">
          Reemplazar archivo
        </label>
      )}
    </div>
  )
}

function CardResumen({
  label,
  valor,
  icono,
  destacado,
}: {
  label: string
  valor: number
  icono?: React.ReactNode
  destacado?: boolean
}) {
  return (
    <div className={`card-tight ${destacado ? "border-error/40" : ""}`}>
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink-500">
        {icono} {label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-1">
        {valor.toLocaleString("es-AR")}
      </div>
    </div>
  )
}

function TabBtn({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        activo ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      {children}
    </button>
  )
}

function VacioMsg({ texto }: { texto: string }) {
  return (
    <div className="text-xs text-ink-400 italic px-3 py-6 border border-dashed border-ink-200 rounded-md text-center">
      {texto}
    </div>
  )
}

function TablaSimple({
  headers,
  filas,
  truncadoEn,
  total,
}: {
  headers: string[]
  filas: string[][]
  truncadoEn?: number
  total?: number
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-ink-500 border-b border-ink-200">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-ink-100">
              {f.map((v, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j === 0 ? "font-mono" : ""}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncadoEn && (
        <div className="mt-2 text-2xs text-ink-500">
          Mostrando las primeras {truncadoEn.toLocaleString("es-AR")} de {total?.toLocaleString("es-AR")} diferencias.
          Exportá a Excel para ver el detalle completo.
        </div>
      )}
    </div>
  )
}

function TablaSinMatch({
  filas,
  columnas,
}: {
  filas: { clave: string; fila: Record<string, unknown> }[]
  columnas: string[]
}) {
  if (filas.length === 0) return <VacioMsg texto="No hay filas en esta categoría." />
  const cols = columnas.slice(0, 8) // limitar ancho en pantalla; el Excel exporta todas
  const LIMITE = 500
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-ink-500 border-b border-ink-200">
            <th className="py-2 pr-3">Clave</th>
            {cols.map((c) => (
              <th key={c} className="py-2 pr-3">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, LIMITE).map((f, i) => (
            <tr key={i} className="border-b border-ink-100">
              <td className="py-1.5 pr-3 font-mono">{f.clave || "(sin clave)"}</td>
              {cols.map((c) => (
                <td key={c} className="py-1.5 pr-3">
                  {f.fila[c] === null || f.fila[c] === undefined ? "" : String(f.fila[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > LIMITE && (
        <div className="mt-2 text-2xs text-ink-500">
          Mostrando las primeras {LIMITE} de {filas.length.toLocaleString("es-AR")} filas. Exportá a Excel para el detalle completo.
        </div>
      )}
      {columnas.length > 8 && (
        <div className="mt-1 text-2xs text-ink-500">
          En pantalla se muestran las primeras 8 columnas; la exportación incluye todas.
        </div>
      )}
    </div>
  )
}
