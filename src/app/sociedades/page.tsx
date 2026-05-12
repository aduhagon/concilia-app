"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { Plus, X, Pencil, CheckCircle2, AlertCircle, Building } from "lucide-react"

type Sociedad = {
  id: string
  nombre: string
  codigo: string | null
  activo: boolean
  cuentas?: number
}

export default function SociedadesPage() {
  const [sociedades, setSociedades] = useState<Sociedad[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Sociedad | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)

  const [nombre, setNombre] = useState("")
  const [codigo, setCodigo] = useState("")

  useEffect(() => {
    async function init() {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()
      if (grupo) {
        setGrupoId(grupo.id)
        await cargar(grupo.id)
      }
    }
    init()
  }, [])

  async function cargar(gid: string) {
    setLoading(true)
    const { data } = await supabase
      .from("sociedades")
      .select("id, nombre, codigo, activo")
      .eq("grupo_id", gid)
      .order("nombre")

    // Contar cuentas por sociedad
    const items: Sociedad[] = []
    for (const s of data ?? []) {
      const { count } = await supabase
        .from("contrapartes")
        .select("id", { count: "exact", head: true })
        .eq("sociedad_id", s.id)
      items.push({ ...s, cuentas: count ?? 0 })
    }
    setSociedades(items)
    setLoading(false)
  }

  function abrirNuevo() {
    setNombre("")
    setCodigo("")
    setEditando(null)
    setMostrarForm(true)
    setResultado(null)
  }

  function abrirEditar(s: Sociedad) {
    setNombre(s.nombre)
    setCodigo(s.codigo ?? "")
    setEditando(s)
    setMostrarForm(true)
    setResultado(null)
  }

  function cerrar() {
    setMostrarForm(false)
    setEditando(null)
    setNombre("")
    setCodigo("")
  }

  async function guardar() {
    if (!nombre.trim() || !grupoId) return
    setGuardando(true)
    setResultado(null)

    const payload = {
      nombre: nombre.trim(),
      codigo: codigo.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (editando) {
      const { error } = await supabase
        .from("sociedades")
        .update(payload)
        .eq("id", editando.id)

      if (error) {
        setResultado({ tipo: "error", msg: "Error: " + error.message })
      } else {
        cerrar()
        cargar(grupoId)
      }
    } else {
      const { error } = await supabase
        .from("sociedades")
        .insert({ ...payload, grupo_id: grupoId, activo: true })

      if (error) {
        setResultado({ tipo: "error", msg: error.message.includes("unique") ? "Ya existe una sociedad con ese nombre" : "Error: " + error.message })
      } else {
        cerrar()
        cargar(grupoId)
      }
    }
    setGuardando(false)
  }

  async function toggleActivo(s: Sociedad) {
    await supabase
      .from("sociedades")
      .update({ activo: !s.activo, updated_at: new Date().toISOString() })
      .eq("id", s.id)
    if (grupoId) cargar(grupoId)
  }

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Configuración inicial</div>
          <h1 className="h-page">Sociedades</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Las sociedades son las entidades legales del grupo. Cada cuenta corriente pertenece a una sociedad.
          </p>
        </div>
        <button onClick={abrirNuevo} className="btn btn-primary">
          <Plus size={14} /> Nueva sociedad
        </button>
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="card border-accent border-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {editando ? `Editando: ${editando.nombre}` : "Nueva sociedad"}
            </div>
            <button onClick={cerrar} className="text-ink-400 hover:text-ink-700">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre de la sociedad *</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: MSU S.A."
                className="input w-full"
                autoFocus
                onKeyDown={e => e.key === "Enter" && guardar()}
              />
            </div>
            <div>
              <label className="label">Código interno</label>
              <input
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="Ej: MSU"
                className="input w-full font-mono"
                onKeyDown={e => e.key === "Enter" && guardar()}
              />
              <div className="text-2xs text-ink-400 mt-1">Opcional — para identificación rápida</div>
            </div>
          </div>

          {resultado && (
            <div className={`flex items-center gap-2 px-4 py-3 text-sm border ${
              resultado.tipo === "ok"
                ? "bg-ok-light border-ok/20 text-ok"
                : "bg-danger-light border-danger/20 text-danger"
            }`}>
              {resultado.tipo === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {resultado.msg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-200">
            <button onClick={cerrar} className="btn btn-secondary">Cancelar</button>
            <button
              onClick={guardar}
              disabled={guardando || !nombre.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear sociedad"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : sociedades.length === 0 ? (
        <div className="card text-center py-12">
          <Building size={28} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">Sin sociedades aún</div>
          <p className="text-xs text-ink-500 mt-1 mb-4">Creá la primera sociedad para poder asignarla a las cuentas.</p>
          <button onClick={abrirNuevo} className="btn btn-primary inline-flex">+ Nueva sociedad</button>
        </div>
      ) : (
        <div className="panel divide-y divide-ink-200">
          {sociedades.map(s => (
            <div key={s.id} className={`flex items-center px-4 py-3 hover:bg-ink-50 transition-colors group ${!s.activo ? "opacity-50" : ""}`}>
              <div className="w-8 h-8 bg-accent-light flex items-center justify-center text-accent flex-shrink-0 mr-3">
                <Building size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.nombre}</span>
                  {s.codigo && (
                    <span className="text-2xs font-mono bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded">{s.codigo}</span>
                  )}
                  {!s.activo && (
                    <span className="text-2xs bg-ink-100 text-ink-400 px-1.5 py-0.5 rounded">Inactiva</span>
                  )}
                </div>
                <div className="text-2xs text-ink-400 mt-0.5">
                  {s.cuentas ?? 0} cuenta{s.cuentas !== 1 ? "s" : ""} asignada{s.cuentas !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => abrirEditar(s)}
                  className="btn btn-secondary py-1 px-2 text-2xs"
                >
                  <Pencil size={11} /> Editar
                </button>
                <button
                  onClick={() => toggleActivo(s)}
                  disabled={(s.cuentas ?? 0) > 0 && s.activo}
                  className="btn btn-secondary py-1 px-2 text-2xs disabled:opacity-30"
                  title={(s.cuentas ?? 0) > 0 && s.activo ? "Tiene cuentas asignadas" : ""}
                >
                  {s.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
