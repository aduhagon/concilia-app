"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase-client"
import { Upload, Save, CheckCircle2, AlertCircle, Palette, Type, Image } from "lucide-react"

type Config = {
  id: string
  grupo_id: string
  nombre_display: string
  tagline: string
  color_primario: string
  color_acento: string
  color_fondo: string
  tipografia: string
  logo_url: string | null
  bg_login_url: string | null
}

const PALETAS = [
  { label: "Corporativo", primary: "#1E3A5F", accent: "#2B5CE6", bg: "#F2F0EB" },
  { label: "Verde", primary: "#1A3A2A", accent: "#1A7A4A", bg: "#F0F7F4" },
  { label: "Naranja", primary: "#3A1A0A", accent: "#E05C2B", bg: "#FFF7F4" },
  { label: "Violeta", primary: "#1A1A3A", accent: "#6B3AE0", bg: "#F7F4FF" },
  { label: "Rojo", primary: "#1A1A1A", accent: "#E01A4F", bg: "#FFF4F7" },
  { label: "Cian", primary: "#1A2A3A", accent: "#0A7A9A", bg: "#F0F9FF" },
]

const TIPOGRAFIAS = [
  { value: "Sora", label: "Sora", desc: "Moderno" },
  { value: "Inter", label: "Inter", desc: "Neutro" },
  { value: "Georgia", label: "Georgia", desc: "Clásico" },
  { value: "DM Sans", label: "DM Sans", desc: "Limpio" },
]

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [form, setForm] = useState<Partial<Config>>({})
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [subiendoBg, setSubiendoBg] = useState(false)
  const [grupoId, setGrupoId] = useState<string | null>(null)

  const logoRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function cargar() {
      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()

      if (!grupo) return
      setGrupoId(grupo.id)

      const { data } = await supabase
        .from("grupos_config")
        .select("*")
        .eq("grupo_id", grupo.id)
        .single()

      if (data) {
        setConfig(data)
        setForm(data)
      }
    }
    cargar()
  }, [])

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function aplicarPaleta(p: typeof PALETAS[0]) {
    setForm(f => ({
      ...f,
      color_primario: p.primary,
      color_acento: p.accent,
      color_fondo: p.bg,
    }))
  }

  async function subirArchivo(
    file: File,
    tipo: "logo" | "bg",
    setSubiendo: (v: boolean) => void
  ) {
    if (!grupoId) return
    setSubiendo(true)
    setResultado(null)

    const ext = file.name.split(".").pop()
    const path = `${grupoId}/${tipo}.${ext}`

    const { error: upError } = await supabase.storage
      .from("assets")
      .upload(path, file, { upsert: true })

    if (upError) {
      setResultado({ tipo: "error", msg: "Error al subir: " + upError.message })
      setSubiendo(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from("assets")
      .getPublicUrl(path)

    const url = urlData.publicUrl
    const campo = tipo === "logo" ? "logo_url" : "bg_login_url"
    setForm(f => ({ ...f, [campo]: url }))
    setSubiendo(false)
  }

  async function guardar() {
    if (!config || !grupoId) return
    setGuardando(true)
    setResultado(null)

    const { error } = await supabase
      .from("grupos_config")
      .update({
        nombre_display: form.nombre_display,
        tagline: form.tagline,
        color_primario: form.color_primario,
        color_acento: form.color_acento,
        color_fondo: form.color_fondo,
        tipografia: form.tipografia,
        logo_url: form.logo_url,
        bg_login_url: form.bg_login_url,
        updated_at: new Date().toISOString(),
      })
      .eq("grupo_id", grupoId)

    if (error) {
      setResultado({ tipo: "error", msg: "Error al guardar: " + error.message })
    } else {
      setResultado({ tipo: "ok", msg: "Configuración guardada. Los cambios se aplican al recargar la página." })
      // Recargar para aplicar cambios
      setTimeout(() => window.location.reload(), 1500)
    }
    setGuardando(false)
  }

  if (!form.color_primario) {
    return <div className="text-sm text-ink-400 text-center py-16">Cargando…</div>
  }

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Configuración</div>
          <h1 className="h-page">Identidad visual</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Personalizá la apariencia de la plataforma con la identidad de tu empresa.
          </p>
        </div>
        <button
          onClick={guardar}
          disabled={guardando}
          className="btn btn-primary disabled:opacity-40"
        >
          <Save size={14} />
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className={`flex items-center gap-3 px-4 py-3 text-sm border ${
          resultado.tipo === "ok"
            ? "bg-ok-light border-ok/20 text-ok"
            : "bg-danger-light border-danger/20 text-danger"
        }`}>
          {resultado.tipo === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {resultado.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* PANEL IZQUIERDO — Configuración */}
        <div className="space-y-6">

          {/* Empresa */}
          <div className="card space-y-4">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold">
              Empresa
            </div>
            <div>
              <label className="label">Nombre de la empresa</label>
              <input
                value={form.nombre_display ?? ""}
                onChange={e => setField("nombre_display", e.target.value)}
                className="input w-full"
                placeholder="Grupo MSU"
              />
            </div>
            <div>
              <label className="label">Tagline</label>
              <input
                value={form.tagline ?? ""}
                onChange={e => setField("tagline", e.target.value)}
                className="input w-full"
                placeholder="Conciliación de cuentas corrientes"
              />
            </div>
          </div>

          {/* Logos */}
          <div className="card space-y-4">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-2">
              <Image size={13} /> Logos
            </div>

            {/* Logo principal */}
            <div>
              <label className="label">Logo principal</label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="w-12 h-12 object-contain border border-ink-200 rounded p-1"
                  />
                ) : (
                  <div className="w-12 h-12 bg-ink-100 border border-ink-200 rounded flex items-center justify-center text-ink-400 text-xs">
                    Sin logo
                  </div>
                )}
                <div>
                  <button
                    onClick={() => logoRef.current?.click()}
                    disabled={subiendoLogo}
                    className="btn btn-secondary text-xs"
                  >
                    <Upload size={12} />
                    {subiendoLogo ? "Subiendo…" : "Subir logo"}
                  </button>
                  <div className="text-2xs text-ink-400 mt-1">PNG, SVG · máx 2MB · fondo transparente ideal</div>
                </div>
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && subirArchivo(e.target.files[0], "logo", setSubiendoLogo)}
              />
            </div>

            {/* Fondo login */}
            <div>
              <label className="label">Imagen de fondo — pantalla de login</label>
              <div className="flex items-center gap-3">
                {form.bg_login_url ? (
                  <img
                    src={form.bg_login_url}
                    alt="Fondo"
                    className="w-16 h-10 object-cover border border-ink-200 rounded"
                  />
                ) : (
                  <div className="w-16 h-10 bg-ink-100 border border-ink-200 rounded flex items-center justify-center text-ink-400 text-2xs">
                    Sin imagen
                  </div>
                )}
                <div>
                  <button
                    onClick={() => bgRef.current?.click()}
                    disabled={subiendoBg}
                    className="btn btn-secondary text-xs"
                  >
                    <Upload size={12} />
                    {subiendoBg ? "Subiendo…" : "Subir imagen"}
                  </button>
                  <div className="text-2xs text-ink-400 mt-1">JPG, PNG · máx 5MB · recomendado 1920×1080</div>
                </div>
              </div>
              <input
                ref={bgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && subirArchivo(e.target.files[0], "bg", setSubiendoBg)}
              />
            </div>
          </div>

          {/* Colores */}
          <div className="card space-y-4">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-2">
              <Palette size={13} /> Colores
            </div>

            {/* Paletas predefinidas */}
            <div>
              <label className="label">Paletas predefinidas</label>
              <div className="grid grid-cols-3 gap-2">
                {PALETAS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => aplicarPaleta(p)}
                    className={`border rounded p-2 text-left transition-all hover:border-accent ${
                      form.color_primario === p.primary
                        ? "border-accent bg-accent-light"
                        : "border-ink-200"
                    }`}
                  >
                    <div className="flex gap-1 mb-1.5">
                      <div className="w-4 h-4 rounded-full" style={{ background: p.primary }} />
                      <div className="w-4 h-4 rounded-full" style={{ background: p.accent }} />
                      <div className="w-4 h-4 rounded-full border border-ink-200" style={{ background: p.bg }} />
                    </div>
                    <div className="text-2xs font-semibold">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Colores individuales */}
            <div className="space-y-3">
              <ColorField
                label="Color primario"
                desc="Navbar, headers"
                value={form.color_primario ?? "#1E3A5F"}
                onChange={v => setField("color_primario", v)}
              />
              <ColorField
                label="Color de acento"
                desc="Botones, links, indicadores"
                value={form.color_acento ?? "#2B5CE6"}
                onChange={v => setField("color_acento", v)}
              />
              <ColorField
                label="Color de fondo"
                desc="Background general"
                value={form.color_fondo ?? "#F2F0EB"}
                onChange={v => setField("color_fondo", v)}
              />
            </div>
          </div>

          {/* Tipografía */}
          <div className="card space-y-3">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-2">
              <Type size={13} /> Tipografía
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TIPOGRAFIAS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setField("tipografia", t.value)}
                  className={`border rounded p-3 text-left transition-all ${
                    form.tipografia === t.value
                      ? "border-accent bg-accent-light"
                      : "border-ink-200 hover:border-accent"
                  }`}
                >
                  <div className="text-lg mb-1" style={{ fontFamily: t.value }}>Aa</div>
                  <div className="text-xs font-semibold">{t.label}</div>
                  <div className="text-2xs text-ink-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* PANEL DERECHO — Preview */}
        <div className="space-y-4">
          <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold">
            Vista previa
          </div>

          {/* Preview login */}
          <div className="border border-ink-200 rounded overflow-hidden shadow-sm">
            <div className="text-2xs text-ink-400 px-3 py-1.5 bg-ink-50 border-b border-ink-200">
              Pantalla de login
            </div>
            <div
              className="p-8 flex flex-col items-center justify-center min-h-32"
              style={{
                background: form.bg_login_url
                  ? `url(${form.bg_login_url}) center/cover`
                  : `linear-gradient(135deg, ${form.color_primario}, ${form.color_acento})`,
              }}
            >
              <div className="text-center">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="w-10 h-10 mx-auto mb-2 object-contain" />
                ) : (
                  <div
                    className="w-10 h-10 mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg"
                    style={{ background: "rgba(255,255,255,0.2)" }}
                  >
                    {(form.nombre_display ?? "C").charAt(0)}
                  </div>
                )}
                <div
                  className="font-bold text-white text-sm"
                  style={{ fontFamily: form.tipografia }}
                >
                  {form.nombre_display ?? "Mi Empresa"}
                </div>
                <div className="text-white/70 text-xs mt-0.5" style={{ fontFamily: form.tipografia }}>
                  {form.tagline ?? ""}
                </div>
              </div>
            </div>
            <div className="bg-white p-4 space-y-2">
              <div className="h-7 bg-ink-100 rounded text-xs flex items-center px-2 text-ink-400">
                Seleccioná tu empresa…
              </div>
              <div className="h-7 bg-ink-100 rounded" />
              <div
                className="h-8 rounded flex items-center justify-center text-white text-xs font-semibold"
                style={{ background: form.color_acento }}
              >
                Ingresar
              </div>
            </div>
          </div>

          {/* Preview navbar */}
          <div className="border border-ink-200 rounded overflow-hidden shadow-sm">
            <div className="text-2xs text-ink-400 px-3 py-1.5 bg-ink-50 border-b border-ink-200">
              Barra de navegación
            </div>
            <div
              className="h-12 flex items-center px-4 gap-4"
              style={{ background: form.color_primario, fontFamily: form.tipografia }}
            >
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
              ) : (
                <div
                  className="w-6 h-6 flex items-center justify-center text-white font-bold text-xs"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                >
                  {(form.nombre_display ?? "C").charAt(0)}
                </div>
              )}
              <span className="text-white font-semibold text-sm">
                {form.nombre_display ?? "Mi Empresa"}
              </span>
              <div className="flex gap-2 ml-2">
                {["Inicio", "Plantillas", "Tablero"].map(item => (
                  <span key={item} className="text-white/60 text-xs px-2 py-1">{item}</span>
                ))}
              </div>
              <div className="ml-auto">
                <div
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded"
                  style={{ background: form.color_acento }}
                >
                  + Nueva conciliación
                </div>
              </div>
            </div>
          </div>

          {/* Preview fondo de pantalla */}
          <div className="border border-ink-200 rounded overflow-hidden shadow-sm">
            <div className="text-2xs text-ink-400 px-3 py-1.5 bg-ink-50 border-b border-ink-200">
              Fondo de pantallas internas
            </div>
            <div
              className="h-16 p-3"
              style={{ background: form.color_fondo }}
            >
              <div className="bg-white border border-ink-200 rounded h-full px-3 flex items-center">
                <div className="text-xs text-ink-500" style={{ fontFamily: form.tipografia }}>
                  Contenido de la aplicación
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function ColorField({ label, desc, value, onChange }: {
  label: string; desc: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded border-2 border-ink-200 cursor-pointer flex-shrink-0 relative overflow-hidden"
        style={{ background: value }}
      >
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
      <div className="flex-1">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-2xs text-ink-400">{desc}</div>
      </div>
      <input
        type="text"
        value={value}
        onChange={e => /^#[0-9A-Fa-f]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
        className="input w-24 font-mono text-xs text-center"
        maxLength={7}
      />
    </div>
  )
}
