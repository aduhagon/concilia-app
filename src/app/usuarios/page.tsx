"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { Plus, X, Pencil, UserCheck, UserX, Mail, Shield, User } from "lucide-react"

type Usuario = {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  primer_login: boolean
  created_at: string
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

    // Usuario actual
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: actual } = await supabase
        .from("usuarios")
        .select("id, nombre, email, rol, activo, primer_login, created_at")
        .eq("id", user.id)
        .single()
      if (actual) setUsuarioActual(actual)
    }

    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre, email, rol, activo, primer_login, created_at")
      .order("nombre")

    setUsuarios(data ?? [])
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
      // Solo actualizar nombre y rol — no el email
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
      // CREAR — invitar usuario nuevo
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()

      // 1. Crear en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin
        ? // Si tiene permisos admin usar admin API
          { data: null, error: { message: "usar invitación" } }
        : { data: null, error: { message: "usar invitación" } }

      // Como el cliente no tiene permisos admin, usamos el flujo de invitación
      // Generamos un token de invitación y lo guardamos
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
        // Mostrar el link de activación
        const link = `${window.location.origin}/activar?token=${token}`
        setResultado({
          tipo: "ok",
          msg: `✅ Invitación creada. Enviá este link al usuario:\n${link}`,
        })
        cargar()
        // No cerrar el form para que el admin pueda copiar el link
      }
    }
    setGuardando(false)
  }

  async function toggleActivo(u: Usuario) {
    if (u.id === usuarioActual?.id) {
      alert("No podés desactivar tu propio usuario")
      return
    }
    const { error } = await supabase
      .from("usuarios")
      .update({ activo: !u.activo, updated_at: new Date().toISOString() })
      .eq("id", u.id)

    if (!error) cargar()
  }

  async function reenviarInvitacion(u: Usuario) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { data: grupo } = await supabase.from("grupos_trabajo").select("id").limit(1).single()

    // Invalidar invitaciones anteriores para este email
    await supabase
      .from("invitaciones")
      .update({ usado: true })
      .eq("email", u.email)
      .eq("usado", false)

    // Crear nueva invitación
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
    alert(`Nuevo link de activación:\n\n${link}\n\nVálido por 48 horas.`)
  }

  // Solo admin puede ver esta página — verificar
  const esAdmin = usuarioActual?.rol === "admin"
  const esSupervisor = usuarioActual?.rol === "supervisor"

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Administración</div>
          <h1 className="h-page">Usuarios</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Gestión de accesos al sistema. Los nuevos usuarios reciben un link de activación por 48 horas.
          </p>
        </div>
        {(esAdmin || esSupervisor) && (
          <button onClick={abrirNuevo} className="btn btn-primary">
            <Plus size={14} /> Nuevo usuario
          </button>
        )}
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

          {/* Resultado */}
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
              {guardando
                ? "Guardando…"
                : editando
                  ? "Guardar cambios"
                  : "Crear y generar link"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : (
        <div className="panel divide-y divide-ink-200">
          {usuarios.map(u => {
            const rolCfg = ROL_CONFIG[u.rol] ?? ROL_CONFIG.operativo
            const esMismo = u.id === usuarioActual?.id

            return (
              <div
                key={u.id}
                className={`flex items-center px-4 py-3 gap-3 group ${!u.activo ? "opacity-50" : ""}`}
              >
                {/* Avatar */}
                <div className="w-8 h-8 bg-accent-light flex items-center justify-center text-accent font-semibold text-sm flex-shrink-0">
                  {u.nombre.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{u.nombre}</span>
                    {esMismo && (
                      <span className="text-2xs bg-accent text-white px-1.5 py-0.5 rounded">Vos</span>
                    )}
                    {!u.activo && (
                      <span className="text-2xs bg-ink-100 text-ink-400 px-1.5 py-0.5 rounded">Inactivo</span>
                    )}
                    {u.primer_login && u.activo && (
                      <span className="text-2xs bg-warn-light text-warn px-1.5 py-0.5 rounded">Sin activar</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-2xs text-ink-500 flex items-center gap-1">
                      <Mail size={10} /> {u.email}
                    </span>
                    <span className={`text-2xs font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${rolCfg.color}`}>
                      {rolCfg.icon} {rolCfg.label}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {u.primer_login && u.activo && (
                    <button
                      onClick={() => reenviarInvitacion(u)}
                      className="btn btn-secondary py-1 px-2 text-2xs"
                      title="Reenviar link de activación"
                    >
                      <Mail size={11} /> Reenviar link
                    </button>
                  )}
                  {(esAdmin || (esSupervisor && u.rol === "operativo")) && !esMismo && (
                    <button
                      onClick={() => abrirEditar(u)}
                      className="btn btn-secondary py-1 px-2 text-2xs"
                    >
                      <Pencil size={11} /> Editar
                    </button>
                  )}
                  {!esMismo && (esAdmin || (esSupervisor && u.rol === "operativo")) && (
                    <button
                      onClick={() => toggleActivo(u)}
                      className={`btn py-1 px-2 text-2xs ${u.activo ? "btn-secondary text-danger" : "btn-secondary text-ok"}`}
                      title={u.activo ? "Desactivar usuario" : "Activar usuario"}
                    >
                      {u.activo ? <UserX size={11} /> : <UserCheck size={11} />}
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
