"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import { Plus, Settings, Building2, X, Pencil, Upload, Download, CheckCircle2, Users, Trash2 } from "lucide-react"

type Usuario = { id: string; nombre: string; rol: string }
type Sociedad = { id: string; nombre: string; codigo: string | null }
type CuentaProveedor = { id: string; sociedad_id: string; sociedad_nombre: string; cuenta_interna: string; descripcion: string | null; activo: boolean }

type Item = {
  id: string
  nombre: string
  cuit: string | null
  tipo: string | null
  categoria: string | null
  grupo_economico: string | null
  rubro: string | null
  es_contraparte: boolean
  observaciones: string | null
  activo: boolean
  plantilla_id?: string
  conciliador_id: string | null
  conciliador_nombre: string | null
  cuentas: CuentaProveedor[]
}

type FormData = {
  nombre: string
  cuit: string
  tipo: string
  es_contraparte: boolean
  rubro: string
  grupo_economico: string
  categoria: string
  observaciones: string
  activo: boolean
  conciliador_id: string
}

const FORM_VACIO: FormData = {
  nombre: "", cuit: "", tipo: "proveedor",
  es_contraparte: false, rubro: "",
  grupo_economico: "", categoria: "B", observaciones: "", activo: true, conciliador_id: "",
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
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [sociedades, setSociedades] = useState<Sociedad[]>([])
  const [rolActual, setRolActual] = useState<string | null>(null)

  // Cuentas por sociedad — para el formulario
  const [cuentasForm, setCuentasForm] = useState<{ sociedad_id: string; cuenta_interna: string; descripcion: string }[]>([])
  const [nuevaCuenta, setNuevaCuenta] = useState({ sociedad_id: "", cuenta_interna: "", descripcion: "" })

  // Selección múltiple
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [conciliadorMasivo, setConciliadorMasivo] = useState("")
  const [asignando, setAsignando] = useState(false)

  useEffect(() => {
    supabase.from("usuarios").select("id, nombre, rol").eq("activo", true).order("nombre")
      .then(({ data }) => setUsuarios(data ?? []))

    supabase.from("sociedades").select("id, nombre, codigo").eq("activo", true).order("nombre")
      .then(({ data }) => setSociedades(data ?? []))

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("usuarios").select("rol").eq("id", user.id).single()
        .then(({ data }) => setRolActual(data?.rol ?? null))
    })
  }, [])

  const puedeAsignar = rolActual === "admin" || rolActual === "supervisor"

  async function cargar() {
    setLoading(true)
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, nombre, cuit, tipo, categoria, grupo_economico, rubro, es_contraparte, observaciones, activo, conciliador_id, plantillas_proveedor(id), usuarios(nombre)")
      .order("nombre")

    const items: Item[] = []
    for (const c of contras ?? []) {
      // Cargar cuentas por sociedad de esta contraparte
      const { data: cuentas } = await supabase
        .from("cuentas_proveedor")
        .select("id, sociedad_id, cuenta_interna, descripcion, activo, sociedades(nombre)")
        .eq("contraparte_id", c.id)
        .eq("activo", true)
        .order("cuenta_interna")

      items.push({
        id: c.id,
        nombre: c.nombre,
        cuit: c.cuit,
        tipo: c.tipo,
        categoria: c.categoria,
        grupo_economico: c.grupo_economico,
        rubro: c.rubro,
        es_contraparte: c.es_contraparte ?? false,
        observaciones: c.observaciones,
        activo: c.activo ?? true,
        plantilla_id: (c.plantillas_proveedor as any)?.[0]?.id,
        conciliador_id: c.conciliador_id ?? null,
        conciliador_nombre: (c.usuarios as any)?.nombre ?? null,
        cuentas: (cuentas ?? []).map((cp: any) => ({
          id: cp.id,
          sociedad_id: cp.sociedad_id,
          sociedad_nombre: cp.sociedades?.nombre ?? "—",
          cuenta_interna: cp.cuenta_interna,
          descripcion: cp.descripcion,
          activo: cp.activo,
        })),
      })
    }
    setItems(items)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setCuentasForm([])
    setNuevaCuenta({ sociedad_id: "", cuenta_interna: "", descripcion: "" })
    setEditando(null)
    setMostrarForm(true)
    setImportResult(null)
    setSeleccionados(new Set())
  }

  function abrirEditar(item: Item) {
    setForm({
      nombre: item.nombre,
      cuit: item.cuit ?? "",
      tipo: item.tipo ?? "proveedor",
      es_contraparte: item.es_contraparte,
      rubro: item.rubro ?? "",
      grupo_economico: item.grupo_economico ?? "",
      categoria: item.categoria ?? "B",
      observaciones: item.observaciones ?? "",
      activo: item.activo,
      conciliador_id: item.conciliador_id ?? "",
    })
    setCuentasForm([]) // Las existentes se muestran desde item.cuentas
    setNuevaCuenta({ sociedad_id: "", cuenta_interna: "", descripcion: "" })
    setEditando(item)
    setMostrarForm(true)
    setImportResult(null)
    setSeleccionados(new Set())
    setTimeout(() => document.getElementById("form-cuenta")?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  function cerrarForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_VACIO)
    setCuentasForm([])
  }

  function agregarCuentaAlForm() {
    if (!nuevaCuenta.sociedad_id || !nuevaCuenta.cuenta_interna.trim()) return
    // Verificar que no esté duplicada
    const yaExiste = cuentasForm.some(
      c => c.sociedad_id === nuevaCuenta.sociedad_id && c.cuenta_interna === nuevaCuenta.cuenta_interna.trim()
    )
    if (yaExiste) return
    setCuentasForm(prev => [...prev, { ...nuevaCuenta, cuenta_interna: nuevaCuenta.cuenta_interna.trim() }])
    setNuevaCuenta({ sociedad_id: nuevaCuenta.sociedad_id, cuenta_interna: "", descripcion: "" })
  }

  function quitarCuentaDelForm(idx: number) {
    setCuentasForm(prev => prev.filter((_, i) => i !== idx)  )
  }

  async function eliminarCuentaExistente(cuentaId: string, contraparteId: string) {
    if (!confirm("¿Desactivar esta cuenta? Las conciliaciones existentes no se ven afectadas.")) return
    await supabase.from("cuentas_proveedor").update({ activo: false }).eq("id", cuentaId)
    // Refrescar solo este item
    cargar()
  }

  // Toggle selección
  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (seleccionados.size === itemsFiltrados.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(itemsFiltrados.map(i => i.id)))
    }
  }

  async function asignarConciliadorMasivo() {
    if (!conciliadorMasivo || seleccionados.size === 0) return
    setAsignando(true)
    const ids = Array.from(seleccionados)
    const { error } = await supabase
      .from("contrapartes")
      .update({ conciliador_id: conciliadorMasivo || null, updated_at: new Date().toISOString() })
      .in("id", ids)
    if (error) { alert("Error al asignar: " + error.message) }
    else { setSeleccionados(new Set()); setConciliadorMasivo(""); cargar() }
    setAsignando(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)

    const payload = {
      nombre: form.nombre.trim(),
      cuit: form.cuit.trim() || null,
      tipo: form.tipo,
      es_contraparte: form.es_contraparte,
      rubro: form.rubro || null,
      grupo_economico: form.grupo_economico.trim() || null,
      categoria: form.categoria,
      observaciones: form.observaciones.trim() || null,
      activo: form.activo,
      conciliador_id: form.conciliador_id || null,
      updated_at: new Date().toISOString(),
    }

    let contraparteId: string | null = null

    if (editando) {
      const { error } = await supabase.from("contrapartes").update(payload).eq("id", editando.id)
      if (error) { alert("Error al guardar: " + error.message); setGuardando(false); return }

      // Registrar cambio de categoría
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
      contraparteId = editando.id
    } else {
      const { data: empresa } = await supabase.from("empresas").select("id").limit(1).single()
      const { data: grupo } = await supabase.from("grupos_trabajo").select("id").limit(1).single()
      const { data: nueva, error } = await supabase
        .from("contrapartes")
        .insert({ ...payload, empresa_id: empresa?.id, grupo_id: grupo?.id })
        .select().single()
      if (error || !nueva) { alert("Error al crear: " + error?.message); setGuardando(false); return }
      await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id })
      contraparteId = nueva.id
    }

    // Guardar cuentas nuevas del formulario
    if (contraparteId && cuentasForm.length > 0) {
      for (const c of cuentasForm) {
        await supabase.from("cuentas_proveedor").insert({
          contraparte_id: contraparteId,
          sociedad_id: c.sociedad_id,
          cuenta_interna: c.cuenta_interna,
          descripcion: c.descripcion || null,
          activo: true,
        })
      }
    }

    cerrarForm()
    cargar()
    setGuardando(false)
  }

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
        const nombre = String(f["Razón Social *"] ?? f["nombre"] ?? "").trim()
        if (!nombre) continue
        const categoria = String(f["Categoría *"] ?? f["categoria"] ?? "B").trim().toUpperCase()
        const tipo = String(f["Tipo de Cuenta *"] ?? f["tipo"] ?? "proveedor").trim().toLowerCase()
        const payload = {
          nombre, empresa_id: empresa?.id, grupo_id: grupo?.id,
          cuit: String(f["CUIT *"] ?? "").trim() || null,
          tipo: tipo === "cliente" ? "cliente" : "proveedor",
          es_contraparte: String(f["¿Es también contraparte?"] ?? "").toLowerCase() === "sí",
          rubro: String(f["Rubro *"] ?? "").trim() || null,
          grupo_economico: String(f["Grupo Económico"] ?? "").trim() || null,
          categoria: ["A","B","C","D","E","F"].includes(categoria) ? categoria : "B",
          observaciones: String(f["Observaciones"] ?? "").trim() || null,
          activo: true,
        }
        const { data: nueva, error } = await supabase.from("contrapartes").insert(payload).select().single()
        if (error) { errores.push(`Fila ${i + 2}: ${nombre} — ${error.message}`) }
        else { await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id }); ok++ }
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
    i.cuentas.some(c => c.sociedad_nombre.toLowerCase().includes(filtro.toLowerCase()) || c.cuenta_interna.toLowerCase().includes(filtro.toLowerCase()))
  )

  const todosSeleccionados = itemsFiltrados.length > 0 && seleccionados.size === itemsFiltrados.length
  const algunoSeleccionado = seleccionados.size > 0

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Configuración</div>
          <h1 className="h-page">Cuentas y plantillas</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Cada proveedor puede tener múltiples cuentas corrientes según la sociedad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={14} />
            {importando ? "Importando…" : "Importar Excel"}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && importarExcel(e.target.files[0])} disabled={importando} />
          </label>
          <a href="#" className="btn btn-secondary" onClick={e => { e.preventDefault(); descargarPlantilla() }}>
            <Download size={14} /> Plantilla
          </a>
          <button onClick={abrirNuevo} className="btn btn-primary">
            <Plus size={14} /> Nuevo proveedor
          </button>
        </div>
      </div>

      {/* Resultado importación */}
      {importResult && (
        <div className={`px-4 py-3 border text-sm flex items-start gap-3 ${importResult.errores.length === 0 ? "bg-ok-light border-ok/20 text-ok" : "bg-warn-light border-warn/20 text-warn"}`}>
          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">{importResult.ok} proveedor{importResult.ok !== 1 ? "es" : ""} importado{importResult.ok !== 1 ? "s" : ""}</div>
            {importResult.errores.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{importResult.errores.map((e, i) => <li key={i}>⚠ {e}</li>)}</ul>}
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Formulario */}
      {mostrarForm && (
        <div id="form-cuenta" className="card border-accent border-2 space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{editando ? `Editando: ${editando.nombre}` : "Nuevo proveedor"}</div>
            <button onClick={cerrarForm} className="text-ink-400 hover:text-ink-700"><X size={16} /></button>
          </div>

          {/* Identificación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Identificación</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Razón social *</label>
                <input value={form.nombre} onChange={e => setField("nombre", e.target.value)} placeholder="Nombre completo" className="input w-full" autoFocus />
              </div>
              <div>
                <label className="label">CUIT</label>
                <input value={form.cuit} onChange={e => setField("cuit", e.target.value)} placeholder="30712345678" className="input w-full font-mono" maxLength={11} />
              </div>
              <div>
                <label className="label">Rubro</label>
                <select value={form.rubro} onChange={e => setField("rubro", e.target.value)} className="input w-full">
                  <option value="">— Seleccioná —</option>
                  {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Tipo</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Tipo *</label>
                <div className="flex gap-2">
                  {["proveedor", "cliente"].map(t => (
                    <button key={t} type="button" onClick={() => setField("tipo", t)}
                      className={`flex-1 py-2 text-xs font-semibold border rounded transition-all capitalize ${form.tipo === t ? "bg-accent text-white border-accent" : "border-ink-200 text-ink-600 hover:border-accent"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.es_contraparte} onChange={e => setField("es_contraparte", e.target.checked)} className="w-4 h-4 accent-accent" />
                  <span>¿Opera también como {form.tipo === "proveedor" ? "cliente" : "proveedor"}?</span>
                </label>
              </div>
              <div>
                <label className="label">Grupo económico</label>
                <input value={form.grupo_economico} onChange={e => setField("grupo_economico", e.target.value)} placeholder="Si pertenece a un grupo" className="input w-full" />
              </div>
            </div>
          </div>

          {/* Conciliación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Conciliación</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Conciliador asignado</label>
                <select value={form.conciliador_id} onChange={e => setField("conciliador_id", e.target.value)} className="input w-full">
                  <option value="">— Sin asignar —</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Categoría *</label>
                <select value={form.categoria} onChange={e => setField("categoria", e.target.value)} className="input w-full">
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Observaciones</label>
                <input value={form.observaciones} onChange={e => setField("observaciones", e.target.value)} placeholder="Notas internas" className="input w-full" />
              </div>
              {editando && (
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={form.activo} onChange={e => setField("activo", e.target.checked)} className="w-4 h-4 accent-accent" />
                    <span>Proveedor activo</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ── CUENTAS POR SOCIEDAD ── */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3 flex items-center justify-between">
              <span>Cuentas corrientes por sociedad</span>
              <span className="text-ink-400 font-normal normal-case">Una cuenta por cada sociedad con la que opera</span>
            </div>

            {/* Cuentas existentes (solo en modo edición) */}
            {editando && editando.cuentas.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {editando.cuentas.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-ink-50 border border-ink-200 rounded px-3 py-2">
                    <div className="flex-1">
                      <span className="text-xs font-semibold">{c.sociedad_nombre}</span>
                      <span className="text-ink-400 mx-2">·</span>
                      <span className="text-xs font-mono">{c.cuenta_interna}</span>
                      {c.descripcion && <span className="text-2xs text-ink-400 ml-2">{c.descripcion}</span>}
                    </div>
                    <span className="text-2xs bg-ok-light text-ok px-1.5 py-0.5 rounded">Activa</span>
                    <button
                      onClick={() => eliminarCuentaExistente(c.id, editando.id)}
                      className="text-ink-400 hover:text-danger transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Cuentas nuevas pendientes de guardar */}
            {cuentasForm.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {cuentasForm.map((c, idx) => {
                  const soc = sociedades.find(s => s.id === c.sociedad_id)
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-accent-light border border-accent/20 rounded px-3 py-2">
                      <div className="flex-1">
                        <span className="text-xs font-semibold">{soc?.nombre ?? "—"}</span>
                        <span className="text-ink-400 mx-2">·</span>
                        <span className="text-xs font-mono">{c.cuenta_interna}</span>
                        {c.descripcion && <span className="text-2xs text-ink-400 ml-2">{c.descripcion}</span>}
                      </div>
                      <span className="text-2xs bg-warn-light text-warn px-1.5 py-0.5 rounded">Por guardar</span>
                      <button onClick={() => quitarCuentaDelForm(idx)} className="text-ink-400 hover:text-danger transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Agregar nueva cuenta */}
            <div className="flex items-end gap-2 bg-ink-50 border border-dashed border-ink-300 rounded p-3">
              <div className="flex-1">
                <label className="label">Sociedad *</label>
                <select
                  value={nuevaCuenta.sociedad_id}
                  onChange={e => setNuevaCuenta(v => ({ ...v, sociedad_id: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">— Seleccioná —</option>
                  {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="label">N° Cuenta corriente *</label>
                <input
                  value={nuevaCuenta.cuenta_interna}
                  onChange={e => setNuevaCuenta(v => ({ ...v, cuenta_interna: e.target.value }))}
                  placeholder="Ej: 355 / CTA-001"
                  className="input w-full font-mono"
                  onKeyDown={e => e.key === "Enter" && agregarCuentaAlForm()}
                />
              </div>
              <div className="flex-1">
                <label className="label">Descripción</label>
                <input
                  value={nuevaCuenta.descripcion}
                  onChange={e => setNuevaCuenta(v => ({ ...v, descripcion: e.target.value }))}
                  placeholder="Opcional"
                  className="input w-full"
                />
              </div>
              <button
                onClick={agregarCuentaAlForm}
                disabled={!nuevaCuenta.sociedad_id || !nuevaCuenta.cuenta_interna.trim()}
                className="btn btn-primary disabled:opacity-40 flex-shrink-0"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            {sociedades.length === 0 && (
              <div className="text-2xs text-warn mt-2">
                ⚠ No hay sociedades cargadas. <a href="/sociedades" className="underline">Ir a Sociedades →</a>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-200">
            <button onClick={cerrarForm} className="btn btn-secondary">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !form.nombre.trim()} className="btn btn-primary disabled:opacity-40">
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <input value={filtro} onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar por nombre, CUIT, sociedad o N° cuenta…"
            className="input w-full max-w-sm" />
          {puedeAsignar && seleccionados.size > 0 && (
            <div className="text-2xs text-ink-400">
              {seleccionados.size} seleccionado{seleccionados.size > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">Sin proveedores aún</div>
          <p className="text-sm text-ink-500 mt-1 mb-4">Creá el primer proveedor o importá desde Excel.</p>
          <button onClick={abrirNuevo} className="btn btn-primary inline-flex">+ Nuevo proveedor</button>
        </div>
      ) : (
        <div className="panel divide-y divide-ink-200">
          {puedeAsignar && (
            <div className="flex items-center px-4 py-2.5 bg-ink-50 border-b border-ink-200">
              <input type="checkbox" checked={todosSeleccionados} onChange={toggleTodos} className="w-4 h-4 accent-accent mr-3 flex-shrink-0" />
              <span className="text-2xs text-ink-500 uppercase tracking-wider font-semibold">
                {todosSeleccionados ? "Deseleccionar todos" : `Seleccionar todos (${itemsFiltrados.length})`}
              </span>
            </div>
          )}

          {itemsFiltrados.map(item => (
            <div key={item.id} className={`flex items-start px-4 py-3 hover:bg-ink-50 transition-colors group ${seleccionados.has(item.id) ? "bg-accent-light/30" : ""}`}>
              {puedeAsignar && (
                <input type="checkbox" checked={seleccionados.has(item.id)} onChange={() => toggleSeleccion(item.id)} className="w-4 h-4 accent-accent mr-3 flex-shrink-0 mt-1" />
              )}
              <div className="w-8 h-8 bg-accent-light flex items-center justify-center text-accent flex-shrink-0 mr-3 mt-0.5">
                <Building2 size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{item.nombre}</span>
                  {!item.activo && <span className="text-2xs bg-ink-100 text-ink-400 px-1.5 py-0.5 rounded">Inactivo</span>}
                </div>
                <div className="text-2xs text-ink-500 flex items-center gap-3 mt-0.5">
                  {item.cuit && <span className="font-mono">{item.cuit}</span>}
                  {item.tipo && <span className="capitalize">{item.tipo}</span>}
                  {item.conciliador_nombre
                    ? <span className="text-accent font-medium">👤 {item.conciliador_nombre}</span>
                    : <span className="text-ink-300 italic">Sin conciliador</span>
                  }
                </div>
                {/* Cuentas por sociedad */}
                {item.cuentas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {item.cuentas.map(c => (
                      <span key={c.id} className="inline-flex items-center gap-1 text-2xs bg-ink-100 text-ink-600 px-2 py-0.5 rounded border border-ink-200">
                        <span className="font-semibold">{c.sociedad_nombre}</span>
                        <span className="text-ink-400">·</span>
                        <span className="font-mono">{c.cuenta_interna}</span>
                      </span>
                    ))}
                  </div>
                )}
                {item.cuentas.length === 0 && (
                  <div className="text-2xs text-warn mt-1">⚠ Sin cuentas asignadas</div>
                )}
              </div>

              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                {item.categoria && (
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded font-mono ${CAT_COLORS[item.categoria] ?? ""}`}>
                    {item.categoria}
                  </span>
                )}
                <button onClick={() => abrirEditar(item)} className="btn btn-secondary py-1 px-2 text-2xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil size={12} /> Editar
                </button>
                <Link href={`/plantillas/${item.id}`} className="btn btn-secondary py-1 px-2 text-2xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <Settings size={12} /> Plantilla
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barra flotante asignación masiva */}
      {puedeAsignar && algunoSeleccionado && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-4 min-w-[480px]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users size={16} className="text-accent" />
            <span>{seleccionados.size} proveedor{seleccionados.size > 1 ? "es" : ""} seleccionado{seleccionados.size > 1 ? "s" : ""}</span>
          </div>
          <div className="flex-1">
            <select value={conciliadorMasivo} onChange={e => setConciliadorMasivo(e.target.value)}
              className="w-full bg-ink-800 text-white border border-ink-600 rounded px-3 py-1.5 text-sm outline-none focus:border-accent">
              <option value="">— Seleccioná un conciliador —</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
            </select>
          </div>
          <button onClick={asignarConciliadorMasivo} disabled={!conciliadorMasivo || asignando}
            className="bg-accent hover:bg-accent-dark text-white px-4 py-1.5 rounded text-sm font-semibold disabled:opacity-40 transition-all whitespace-nowrap">
            {asignando ? "Asignando…" : "Asignar"}
          </button>
          <button onClick={() => { setSeleccionados(new Set()); setConciliadorMasivo("") }} className="text-ink-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function descargarPlantilla() {
  import("xlsx").then(XLSX => {
    const wb = XLSX.utils.book_new()
    const datos = [
      ["Razón Social *", "CUIT *", "Tipo de Cuenta *", "¿Es también contraparte?", "Rubro *", "Grupo Económico", "Categoría *", "Observaciones"],
      ["Distribuidora Norte SA", "30712345678", "Proveedor", "No", "Servicios", "", "A", ""],
      ["Comercial Sur SRL", "20301234567", "Cliente", "No", "Comercial", "Grupo ABC", "B", ""],
    ]
    const ws = XLSX.utils.aoa_to_sheet(datos)
    ws["!cols"] = [{ wch: 28 }, { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, ws, "Maestro de Proveedores")

    const nota = [
      ["NOTA IMPORTANTE"],
      ["Las cuentas por sociedad (N° de cuenta corriente) se asignan manualmente desde la app"],
      ["después de importar los proveedores. La importación crea el proveedor maestro."],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nota), "Instrucciones")

    const catsData = [
      ["Categoría", "Frecuencia", "Descripción"],
      ["A", "Semanal", "Alto movimiento — conciliación semanal + vencimiento mensual"],
      ["B", "Mensual", "Conciliación mensual"],
      ["C", "Anual", "Bajo movimiento — anual"],
      ["D", "Anual exc.", "Requiere aprobación supervisor"],
      ["E", "Manual", "Sin frecuencia automática"],
      ["F", "Manual", "Seguimiento especial"],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catsData), "Categorías")
    XLSX.writeFile(wb, "plantilla_maestro_proveedores.xlsx")
  })
}