"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { Plus, X, Pencil, UserCheck, UserX, Mail, Shield, User, Clock, CheckCircle2, AlertCircle } from "lucide-react"

type Usuario = {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  primer_login: boolean
  created_at: string
  last_sign_in_at: string | null
  conciliaciones_mes: number
  conciliaciones_total: number
}

type FormData = {
  nombre: string
  email: string
  rol: string
}

const FORM_VACIO: FormData = { nombre: "", email: "", rol: "operativo" }

const ROL_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  admin: { label: "Administrador", color: "bg-danger-light text-danger", icon: <Shield size={11} /> },
  supervisor: { label: "Supervisor", color: "bg-warn-light text-warn", icon: <UserCheck size={11} /> },
  operativo: { label: "Operativo", color: "bg-info-light text-info", icon: <User size={11} /> },
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const hoy = new Date()
  const diffMs = hoy.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDias = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "Ahora mismo"
  if (diffMin < 60) return `Hace ${diffMin} min`
  if (diffHrs < 24) return `Hace ${diffHrs}h`
  if (diffDias === 1) return "Ayer"
  if (diffDias < 7) return `Hace ${diffDias} días`
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
}

function EstadoActivacion({ u }: { u: Usuario }) {
  if (!u.activo) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold bg-ink-100 text-ink-400 px-2 py-0.5 rounded-full">
        <UserX size={10} /> Inactivo
      </span>
    )
  }
  if (u.primer_login) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold bg-warn-light text-warn px-2 py-0.5 rounded-full">
        <AlertCircle size={10} /> Pendiente activación
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-2xs font-semibold bg-ok-light text-ok px-2 py-0.5 rounded-full">
      <CheckCircle2 size={10} /> Activo
    </span>
  )
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState<FormData>(FORM_VACIO)
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)

  async function cargar() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { data } = await supabase
      .from("usuarios_stats")
      .select("*")
      .order("nombre")

    const lista = (data ?? []) as Usuario[]
    setUsuarios(lista)

    if (user) {
      const actual = lista.find(u => u.id === user.id)
      if (actual) setUsuarioActual(actual)
    }

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
    setResultado(null)
  }

  function abrirEditar(u: Usuario) {
    setForm({ nombre: u.nombre, email: u.email, rol: u.rol })
    setEditando(u)
    setMostrarForm(true)
    setResultado(null)
    setTimeout(() => document.getElementById("form-usuario")?.scrollIntoView({ behavior: "smooth" }), 100)
  }

  function cerrarForm() {
    setMostrarForm(false)
    setEditando(null)
    setForm(FORM_VACIO)
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.email.trim()) return
    setGuardando(true)
    setResultado(null)

    if (editando) {
      const { error } = await supabase
        .from("usuarios")
        .update({
          nombre: form.nombre.trim(),
          rol: form.rol,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editando.id)

      if (error) {
        setResultado({ tipo: "error", msg: "Error al guardar: " + error.message })
      } else {
        setResultado({ tipo: "ok", msg: "Usuario actualizado correctamente" })
        cerrarForm()
        cargar()
      }
    } else {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()

      const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
      const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      const { error: invError } = await supabase
        .from("invitaciones")
        .insert({
          grupo_id: grupo?.id,
          email: form.email.trim().toLowerCase(),
          nombre: form.nombre.trim(),
          rol: form.rol,
          token,
          expira_at: expira,
          usado: false,
        })

      if (invError) {
        setResultado({ tipo: "error", msg: "Error al crear invitación: " + invError.message })
      } else {
        const link = `${window.location.origin}/activar?token=${token}`
        setResultado({ tipo: "ok", msg: `✅ Invitación creada. Enviá este link al usuario:\n${link}` })
        cargar()
      }
    }
    setGuardando(false)
  }

  async function toggleActivo(u: Usuario) {
    if (u.id === usuarioActual?.id) {
      alert("No podés desactivar tu propio usuario")
      return
    }
    await supabase
      .from("usuarios")
      .update({ activo: !u.activo, updated_at: new Date().toISOString() })
      .eq("id", u.id)
    cargar()
  }

  async function reenviarInvitacion(u: Usuario) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const { data: grupo } = await supabase.from("grupos_trabajo").select("id").limit(1).single()

    await supabase.from("invitaciones")
      .update({ usado: true })
      .eq("email", u.email)
      .eq("usado", false)

    await supabase.from("invitaciones").insert({
      grupo_id: grupo?.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      token,
      expira_at: expira,
      usado: false,
    })

    const link = `${window.location.origin}/activar?token=${token}`
    alert(`Nuevo link de activación (válido 48hs):\n\n${link}`)
  }

  const esAdmin = usuarioActual?.rol === "admin"
  const esSupervisor = usuarioActual?.rol === "supervisor"

  // Stats generales
  const stats = {
    total: usuarios.length,
    activos: usuarios.filter(u => u.activo && !u.primer_login).length,
    pendientes: usuarios.filter(u => u.primer_login && u.activo).length,
    inactivos: usuarios.filter(u => !u.activo).length,
  }

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Administración</div>
          <h1 className="h-page">Usuarios</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Gestión de accesos. Los nuevos usuarios reciben un link de activación válido por 48 horas.
          </p>
        </div>
        {(esAdmin || esSupervisor) && (
          <button onClick={abrirNuevo} className="btn btn-primary">
            <Plus size={14} /> Nuevo usuario
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel p-4">
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Total</div>
          <div className="text-2xl font-semibold num">{stats.total}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs uppercase tracking-wider text-ok mb-1 flex items-center gap-1">
            <CheckCircle2 size={11} /> Activos
          </div>
          <div className="text-2xl font-semibold num text-ok">{stats.activos}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs uppercase tracking-wider text-warn mb-1 flex items-center gap-1">
            <AlertCircle size={11} /> Sin activar
          </div>
          <div className="text-2xl font-semibold num text-warn">{stats.pendientes}</div>
        </div>
        <div className="panel p-4">
          <div className="text-2xs uppercase tracking-wider text-ink-400 mb-1 flex items-center gap-1">
            <UserX size={11} /> Inactivos
          </div>
          <div className="text-2xl font-semibold num text-ink-400">{stats.inactivos}</div>
        </div>
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div id="form-usuario" className="card border-accent border-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {editando ? `Editando: ${editando.nombre}` : "Nuevo usuario"}
            </div>
            <button onClick={cerrarForm} className="text-ink-400 hover:text-ink-700">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Nombre completo *</label>
              <input
                value={form.nombre}
                onChange={e => setField("nombre", e.target.value)}
                placeholder="Juan Pérez"
                className="input w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                value={form.email}
                onChange={e => setField("email", e.target.value)}
                placeholder="usuario@empresa.com"
                className="input w-full"
                type="email"
                disabled={!!editando}
              />
              {editando && (
                <div className="text-2xs text-ink-400 mt-1">El email no se puede modificar</div>
              )}
            </div>
            <div>
              <label className="label">Rol *</label>
              <div className="flex gap-2">
                {(esAdmin
                  ? ["operativo", "supervisor", "admin"]
                  : ["operativo"]
                ).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setField("rol", r)}
                    className={`flex-1 py-2 text-xs font-semibold border rounded transition-all capitalize ${
                      form.rol === r
                        ? "bg-accent text-white border-accent"
                        : "border-ink-200 text-ink-600 hover:border-accent"
                    }`}
                  >
                    {ROL_CONFIG[r]?.label ?? r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {resultado && (
            <div className={`px-4 py-3 text-sm border whitespace-pre-wrap font-mono text-xs ${
              resultado.tipo === "ok"
                ? "bg-ok-light border-ok/20 text-ok"
                : "bg-danger-light border-danger/20 text-danger"
            }`}>
              {resultado.msg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-200">
            <button onClick={cerrarForm} className="btn btn-secondary">Cancelar</button>
            <button
              onClick={guardar}
              disabled={guardando || !form.nombre.trim() || !form.email.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear y generar link"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Usuario</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Rol</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Estado</th>
                <th className="text-left px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">
                  <span className="flex items-center gap-1"><Clock size={11} /> Último acceso</span>
                </th>
                <th className="text-center px-3 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Conc. este mes</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {usuarios.map(u => {
                const rolCfg = ROL_CONFIG[u.rol] ?? ROL_CONFIG.operativo
                const esMismo = u.id === usuarioActual?.id
                const puedeEditar = (esAdmin || (esSupervisor && u.rol === "operativo")) && !esMismo

                return (
                  <tr key={u.id} className={`group hover:bg-ink-50 transition-colors ${!u.activo ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-accent-light flex items-center justify-center text-accent font-semibold text-xs flex-shrink-0">
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{u.nombre}</span>
                            {esMismo && (
                              <span className="text-2xs bg-accent text-white px-1.5 py-0.5 rounded">Vos</span>
                            )}
                          </div>
                          <div className="text-2xs text-ink-400 flex items-center gap-1 mt-0.5">
                            <Mail size={10} /> {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-2xs font-semibold inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${rolCfg.color}`}>
                        {rolCfg.icon} {rolCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <EstadoActivacion u={u} />
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-xs text-ink-500">
                        {formatFecha(u.last_sign_in_at)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className={`text-sm font-semibold num ${u.conciliaciones_mes > 0 ? "text-ok" : "text-ink-300"}`}>
                        {u.conciliaciones_mes}
                      </span>
                      {u.conciliaciones_total > 0 && (
                        <div className="text-2xs text-ink-400">{u.conciliaciones_total} total</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {u.primer_login && u.activo && (
                          <button
                            onClick={() => reenviarInvitacion(u)}
                            className="btn btn-secondary py-1 px-2 text-2xs"
                            title="Reenviar link"
                          >
                            <Mail size={11} /> Reenviar
                          </button>
                        )}
                        {puedeEditar && (
                          <button
                            onClick={() => abrirEditar(u)}
                            className="btn btn-secondary py-1 px-2 text-2xs"
                          >
                            <Pencil size={11} /> Editar
                          </button>
                        )}
                        {puedeEditar && (
                          <button
                            onClick={() => toggleActivo(u)}
                            className={`btn py-1 px-2 text-2xs ${u.activo ? "btn-secondary text-danger" : "btn-secondary text-ok"}`}
                          >
                            {u.activo ? <UserX size={11} /> : <UserCheck size={11} />}
                            {u.activo ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}