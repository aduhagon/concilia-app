"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase-client"
import { Building2, Copy, Check, ShieldAlert, Loader2, UserPlus, Link as LinkIcon } from "lucide-react"

const BASE_URL = "https://concilia-app-seven.vercel.app"

type Resultado = {
  grupo_id: string
  slug: string
  token: string
  admin_email: string
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

  // Verificar que el usuario es super-admin
  useEffect(() => {
    async function verificar() {
      const { data, error } = await supabase.rpc("es_super_admin")
      if (error || !data) {
        setAutorizado(false)
      } else {
        setAutorizado(true)
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
    </div>
  )
}
