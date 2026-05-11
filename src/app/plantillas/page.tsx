"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import { Plus, Settings, Building2, X, ChevronDown } from "lucide-react"

type Item = {
  id: string
  nombre: string
  cuit: string | null
  tipo: string | null
  categoria: string | null
  sociedad: string | null
  activo: boolean
  plantilla_id?: string
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
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState("")

  // Formulario nueva contraparte
  const [form, setForm] = useState({
    nombre: "",
    cuit: "",
    cuenta_interna: "",
    tipo: "proveedor",
    es_contraparte: false,
    rubro: "",
    sociedad: "",
    grupo_economico: "",
    categoria: "B",
    observaciones: "",
  })

  async function cargar() {
    setLoading(true)
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, nombre, cuit, tipo, categoria, sociedad, activo, plantillas_proveedor(id)")
      .order("nombre")

    const items: Item[] = (contras ?? []).map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      cuit: c.cuit,
      tipo: c.tipo,
      categoria: c.categoria,
      sociedad: c.sociedad,
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

  async function crearContraparte() {
    if (!form.nombre.trim()) return
    setGuardando(true)

    const { data: empresa } = await supabase
      .from("empresas")
      .select("id")
      .limit(1)
      .single()

    const { data: grupo } = await supabase
      .from("grupos_trabajo")
      .select("id")
      .limit(1)
      .single()

    const { data: nueva, error } = await supabase
      .from("contrapartes")
      .insert({
        nombre: form.nombre.trim(),
        empresa_id: empresa?.id,
        grupo_id: grupo?.id,
        cuit: form.cuit.trim() || null,
        cuenta_interna: form.cuenta_interna.trim() || null,
        tipo: form.tipo,
        es_contraparte: form.es_contraparte,
        rubro: form.rubro || null,
        sociedad: form.sociedad.trim() || null,
        grupo_economico: form.grupo_economico.trim() || null,
        categoria: form.categoria,
        observaciones: form.observaciones.trim() || null,
        activo: true,
      })
      .select()
      .single()

    if (!error && nueva) {
      await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id })
      setForm({
        nombre: "", cuit: "", cuenta_interna: "", tipo: "proveedor",
        es_contraparte: false, rubro: "", sociedad: "",
        grupo_economico: "", categoria: "B", observaciones: "",
      })
      setMostrarForm(false)
      cargar()
    } else if (error) {
      alert("Error al crear: " + error.message)
    }
    setGuardando(false)
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
        <button
          onClick={() => setMostrarForm(v => !v)}
          className="btn btn-primary"
        >
          <Plus size={14} />
          Nueva cuenta
        </button>
      </div>

      {/* Formulario nueva cuenta */}
      {mostrarForm && (
        <div className="card border-accent border-2 space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Nueva cuenta</div>
            <button onClick={() => setMostrarForm(false)} className="text-ink-400 hover:text-ink-700">
              <X size={16} />
            </button>
          </div>

          {/* Identificación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Identificación</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
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
              <div className="flex items-end pb-0.5">
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
                  placeholder="Si pertenece a un grupo, sino dejar vacío"
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          {/* Conciliación */}
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Conciliación</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-200">
            <button
              onClick={() => setMostrarForm(false)}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={crearContraparte}
              disabled={guardando || !form.nombre.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Crear cuenta"}
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
            Empezá creando la primera cuenta para conciliar.
          </p>
          <button
            onClick={() => setMostrarForm(true)}
            className="btn btn-primary inline-flex"
          >
            + Nueva cuenta
          </button>
        </div>
      ) : (
        <div className="panel divide-y divide-ink-200">
          {itemsFiltrados.map(item => (
            <Link
              key={item.id}
              href={`/plantillas/${item.id}`}
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
                    <span>{item.plantilla_id ? "Con plantilla" : "Sin plantilla"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.categoria && (
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded font-mono ${CAT_COLORS[item.categoria] ?? ""}`}>
                    {item.categoria}
                  </span>
                )}
                <Settings size={14} className="text-ink-400 group-hover:text-accent transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}