"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, Fragment } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Building2, Copy, Check, ShieldAlert, Loader2, UserPlus, Link as LinkIcon, Users, RefreshCw, Ban, RotateCcw, ChevronDown, UserCog } from "lucide-react"

const BASE_URL = "https://concilia-app-seven.vercel.app"

type Resultado = {
  grupo_id: string
  slug: string
  token: string
  admin_email: string
}

type Cliente = {
  grupo_id: string
  nombre: string
  slug: string
  plan: string | null
  activo: boolean
  fecha_alta: string
  admin_email: string | null
  admin_nombre: string | null
  invitacion_usada: boolean | null
  invitacion_expira: string | null
  invitacion_token: string | null
}

type AdminUsuario = {
  id: string
  nombre: string
  email: string
  activo: boolean
  ultimo_acceso: string | null
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  })
}

export default function SuperAdminPage() {
  const router = useRouter()
  const [autorizado, setAutorizado] = useState<boolean | null>(null)

  const [nombreGrupo, setNombreGrupo] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTocado, setSlugTocado] = useState(false)
  const [cuit, setCuit] = useState("")
  const [plan, setPlan] = useState("")
  const [nombreSociedad, setNombreSociedad] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminNombre, setAdminNombre] = useState("")
  const [nombreDisplay, setNombreDisplay] = useState("")

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [copiado, setCopiado] = useState(false)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)

  // Gestión de admins por grupo expandido
  const [expandido, setExpandido] = useState<string | null>(null)
  const [admins, setAdmins] = useState<AdminUsuario[]>([])
  const [cargandoAdmins, setCargandoAdmins] = useState(false)

  async function cargarClientes() {
    setCargandoClientes(true)
    const { data, error } = await supabase.rpc("listar_clientes")
    if (!error && data) setClientes(data as Cliente[])
    setCargandoClientes(false)
  }

  async function toggleGrupo(c: Cliente) {
    const accion = c.activo ? "dar de baja" : "reactivar"
    const msg = c.activo
      ? `¿Dar de baja a "${c.nombre}"? Se inhabilitará el acceso de todos sus usuarios. Es reversible.`
      : `¿Reactivar a "${c.nombre}"? Se rehabilitará el acceso de sus usuarios.`
    if (!window.confirm(msg)) return

    setAccionEnCurso(c.grupo_id)
    const { error } = await supabase.rpc("set_grupo_activo", {
      p_grupo_id: c.grupo_id,
      p_activo: !c.activo,
    })
    setAccionEnCurso(null)
    if (error) { alert(`No se pudo ${accion}: ${error.message}`); return }
    cargarClientes()
  }

  async function abrirAdmins(grupoId: string) {
    if (expandido === grupoId) { setExpandido(null); return }
    setExpandido(grupoId)
    setAdmins([])
    setCargandoAdmins(true)
    const { data, error } = await supabase.rpc("listar_admins_grupo", { p_grupo_id: grupoId })
    if (!error && data) setAdmins(data as AdminUsuario[])
    setCargandoAdmins(false)
  }

  async function toggleAdmin(u: AdminUsuario, grupoId: string) {
    const msg = u.activo
      ? `¿Inhabilitar a ${u.nombre} (${u.email})? No podrá iniciar sesión. Es reversible.`
      : `¿Rehabilitar a ${u.nombre} (${u.email})?`
    if (!window.confirm(msg)) return

    setAccionEnCurso(u.id)
    const { error } = await supabase.rpc("set_usuario_activo", {
      p_usuario_id: u.id,
      p_activo: !u.activo,
    })
    setAccionEnCurso(null)
    if (error) { alert(error.message); return }
    // Recargar la lista de admins del grupo
    const { data } = await supabase.rpc("listar_admins_grupo", { p_grupo_id: grupoId })
    if (data) setAdmins(data as AdminUsuario[])
  }

  // Verificar que el usuario es super-admin
  useEffect(() => {
    async function verificar() {
      const { data, error } = await supabase.rpc("es_super_admin")
      if (error || !data) {
        setAutorizado(false)
      } else {
        setAutorizado(true)
        cargarClientes()
      }
    }
    verificar()
  }, [])

  // Auto-generar slug desde el nombre del grupo (hasta que el usuario lo edite a mano)
  function onNombreGrupo(v: string) {
    setNombreGrupo(v)
    if (!slugTocado) {
      setSlug(
        v.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      )
    }
  }

  async function darDeAlta() {
    setError(null)
    setResultado(null)

    if (!nombreGrupo.trim() || !slug.trim() || !adminEmail.trim() || !adminNombre.trim()) {
      setError("Completá nombre del grupo, slug, email y nombre del admin.")
      return
    }

    setEnviando(true)
    const { data, error } = await supabase.rpc("onboarding_cliente", {
      p_nombre_grupo: nombreGrupo,
      p_slug: slug,
      p_cuit: cuit,
      p_plan: plan,
      p_nombre_sociedad: nombreSociedad,
      p_admin_email: adminEmail,
      p_admin_nombre: adminNombre,
      p_nombre_display: nombreDisplay || null,
    })
    setEnviando(false)

    if (error) {
      setError(error.message)
      return
    }

    setResultado(data as Resultado)
    // Limpiar el formulario
    setNombreGrupo(""); setSlug(""); setSlugTocado(false); setCuit("")
    setPlan(""); setNombreSociedad(""); setAdminEmail(""); setAdminNombre(""); setNombreDisplay("")
    cargarClientes()
  }

  const linkActivacion = resultado
    ? `${BASE_URL}/activar?token=${resultado.token}`
    : ""

  async function copiarLink() {
    await navigator.clipboard.writeText(linkActivacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (autorizado === null) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Verificando acceso…
      </div>
    )
  }

  if (autorizado === false) {
    return (
      <div className="max-w-md mx-auto mt-20 card text-center">
        <ShieldAlert className="mx-auto text-danger mb-3" size={32} />
        <h1 className="text-lg font-semibold text-ink-900 mb-1">Acceso restringido</h1>
        <p className="text-sm text-ink-500">
          Esta sección es solo para administradores de la plataforma.
        </p>
        <button onClick={() => router.push("/")} className="btn btn-secondary mt-4">
          Volver al inicio
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-light">
          <Building2 className="text-accent" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Alta de cliente nuevo</h1>
          <p className="text-sm text-ink-500">Crea el grupo, la sociedad inicial y la invitación del primer administrador.</p>
        </div>
      </div>

      {/* Resultado exitoso */}
      {resultado && (
        <div className="card border-ok bg-ok-light/40 space-y-3">
          <div className="flex items-center gap-2 text-ok font-semibold">
            <Check size={18} /> Cliente creado correctamente
          </div>
          <p className="text-sm text-ink-600">
            Enviale este link de activación a <span className="font-medium">{resultado.admin_email}</span>. Vence en 48 horas.
          </p>
          <div className="flex items-center gap-2 bg-white border border-ink-200 rounded-md p-2">
            <LinkIcon size={14} className="text-ink-400 shrink-0" />
            <span className="font-mono text-xs text-ink-700 truncate flex-1">{linkActivacion}</span>
            <button onClick={copiarLink} className="btn btn-secondary p-1.5 shrink-0">
              {copiado ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={() => setResultado(null)} className="text-xs text-accent underline">
            Dar de alta otro cliente
          </button>
        </div>
      )}

      {/* Formulario */}
      {!resultado && (
        <div className="card space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">Datos del cliente</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Nombre del grupo *</label>
                <input className="input" value={nombreGrupo}
                  onChange={(e) => onNombreGrupo(e.target.value)}
                  placeholder="Ej: Distribuidora del Sur S.A." />
              </div>
              <div>
                <label className="label">Slug (identificador URL) *</label>
                <input className="input font-mono" value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugTocado(true) }}
                  placeholder="distribuidora-del-sur" />
              </div>
              <div>
                <label className="label">CUIT</label>
                <input className="input" value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  placeholder="30-12345678-9" />
              </div>
              <div>
                <label className="label">Plan contratado</label>
                <input className="input" value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  placeholder="Ej: Básico, Pro…" />
              </div>
              <div>
                <label className="label">Nombre a mostrar (opcional)</label>
                <input className="input" value={nombreDisplay}
                  onChange={(e) => setNombreDisplay(e.target.value)}
                  placeholder="Si difiere del nombre del grupo" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Nombre de la sociedad inicial</label>
                <input className="input" value={nombreSociedad}
                  onChange={(e) => setNombreSociedad(e.target.value)}
                  placeholder="Si se deja vacío, usa el nombre del grupo" />
              </div>
            </div>
          </div>

          <div className="border-t border-ink-100 pt-4">
            <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2 flex items-center gap-1.5">
              <UserPlus size={12} /> Primer administrador
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Nombre y apellido *</label>
                <input className="input" value={adminNombre}
                  onChange={(e) => setAdminNombre(e.target.value)}
                  placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="juan@cliente.com" />
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger-light rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button onClick={darDeAlta} disabled={enviando}
            className="btn btn-primary w-full justify-center">
            {enviando ? <><Loader2 className="animate-spin" size={16} /> Creando…</> : "Dar de alta cliente"}
          </button>
        </div>
      )}

      {/* Lista de clientes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-ink-500" />
            <h2 className="text-sm font-semibold text-ink-900">
              Clientes ({clientes.length})
            </h2>
          </div>
          <button onClick={cargarClientes} disabled={cargandoClientes}
            className="btn btn-secondary p-1.5" title="Actualizar">
            <RefreshCw size={14} className={cargandoClientes ? "animate-spin" : ""} />
          </button>
        </div>

        {cargandoClientes && clientes.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-ink-400 text-sm">
            <Loader2 className="animate-spin mr-2" size={16} /> Cargando…
          </div>
        ) : clientes.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-8">
            Todavía no hay clientes dados de alta.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-ink-500 border-b border-ink-100">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Alta</th>
                  <th className="py-2 pr-3 font-medium">Admin</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => {
                  const vencida = c.invitacion_expira
                    ? new Date(c.invitacion_expira) < new Date()
                    : false
                  const ocupado = accionEnCurso === c.grupo_id
                  return (
                    <Fragment key={c.grupo_id}>
                    <tr
                      className={`border-b border-ink-50 last:border-0 ${!c.activo ? "opacity-50" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-ink-900 flex items-center gap-2">
                          {c.nombre}
                          {!c.activo && (
                            <span className="text-2xs font-medium text-danger bg-danger-light rounded px-1.5 py-0.5">
                              De baja
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-ink-400 font-mono">{c.slug}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">{c.plan ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-ink-600 whitespace-nowrap">
                        {formatFecha(c.fecha_alta)}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-600">
                        {c.admin_email ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {c.invitacion_usada ? (
                          <span className="inline-flex items-center gap-1 text-2xs font-medium text-ok bg-ok-light/50 rounded px-2 py-0.5">
                            <Check size={11} /> Activado
                          </span>
                        ) : vencida ? (
                          <span className="inline-flex items-center text-2xs font-medium text-danger bg-danger-light rounded px-2 py-0.5">
                            Invitación vencida
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-2xs font-medium text-ink-500 bg-ink-100 rounded px-2 py-0.5">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => abrirAdmins(c.grupo_id)}
                            className="btn btn-secondary p-1.5"
                            title="Gestionar administradores">
                            <UserCog size={14} />
                            <ChevronDown size={12}
                              className={`transition-transform ${expandido === c.grupo_id ? "rotate-180" : ""}`} />
                          </button>
                          {c.activo ? (
                            <button
                              onClick={() => toggleGrupo(c)}
                              disabled={ocupado}
                              className="btn btn-secondary p-1.5 text-danger"
                              title="Dar de baja">
                              {ocupado ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleGrupo(c)}
                              disabled={ocupado}
                              className="btn btn-secondary p-1.5 text-ok"
                              title="Reactivar">
                              {ocupado ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Panel expandible: administradores del grupo */}
                    {expandido === c.grupo_id && (
                      <tr>
                        <td colSpan={6} className="bg-ink-50/50 px-3 py-3">
                          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2 flex items-center gap-1.5">
                            <UserCog size={12} /> Administradores de {c.nombre}
                          </div>
                          {cargandoAdmins ? (
                            <div className="flex items-center text-ink-400 text-xs py-2">
                              <Loader2 className="animate-spin mr-2" size={14} /> Cargando…
                            </div>
                          ) : admins.length === 0 ? (
                            <p className="text-xs text-ink-400 py-2">Este grupo no tiene administradores.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {admins.map((u) => {
                                const ocupadoU = accionEnCurso === u.id
                                return (
                                  <div key={u.id}
                                    className="flex items-center justify-between bg-white border border-ink-100 rounded-md px-3 py-2">
                                    <div className={!u.activo ? "opacity-50" : ""}>
                                      <div className="text-sm text-ink-900 font-medium flex items-center gap-2">
                                        {u.nombre}
                                        {!u.activo && (
                                          <span className="text-2xs font-medium text-danger bg-danger-light rounded px-1.5 py-0.5">
                                            Inhabilitado
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-2xs text-ink-400">{u.email}</div>
                                    </div>
                                    {u.activo ? (
                                      <button
                                        onClick={() => toggleAdmin(u, c.grupo_id)}
                                        disabled={ocupadoU}
                                        className="btn btn-secondary p-1.5 text-danger"
                                        title="Inhabilitar">
                                        {ocupadoU ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => toggleAdmin(u, c.grupo_id)}
                                        disabled={ocupadoU}
                                        className="btn btn-secondary p-1.5 text-ok"
                                        title="Rehabilitar">
                                        {ocupadoU ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
