"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import { Plus, Settings, Building2, X, Pencil, Upload, Download, CheckCircle2 } from "lucide-react"

type Item = {
  id: string
  nombre: string
  cuit: string | null
  tipo: string | null
  categoria: string | null
  sociedad: string | null
  grupo_economico: string | null
  cuenta_interna: string | null
  rubro: string | null
  es_contraparte: boolean
  observaciones: string | null
  activo: boolean
  plantilla_id?: string
}

type FormData = {
  nombre: string
  cuit: string
  cuenta_interna: string
  tipo: string
  es_contraparte: boolean
  rubro: string
  sociedad: string
  grupo_economico: string
  categoria: string
  observaciones: string
  activo: boolean
}

const FORM_VACIO: FormData = {
  nombre: "", cuit: "", cuenta_interna: "", tipo: "proveedor",
  es_contraparte: false, rubro: "", sociedad: "",
  grupo_economico: "", categoria: "B", observaciones: "", activo: true,
}

const CATEGORIAS = [
  { value: "A", label: "A — Semanal" },
  { value: "B", label: "B — Mensual" },
  { value: "C", label: "C — Anual" },
  { value: "D", label: "D — Anual excepcional" },
  { value: "E", label: "E — Manual (sin frecuencia)" },
  { value: "F", label: "F — Manual (sin frecuencia)" },
]

const RUBROS = [
  "Servicios", "Comercial", "Logística", "Tecnología",
  "Construcción", "Financiero", "Agropecuario", "Salud",
  "Educación", "Gobierno", "Otro",
]

const CAT_COLORS: Record<string, string> = {
  A: "bg-danger-light text-danger",
  B: "bg-warn-light text-warn",
  C: "bg-yellow-50 text-yellow-700",
  D: "bg-ok-light text-ok",
  E: "bg-info-light text-info",
  F: "bg-ink-100 text-ink-500",
}

export default function PlantillasPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Item | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState("")
  const [form, setForm] = useState<FormData>(FORM_VACIO)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errores: string[] } | null>(null)

  async function cargar() {
    setLoading(true)
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, nombre, cuit, tipo, categoria, sociedad, grupo_economico, cuenta_interna, rubro, es_contraparte, observaciones, activo, plantillas_proveedor(id)")
      .order("nombre")

    const items: Item[] = (contras ?? []).map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      cuit: c.cuit,
      tipo: c.tipo,
      categoria: c.categoria,
      sociedad: c.sociedad,
      grupo_economico: c.grupo_economico,
      cuenta_interna: c.cuenta_interna,
      rubro: c.rubro,
      es_contraparte: c.es_contraparte ?? false,
      observaciones: c.observaciones,
      activo: c.activo ?? true,
      plantilla_id: c.plantillas_proveedor?.[0]?.id,
    }))
    setItems(items)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setEditando(null)
    setMostrarForm(true)
    setImportResult(null)
  }

  function abrirEditar(item: Item) {
    setForm({
      nombre: item.nombre,
      cuit: item.cuit ?? "",
      cuenta_interna: item.cuenta_interna ?? "",
      tipo: item.tipo ?? "proveedor",
      es_contraparte: item.es_contraparte,
      rubro: item.rubro ?? "",
      sociedad: item.sociedad ?? "",
      grupo_economico: item.grupo_economico ?? "",
      categoria: item.categoria ?? "B",
      observaciones: item.observaciones ?? "",
      activo: item.activo,
    })
    setEditando(item)
    setMostrarForm(true)
    setImportResult(null)
    // Scroll al formulario
    setTimeout(() => document.getElementById("form-cuenta")?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  function cerrarForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_VACIO)
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)

    const payload = {
      nombre: form.nombre.trim(),
      cuit: form.cuit.trim() || null,
      cuenta_interna: form.cuenta_interna.trim() || null,
      tipo: form.tipo,
      es_contraparte: form.es_contraparte,
      rubro: form.rubro || null,
      sociedad: form.sociedad.trim() || null,
      grupo_economico: form.grupo_economico.trim() || null,
      categoria: form.categoria,
      observaciones: form.observaciones.trim() || null,
      activo: form.activo,
      updated_at: new Date().toISOString(),
    }

    if (editando) {
      // EDITAR
      const { error } = await supabase
        .from("contrapartes")
        .update(payload)
        .eq("id", editando.id)

      if (error) {
        alert("Error al guardar: " + error.message)
      } else {
        // Registrar cambio de categoría si cambió
        if (editando.categoria !== form.categoria) {
          const { data: { user } } = await supabase.auth.getUser()
          await supabase.from("historial_categorias").insert({
            contraparte_id: editando.id,
            supervisor_id: user?.id ?? null,
            categoria_anterior: editando.categoria,
            categoria_nueva: form.categoria,
            motivo: form.observaciones?.trim() || null,
          })
        }
        cerrarForm()
        cargar()
      }
    } else {
      // CREAR
      const { data: empresa } = await supabase.from("empresas").select("id").limit(1).single()
      const { data: grupo } = await supabase.from("grupos_trabajo").select("id").limit(1).single()

      const { data: nueva, error } = await supabase
        .from("contrapartes")
        .insert({ ...payload, empresa_id: empresa?.id, grupo_id: grupo?.id })
        .select()
        .single()

      if (!error && nueva) {
        await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id })
        cerrarForm()
        cargar()
      } else if (error) {
        alert("Error al crear: " + error.message)
      }
    }
    setGuardando(false)
  }

  // Importación masiva desde Excel
  async function importarExcel(file: File) {
    setImportando(true)
    setImportResult(null)

    try {
      const XLSX = await import("xlsx")
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" })

      const { data: empresa } = await supabase.from("empresas").select("id").limit(1).single()
      const { data: grupo } = await supabase.from("grupos_trabajo").select("id").limit(1).single()

      let ok = 0
      const errores: string[] = []

      for (let i = 0; i < filas.length; i++) {
        const f = filas[i]
        const nombre = String(f["Razón Social *"] ?? f["Razón Social"] ?? f["nombre"] ?? "").trim()
        if (!nombre) continue

        const categoria = String(f["Categoría *"] ?? f["categoria"] ?? "B").trim().toUpperCase()
        const tipo = String(f["Tipo de Cuenta *"] ?? f["tipo"] ?? "proveedor").trim().toLowerCase()

        const payload = {
          nombre,
          empresa_id: empresa?.id,
          grupo_id: grupo?.id,
          cuit: String(f["CUIT *"] ?? f["cuit"] ?? "").trim() || null,
          cuenta_interna: String(f["N° Cuenta Sistema *"] ?? f["cuenta_interna"] ?? "").trim() || null,
          tipo: tipo === "cliente" ? "cliente" : "proveedor",
          es_contraparte: String(f["¿Es también contraparte?"] ?? "").toLowerCase() === "sí",
          rubro: String(f["Rubro *"] ?? f["rubro"] ?? "").trim() || null,
          sociedad: String(f["Sociedad *"] ?? f["sociedad"] ?? "").trim() || null,
          grupo_economico: String(f["Grupo Económico"] ?? f["grupo_economico"] ?? "").trim() || null,
          categoria: ["A","B","C","D","E","F"].includes(categoria) ? categoria : "B",
          observaciones: String(f["Observaciones"] ?? "").trim() || null,
          activo: true,
        }

        const { data: nueva, error } = await supabase
          .from("contrapartes")
          .insert(payload)
          .select()
          .single()

        if (error) {
          errores.push(`Fila ${i + 2}: ${nombre} — ${error.message}`)
        } else {
          await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id })
          ok++
        }
      }

      setImportResult({ ok, errores })
      if (ok > 0) cargar()
    } catch (e: any) {
      setImportResult({ ok: 0, errores: ["Error al leer el archivo: " + e.message] })
    }
    setImportando(false)
  }

  const itemsFiltrados = items.filter(i =>
    i.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
    (i.cuit ?? "").includes(filtro) ||
    (i.sociedad ?? "").toLowerCase().includes(filtro.toLowerCase())
  )

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Configuración</div>
          <h1 className="h-page">Cuentas y plantillas</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Cada cuenta tiene su configuración: datos de la contraparte, categoría de conciliación y plantilla de mapeo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Importar desde Excel */}
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={14} />
            {importando ? "Importando…" : "Importar Excel"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => e.target.files?.[0] && importarExcel(e.target.files[0])}
              disabled={importando}
            />
          </label>
          {/* Descargar plantilla */}
          <a
            href="/plantilla-cuentas.xlsx"
            className="btn btn-secondary"
            onClick={e => {
              e.preventDefault()
              descargarPlantilla()
            }}
          >
            <Download size={14} /> Plantilla
          </a>
          <button onClick={abrirNuevo} className="btn btn-primary">
            <Plus size={14} /> Nueva cuenta
          </button>
        </div>
      </div>

      {/* Resultado importación */}
      {importResult && (
        <div className={`px-4 py-3 border text-sm flex items-start gap-3 ${
          importResult.errores.length === 0
            ? "bg-ok-light border-ok/20 text-ok"
            : "bg-warn-light border-warn/20 text-warn"
        }`}>
          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              {importResult.ok} cuenta{importResult.ok !== 1 ? "s" : ""} importada{importResult.ok !== 1 ? "s" : ""} correctamente
            </div>
            {importResult.errores.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {importResult.errores.map((e, i) => <li key={i}>⚠ {e}</li>)}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Formulario crear / editar */}
      {mostrarForm && (
        <div id="form-cuenta" className="card border-accent border-2 space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {editando ? `Editando: ${editando.nombre}` : "Nueva cuenta"}
            </div>
            <button onClick={cerrarForm} className="text-ink-400 hover:text-ink-700">
              <X size={16} />
            </button>
          </div>

          {/* Identificación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Identificación</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Razón social *</label>
                <input
                  value={form.nombre}
                  onChange={e => setField("nombre", e.target.value)}
                  placeholder="Nombre completo"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">CUIT</label>
                <input
                  value={form.cuit}
                  onChange={e => setField("cuit", e.target.value)}
                  placeholder="30712345678"
                  className="input w-full font-mono"
                  maxLength={11}
                />
              </div>
              <div>
                <label className="label">N° cuenta sistema</label>
                <input
                  value={form.cuenta_interna}
                  onChange={e => setField("cuenta_interna", e.target.value)}
                  placeholder="CTA-001"
                  className="input w-full font-mono"
                />
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Tipo</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Tipo de cuenta *</label>
                <div className="flex gap-2">
                  {["proveedor", "cliente"].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setField("tipo", t)}
                      className={`flex-1 py-2 text-xs font-semibold border rounded transition-all capitalize ${
                        form.tipo === t
                          ? "bg-accent text-white border-accent"
                          : "border-ink-200 text-ink-600 hover:border-accent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.es_contraparte}
                    onChange={e => setField("es_contraparte", e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span>¿Opera también como {form.tipo === "proveedor" ? "cliente" : "proveedor"}?</span>
                </label>
              </div>
              <div>
                <label className="label">Rubro</label>
                <select
                  value={form.rubro}
                  onChange={e => setField("rubro", e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Seleccioná —</option>
                  {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Organización */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Organización</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Sociedad</label>
                <input
                  value={form.sociedad}
                  onChange={e => setField("sociedad", e.target.value)}
                  placeholder="Ej: Sociedad A"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Grupo económico</label>
                <input
                  value={form.grupo_economico}
                  onChange={e => setField("grupo_economico", e.target.value)}
                  placeholder="Si pertenece a un grupo"
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* Conciliación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Conciliación</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Categoría *</label>
                <select
                  value={form.categoria}
                  onChange={e => setField("categoria", e.target.value)}
                  className="input w-full"
                >
                  {CATEGORIAS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Observaciones</label>
                <input
                  value={form.observaciones}
                  onChange={e => setField("observaciones", e.target.value)}
                  placeholder="Notas internas opcionales"
                  className="input w-full"
                />
              </div>
              {editando && (
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={e => setField("activo", e.target.checked)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span>Cuenta activa</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-200">
            <button onClick={cerrarForm} className="btn btn-secondary">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !form.nombre.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cuenta"}
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      {items.length > 0 && (
        <input
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Buscar por nombre, CUIT o sociedad…"
          className="input w-full max-w-sm"
        />
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">Sin cuentas aún</div>
          <p className="text-sm text-ink-500 mt-1 mb-4">
            Creá la primera cuenta o importá desde Excel.
          </p>
          <button onClick={abrirNuevo} className="btn btn-primary inline-flex">
            + Nueva cuenta
          </button>
        </div>
      ) : (
        <div className="panel divide-y divide-ink-200">
          {itemsFiltrados.map(item => (
            <div
              key={item.id}
              className="flex items-center px-4 py-3 hover:bg-ink-50 transition-colors group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-accent-light flex items-center justify-center text-accent flex-shrink-0">
                  <Building2 size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{item.nombre}</span>
                    {!item.activo && (
                      <span className="text-2xs bg-ink-100 text-ink-400 px-1.5 py-0.5 rounded">Inactivo</span>
                    )}
                  </div>
                  <div className="text-2xs text-ink-500 flex items-center gap-3 mt-0.5">
                    {item.cuit && <span className="font-mono">{item.cuit}</span>}
                    {item.tipo && <span className="capitalize">{item.tipo}</span>}
                    {item.sociedad && <span>{item.sociedad}</span>}
                    {item.cuenta_interna && <span className="font-mono">{item.cuenta_interna}</span>}
                    <span>{item.plantilla_id ? "Con plantilla" : "Sin plantilla"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item.categoria && (
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded font-mono ${CAT_COLORS[item.categoria] ?? ""}`}>
                    {item.categoria}
                  </span>
                )}
                {/* Editar datos */}
                <button
                  onClick={() => abrirEditar(item)}
                  className="btn btn-secondary py-1 px-2 text-2xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Editar datos de la cuenta"
                >
                  <Pencil size={12} /> Editar
                </button>
                {/* Ir a plantilla de mapeo */}
                <Link
                  href={`/plantillas/${item.id}`}
                  className="btn btn-secondary py-1 px-2 text-2xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Configurar plantilla de mapeo"
                >
                  <Settings size={12} /> Plantilla
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Descarga la plantilla Excel de ejemplo
function descargarPlantilla() {
  import("xlsx").then(XLSX => {
    const wb = XLSX.utils.book_new()

    const datos = [
      ["Razón Social *", "CUIT *", "N° Cuenta Sistema *", "Tipo de Cuenta *", "¿Es también contraparte?", "Rubro *", "Sociedad *", "Grupo Económico", "Categoría *", "Observaciones"],
      ["Distribuidora Norte SA", "30712345678", "CTA-001", "Proveedor", "No", "Servicios", "Sociedad A", "", "A", ""],
      ["Comercial Sur SRL", "20301234567", "CTA-002", "Cliente", "No", "Comercial", "Sociedad A", "Grupo ABC", "B", ""],
      ["Tech Solutions SA", "30987654321", "CTA-003", "Proveedor", "Sí", "Tecnología", "Sociedad B", "Grupo ABC", "C", "También cliente"],
    ]

    const ws = XLSX.utils.aoa_to_sheet(datos)

    // Ancho de columnas
    ws["!cols"] = [
      { wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 16 },
      { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 20 },
      { wch: 12 }, { wch: 25 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, "Maestro de Cuentas")

    // Hoja de rubros
    const rubrosData = [
      ["Rubro", "Descripción"],
      ["Servicios", "Prestación de servicios profesionales"],
      ["Comercial", "Compraventa de mercaderías"],
      ["Logística", "Transporte y distribución"],
      ["Tecnología", "Software, hardware y servicios IT"],
      ["Construcción", "Obras e infraestructura"],
      ["Financiero", "Entidades bancarias y financieras"],
      ["Agropecuario", "Producción primaria"],
      ["Salud", "Medicina y farmacéutica"],
      ["Educación", "Instituciones educativas"],
      ["Gobierno", "Organismos públicos"],
      ["Otro", "Otros rubros"],
    ]
    const wsRubros = XLSX.utils.aoa_to_sheet(rubrosData)
    XLSX.utils.book_append_sheet(wb, wsRubros, "Rubros")

    // Hoja categorías
    const catsData = [
      ["Categoría", "Frecuencia", "Descripción"],
      ["A", "Semanal", "Cuentas de alto movimiento — conciliación cada 7 días"],
      ["B", "Mensual", "Cuentas regulares — conciliación una vez por mes"],
      ["C", "Anual", "Cuentas de bajo movimiento — conciliación anual"],
      ["D", "Anual excepcional", "Igual que C pero requiere aprobación del supervisor"],
      ["E", "Manual", "Sin frecuencia automática — el supervisor define la fecha"],
      ["F", "Manual", "Sin frecuencia automática — seguimiento especial"],
    ]
    const wsCats = XLSX.utils.aoa_to_sheet(catsData)
    XLSX.utils.book_append_sheet(wb, wsCats, "Categorías")

    XLSX.writeFile(wb, "plantilla_maestro_cuentas.xlsx")
  })
}