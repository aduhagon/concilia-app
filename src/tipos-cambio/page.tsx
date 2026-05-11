"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-client"
import { Plus, CheckCircle2, AlertCircle, Lock } from "lucide-react"

type TipoCambio = {
  id: string
  periodo: string
  tc_usd_ars: number
  definido_por: string | null
  created_at: string
  nombre_usuario?: string
}

function formatPeriodo(iso: string): string {
  const d = new Date(iso + "-01")
  return d.toLocaleString("es-AR", { month: "long", year: "numeric" })
}

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`
}

function periodoLabel(yyyy_mm: string): string {
  const [y, m] = yyyy_mm.split("-")
  const d = new Date(parseInt(y), parseInt(m) - 1, 1)
  return d.toLocaleString("es-AR", { month: "long", year: "numeric" })
}

export default function TiposCambioPage() {
  const [tipos, setTipos] = useState<TipoCambio[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; msg: string } | null>(null)
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [grupoId, setGrupoId] = useState<string | null>(null)

  // Form
  const [periodo, setPeriodo] = useState(periodoActual())
  const [tc, setTc] = useState("")

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUsuarioId(user.id)

      const { data: grupo } = await supabase
        .from("grupos_trabajo")
        .select("id")
        .limit(1)
        .single()
      if (grupo) setGrupoId(grupo.id)

      const { data } = await supabase
        .from("tipos_cambio")
        .select("id, periodo, tc_usd_ars, definido_por, created_at")
        .order("periodo", { ascending: false })
        .limit(24)

      // Enriquecer con nombre de usuario
      const enriquecidos: TipoCambio[] = []
      for (const t of data ?? []) {
        let nombre = "—"
        if (t.definido_por) {
          const { data: u } = await supabase
            .from("usuarios")
            .select("nombre")
            .eq("id", t.definido_por)
            .single()
          if (u) nombre = u.nombre
        }
        enriquecidos.push({ ...t, nombre_usuario: nombre })
      }

      setTipos(enriquecidos)
      setLoading(false)
    }
    cargar()
  }, [])

  async function guardar() {
    if (!tc || !periodo || !grupoId) return
    const tcNum = parseFloat(tc.replace(",", "."))
    if (isNaN(tcNum) || tcNum <= 0) {
      setResultado({ tipo: "error", msg: "Ingresá un tipo de cambio válido mayor a 0" })
      return
    }

    setGuardando(true)
    setResultado(null)

    const periodoDate = `${periodo}-01`

    // Verificar si ya existe para ese período
    const { data: existente } = await supabase
      .from("tipos_cambio")
      .select("id")
      .eq("grupo_id", grupoId)
      .eq("periodo", periodoDate)
      .single()

    if (existente) {
      // Actualizar
      const { error } = await supabase
        .from("tipos_cambio")
        .update({
          tc_usd_ars: tcNum,
          definido_por: usuarioId,
          created_at: new Date().toISOString(),
        })
        .eq("id", existente.id)

      if (error) {
        setResultado({ tipo: "error", msg: "Error: " + error.message })
      } else {
        setResultado({ tipo: "ok", msg: `TC de ${periodoLabel(periodo)} actualizado a $${tcNum.toLocaleString("es-AR")}` })
        setMostrarForm(false)
        setTc("")
        cargarTipos()
      }
    } else {
      // Insertar
      const { error } = await supabase
        .from("tipos_cambio")
        .insert({
          grupo_id: grupoId,
          periodo: periodoDate,
          tc_usd_ars: tcNum,
          definido_por: usuarioId,
        })

      if (error) {
        setResultado({ tipo: "error", msg: "Error: " + error.message })
      } else {
        setResultado({ tipo: "ok", msg: `TC de ${periodoLabel(periodo)} definido: 1 USD = $${tcNum.toLocaleString("es-AR")}` })
        setMostrarForm(false)
        setTc("")
        cargarTipos()
      }
    }
    setGuardando(false)
  }

  async function cargarTipos() {
    const { data } = await supabase
      .from("tipos_cambio")
      .select("id, periodo, tc_usd_ars, definido_por, created_at")
      .order("periodo", { ascending: false })
      .limit(24)

    const enriquecidos: TipoCambio[] = []
    for (const t of data ?? []) {
      let nombre = "—"
      if (t.definido_por) {
        const { data: u } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("id", t.definido_por)
          .single()
        if (u) nombre = u.nombre
      }
      enriquecidos.push({ ...t, nombre_usuario: nombre })
    }
    setTipos(enriquecidos)
  }

  const tcActual = tipos.find(t => t.periodo.startsWith(periodoActual()))

  return (
    <div className="px-6 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Configuración</div>
          <h1 className="h-page">Tipos de cambio</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            El tipo de cambio USD/ARS se define manualmente por período. Queda registrado en cada conciliación para trazabilidad del cierre.
          </p>
        </div>
        <button onClick={() => { setMostrarForm(v => !v); setResultado(null) }} className="btn btn-primary">
          <Plus size={14} /> Definir TC
        </button>
      </div>

      {/* TC del mes actual */}
      <div className={`flex items-center gap-4 px-5 py-4 border rounded-lg ${
        tcActual
          ? "bg-ok-light border-ok/20"
          : "bg-warn-light border-warn/20"
      }`}>
        <div className="text-2xl font-bold font-mono">
          {tcActual
            ? `$${tcActual.tc_usd_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
            : "Sin definir"
          }
        </div>
        <div>
          <div className={`text-sm font-semibold ${tcActual ? "text-ok" : "text-warn"}`}>
            {tcActual
              ? `TC de ${formatPeriodo(tcActual.periodo)} · 1 USD`
              : `⚠ No hay TC definido para ${periodoLabel(periodoActual())}`
            }
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {tcActual
              ? `Definido por ${tcActual.nombre_usuario} el ${new Date(tcActual.created_at).toLocaleDateString("es-AR")}`
              : "Las conciliaciones en USD de este mes no tendrán TC de referencia"
            }
          </div>
        </div>
        {!tcActual && (
          <button
            onClick={() => setMostrarForm(true)}
            className="ml-auto btn btn-primary text-xs"
          >
            Definir ahora
          </button>
        )}
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="card border-accent border-2 space-y-4">
          <div className="text-sm font-semibold">Definir tipo de cambio</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Período</label>
              <input
                type="month"
                value={periodo}
                onChange={e => setPeriodo(e.target.value)}
                className="input w-full"
              />
              <div className="text-2xs text-ink-400 mt-1">
                {periodoLabel(periodo)}
              </div>
            </div>
            <div>
              <label className="label">1 USD = $ (ARS)</label>
              <input
                type="text"
                value={tc}
                onChange={e => setTc(e.target.value)}
                placeholder="Ej: 1127.50"
                className="input w-full font-mono text-lg"
                autoFocus
              />
              <div className="text-2xs text-ink-400 mt-1">
                Usá punto o coma como separador decimal
              </div>
            </div>
          </div>

          {resultado && (
            <div className={`flex items-center gap-2 px-4 py-3 text-sm border ${
              resultado.tipo === "ok"
                ? "bg-ok-light border-ok/20 text-ok"
                : "bg-danger-light border-danger/20 text-danger"
            }`}>
              {resultado.tipo === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {resultado.msg}
            </div>
          )}

          <div className="flex items-center gap-2 justify-end pt-2 border-t border-ink-200">
            <div className="flex items-center gap-1.5 text-2xs text-ink-400 mr-auto">
              <Lock size={11} />
              El TC queda registrado con tu usuario y fecha
            </div>
            <button onClick={() => setMostrarForm(false)} className="btn btn-secondary">Cancelar</button>
            <button
              onClick={guardar}
              disabled={guardando || !tc.trim()}
              className="btn btn-primary disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar TC"}
            </button>
          </div>
        </div>
      )}

      {/* Resultado fuera del form */}
      {resultado && !mostrarForm && (
        <div className={`flex items-center gap-2 px-4 py-3 text-sm border ${
          resultado.tipo === "ok"
            ? "bg-ok-light border-ok/20 text-ok"
            : "bg-danger-light border-danger/20 text-danger"
        }`}>
          {resultado.tipo === "ok" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {resultado.msg}
        </div>
      )}

      {/* Historial */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando…</div>
      ) : tipos.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-sm font-semibold text-ink-500">Sin tipos de cambio definidos</div>
          <p className="text-xs text-ink-400 mt-1">Definí el TC del mes actual para empezar.</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="px-4 py-2.5 bg-ink-50 border-b border-ink-200">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold">
              Historial de tipos de cambio
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">Período</th>
                <th className="text-right px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold">1 USD =</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Definido por</th>
                <th className="text-left px-4 py-2.5 text-2xs uppercase tracking-wider text-ink-500 font-semibold hidden md:table-cell">Fecha</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {tipos.map(t => {
                const esMesActual = t.periodo.startsWith(periodoActual())
                return (
                  <tr key={t.id} className={`hover:bg-ink-50 transition-colors ${esMesActual ? "bg-ok-light/30" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold capitalize">
                          {formatPeriodo(t.periodo)}
                        </span>
                        {esMesActual && (
                          <span className="text-2xs bg-ok-light text-ok px-1.5 py-0.5 rounded font-semibold">
                            Mes actual
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold font-mono">
                        ${t.tc_usd_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-ink-500">{t.nombre_usuario}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-ink-500">
                        {new Date(t.created_at).toLocaleDateString("es-AR")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setPeriodo(t.periodo.substring(0, 7))
                          setTc(t.tc_usd_ars.toString())
                          setMostrarForm(true)
                          setResultado(null)
                        }}
                        className="text-2xs text-ink-400 hover:text-accent underline"
                      >
                        Editar
                      </button>
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
