"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import type { AjusteManual, MovimientoResultado, StatusPendiente } from "@/types"
import { STATUS_LABELS } from "@/types"
import { ArrowLeft, CheckCircle2, AlertCircle, FileSpreadsheet, Calendar, User, Lock, Unlock, ChevronDown, History, Printer } from "lucide-react"

type Conciliacion = {
  id: string
  periodo_label: string | null
  saldo_inicial_compania_ars: number
  saldo_inicial_compania_usd: number
  saldo_inicial_contraparte_ars: number
  saldo_inicial_contraparte_usd: number
  saldo_final_compania_ars: number | null
  saldo_final_compania_usd: number | null
  saldo_final_contraparte_ars: number | null
  saldo_final_contraparte_usd: number | null
  tc_cierre: number | null
  diferencia_final_ars: number | null
  ajustes_manuales: AjusteManual[]
  clasificacion_pendientes: Record<string, StatusPendiente>
  firmado_por: string | null
  firmado_fecha: string | null
  estado: string
  cerrado_por: string | null
  cerrado_fecha: string | null
  aprobado_por: string | null
  aprobado_fecha: string | null
  reabierto_por: string | null
  reabierto_fecha: string | null
  observacion_cierre: string | null
  observacion_aprobacion: string | null
  created_at: string
  contrapartes: { nombre: string } | null
}

type HistorialItem = {
  id: string
  usuario_id: string | null
  estado_anterior: string | null
  estado_nuevo: string
  accion: string
  observacion: string | null
  created_at: string
  usuarios: { nombre: string } | null
}

type MovGuardado = {
  id: string
  origen: "compania" | "contraparte"
  fecha: string | null
  tipo_original: string
  comprobante_raw: string
  importe_ars: number
  importe_usd: number
  moneda: string | null
  estado_conciliacion: string
}

export default function DetalleConciliacionPage() {
  const params = useParams<{ id: string }>()
  const [c, setC] = useState<Conciliacion | null>(null)
  const [pendientes, setPendientes] = useState<MovGuardado[]>([])
  const [loading, setLoading] = useState(true)
  const [historial, setHistorial] = useState<HistorialItem[]>([])
  const [usuarioActual, setUsuarioActual] = useState<{ id: string; rol: string; nombre: string } | null>(null)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false)
  const [mostrarModalAprobacion, setMostrarModalAprobacion] = useState(false)
  const [mostrarModalReapertura, setMostrarModalReapertura] = useState(false)
  const [observacion, setObservacion] = useState("")
  const [accionando, setAccionando] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data: cab } = await supabase
        .from("conciliaciones")
        .select("*, contrapartes(nombre)")
        .eq("id", params.id)
        .single()

      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("conciliacion_id", params.id)
        .order("fecha")

      // Cargar historial de estados
      const { data: hist } = await supabase
        .from("conciliacion_historial")
        .select("id, usuario_id, estado_anterior, estado_nuevo, accion, observacion, created_at, usuarios(nombre)")
        .eq("conciliacion_id", params.id)
        .order("created_at", { ascending: false })

      // Usuario actual
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: u } = await supabase
          .from("usuarios")
          .select("id, rol, nombre")
          .eq("id", user.id)
          .single()
        if (u) setUsuarioActual(u)
      }

      setC(cab as unknown as Conciliacion)
      setPendientes((movs ?? []) as unknown as MovGuardado[])
      setHistorial((hist ?? []) as unknown as HistorialItem[])
      setLoading(false)
    }
    cargar()
  }, [params.id])

  async function ejecutarAccion(accion: "cerrado_operativo" | "aprobado" | "reabierto") {
    if (!c || !usuarioActual) return
    setAccionando(true)

    const estadoAnterior = c.estado
    const ahora = new Date().toISOString()

    const updates: Record<string, unknown> = { estado: accion }
    if (accion === "cerrado_operativo") {
      updates.cerrado_por = usuarioActual.id
      updates.cerrado_fecha = ahora
      updates.observacion_cierre = observacion || null
    } else if (accion === "aprobado") {
      updates.aprobado_por = usuarioActual.id
      updates.aprobado_fecha = ahora
      updates.observacion_aprobacion = observacion || null
    } else if (accion === "reabierto") {
      updates.reabierto_por = usuarioActual.id
      updates.reabierto_fecha = ahora
    }

    await supabase.from("conciliaciones").update(updates).eq("id", c.id)

    // Registrar en historial
    await supabase.from("conciliacion_historial").insert({
      conciliacion_id: c.id,
      usuario_id: usuarioActual.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: accion,
      accion,
      observacion: observacion || null,
    })

    // Recargar
    const { data: cab } = await supabase
      .from("conciliaciones")
      .select("*, contrapartes(nombre)")
      .eq("id", c.id)
      .single()
    const { data: hist } = await supabase
      .from("conciliacion_historial")
      .select("id, usuario_id, estado_anterior, estado_nuevo, accion, observacion, created_at, usuarios(nombre)")
      .eq("conciliacion_id", c.id)
      .order("created_at", { ascending: false })

    setC(cab as unknown as Conciliacion)
    setHistorial((hist ?? []) as unknown as HistorialItem[])
    setObservacion("")
    setMostrarModalCierre(false)
    setMostrarModalAprobacion(false)
    setMostrarModalReapertura(false)
    setAccionando(false)
  }

  if (loading) return <div className="text-sm text-ink-400 text-center py-8">Cargando...</div>
  if (!c) return <div className="text-sm text-error text-center py-8">No se encontró la conciliación</div>

  // Agrupar pendientes por categoría (status)
  const grupos = agruparPorStatus(pendientes)
  const dif = c.diferencia_final_ars ?? 0
  const ok = Math.abs(dif) < 1


  async function generarPDF() {
    if (!c) return
    setGenerandoPDF(true)
    try {
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

      const W = 210
      const margin = 18
      let y = 20

      // Colores
      const azul: [number, number, number] = [30, 58, 95]
      const gris: [number, number, number] = [100, 101, 96]
      const verdeOk: [number, number, number] = [26, 122, 74]
      const naranja: [number, number, number] = [212, 88, 10]

      function lineaH(yy: number, color: [number,number,number] = azul, grosor = 0.3) {
        doc.setDrawColor(...color)
        doc.setLineWidth(grosor)
        doc.line(margin, yy, W - margin, yy)
      }

      function texto(txt: string, x: number, yy: number, size = 9, bold = false, color: [number,number,number] = [30,30,30]) {
        doc.setFontSize(size)
        doc.setFont("helvetica", bold ? "bold" : "normal")
        doc.setTextColor(...color)
        doc.text(txt, x, yy)
      }

      function etiqueta(label: string, valor: string, x: number, yy: number) {
        texto(label.toUpperCase(), x, yy, 7, false, [150,150,140])
        texto(valor || "—", x, yy + 4.5, 9, false)
      }

      // ── ENCABEZADO ──
      doc.setFillColor(...azul)
      doc.rect(0, 0, W, 28, "F")
      texto("CONCILIA", margin, 11, 14, true, [255,255,255])
      texto("Conciliación de cuentas corrientes", margin, 17, 8, false, [160,180,210])
      texto(`N° ${c.id.substring(0,8).toUpperCase()}`, W - margin, 11, 8, false, [200,210,230])
      doc.setFontSize(8)
      doc.setTextColor(200,210,230)
      doc.text(new Date(c.created_at).toLocaleDateString("es-AR"), W - margin, 17, { align: "right" })

      y = 36

      // ── PROVEEDOR ──
      doc.setFillColor(240, 242, 248)
      doc.rect(margin, y, W - margin * 2, 12, "F")
      texto(c.contrapartes?.nombre ?? "—", margin + 3, y + 5, 12, true, azul)
      texto(c.periodo_label ?? "", margin + 3, y + 10, 8, false, gris)
      texto(`TC: $${(c.tc_cierre ?? 0).toLocaleString("es-AR")}`, W - margin - 3, y + 7, 8, false, gris)
      y += 18

      // ── SALDOS ──
      lineaH(y, azul, 0.5)
      y += 5
      texto("SALDOS", margin, y, 8, true, azul)
      y += 5

      // Tabla saldos
      const colSaldo = [margin, margin + 80, margin + 115]
      texto("", colSaldo[0], y, 7, true, gris)
      texto("USD", colSaldo[1], y, 7, true, gris)
      texto("ARS", colSaldo[2], y, 7, true, gris)
      y += 4
      lineaH(y, [200,200,200], 0.2)
      y += 4

      function filaSaldo(label: string, usd: number, ars: number, resaltar = false) {
        if (resaltar) {
          doc.setFillColor(255, 243, 199)
          doc.rect(margin, y - 3, W - margin * 2, 7, "F")
        }
        texto(label, colSaldo[0], y, 8, resaltar)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.setTextColor(30,30,30)
        doc.text(usd.toLocaleString("es-AR", { minimumFractionDigits: 2 }), colSaldo[1] + 30, y, { align: "right" })
        doc.text(ars.toLocaleString("es-AR", { minimumFractionDigits: 2 }), colSaldo[2] + 35, y, { align: "right" })
        y += 7
      }

      filaSaldo("Saldo s/Gestión (compañía)", c.saldo_final_compania_usd ?? 0, c.saldo_final_compania_ars ?? 0)
      filaSaldo("Saldo s/Contraparte", c.saldo_final_contraparte_usd ?? 0, c.saldo_final_contraparte_ars ?? 0)

      const difArs = (c.saldo_final_compania_ars ?? 0) - (c.saldo_final_contraparte_ars ?? 0)
      const difUsd = (c.saldo_final_compania_usd ?? 0) - (c.saldo_final_contraparte_usd ?? 0)
      lineaH(y - 2, [180,180,180], 0.3)
      filaSaldo("Diferencia final", difUsd, difArs, true)

      y += 3
      lineaH(y, azul, 0.5)
      y += 6

      // ── PENDIENTES ──
      if (pendientes.length > 0) {
        texto("COMPOSICIÓN DE LA DIFERENCIA", margin, y, 8, true, azul)
        y += 6

        const grupos: Record<string, typeof pendientes> = {}
        for (const m of pendientes) {
          const k = m.estado_conciliacion || "pendiente"
          if (!grupos[k]) grupos[k] = []
          grupos[k].push(m)
        }

        for (const [status, items] of Object.entries(grupos)) {
          if (items.length === 0) continue
          const totalArs = items.reduce((a, m) => a + Number(m.importe_ars || 0), 0)
          const totalUsd = items.reduce((a, m) => a + Number(m.importe_usd || 0), 0)

          doc.setFillColor(245, 245, 242)
          doc.rect(margin, y - 3, W - margin * 2, 6, "F")
          texto(status.toUpperCase().replace(/_/g, " "), margin + 2, y + 1, 7, true, gris)
          doc.setFontSize(7)
          doc.setTextColor(...gris)
          doc.text(`${items.length} comp. | USD ${totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })} | ARS ${totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, W - margin - 2, y + 1, { align: "right" })
          y += 8

          // Filas (máx 15 por grupo)
          const limite = Math.min(items.length, 15)
          for (let i = 0; i < limite; i++) {
            const m = items[i]
            if (y > 270) { doc.addPage(); y = 20 }
            doc.setFontSize(7)
            doc.setFont("helvetica", "normal")
            doc.setTextColor(60,60,60)
            const origen = m.origen === "compania" ? "C" : "X"
            doc.text(origen, margin + 2, y)
            doc.text(m.fecha ?? "—", margin + 8, y)
            doc.text((m.tipo_original ?? "").substring(0, 20), margin + 28, y)
            doc.text((m.comprobante_raw ?? "").substring(0, 22), margin + 75, y)
            doc.text(Number(m.importe_ars).toLocaleString("es-AR", { minimumFractionDigits: 2 }), W - margin - 2, y, { align: "right" })
            y += 4.5
          }
          if (items.length > 15) {
            doc.setFontSize(7)
            doc.setTextColor(...gris)
            doc.text(`+ ${items.length - 15} más…`, margin + 4, y)
            y += 5
          }
          y += 2
        }
      }

      // ── FIRMAS ──
      if (y > 240) { doc.addPage(); y = 20 }
      y += 4
      lineaH(y, azul, 0.5)
      y += 8

      // Caja de estado
      const estadoLabel: Record<string, string> = {
        aprobado: "APROBADA", cerrado_operativo: "CERRADO POR OPERATIVO",
        reabierto: "REABIERTA", finalizada: "FINALIZADA",
        en_proceso: "EN PROCESO", borrador: "BORRADOR",
      }
      const estadoColor: Record<string, [number,number,number]> = {
        aprobado: verdeOk, cerrado_operativo: naranja,
        reabierto: [196, 30, 58], finalizada: naranja,
      }
      const eColor = estadoColor[c.estado] ?? gris
      doc.setFillColor(...eColor)
      doc.rect(margin, y - 4, 50, 8, "F")
      texto(estadoLabel[c.estado] ?? c.estado, margin + 2, y + 0.5, 7, true, [255,255,255])
      y += 10

      // Grilla de firmas
      const col1 = margin
      const col2 = margin + 60
      const col3 = margin + 120

      etiqueta("Creada", new Date(c.created_at).toLocaleDateString("es-AR"), col1, y)
      etiqueta("Conciliado por", c.firmado_por ?? "—", col2, y)
      etiqueta("TC cierre", c.tc_cierre ? `$${c.tc_cierre.toLocaleString("es-AR")}` : "—", col3, y)
      y += 14

      if (c.cerrado_fecha || c.aprobado_fecha) {
        etiqueta("Cerrado por operativo", c.cerrado_fecha ? new Date(c.cerrado_fecha).toLocaleString("es-AR") : "—", col1, y)
        etiqueta("Aprobado por supervisor", c.aprobado_fecha ? new Date(c.aprobado_fecha).toLocaleString("es-AR") : "—", col2, y)
        if (c.observacion_aprobacion) {
          etiqueta("Obs. aprobación", c.observacion_aprobacion.substring(0,40), col3, y)
        }
        y += 14
      }

      // Línea de firma
      lineaH(y, [180,180,180], 0.3)
      y += 12
      doc.setDrawColor(80,80,80)
      doc.setLineWidth(0.3)
      doc.line(col1, y, col1 + 50, y)
      doc.line(col2, y, col2 + 50, y)
      doc.line(col3, y, col3 + 50, y)
      y += 4
      texto("Conciliador", col1, y, 7, false, gris)
      texto("Supervisor", col2, y, 7, false, gris)
      texto("Fecha", col3, y, 7, false, gris)

      // Pie de página
      texto(`Generado por Concilia · ${new Date().toLocaleString("es-AR")}`, W / 2, 290, 7, false, gris)

      // Descargar
      const nombre = `conciliacion_${c.contrapartes?.nombre ?? "proveedor"}_${c.periodo_label ?? c.id.substring(0,8)}.pdf`
        .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "")
      doc.save(nombre)
    } catch(e) {
      alert("Error al generar PDF: " + e)
    } finally {
      setGenerandoPDF(false)
    }
  }

  // Permisos según rol y estado
  const esOperativo = usuarioActual?.rol === "operativo"
  const esSupervisor = usuarioActual?.rol === "supervisor" || usuarioActual?.rol === "admin"
  const puedeOperativoCerrar = (esOperativo || esSupervisor) && 
  (c.estado === "en_proceso" || c.estado === "borrador" || 
   c.estado === "finalizada" || c.estado === "reabierto" ||
   c.estado === "cerrado_operativo")


  const puedeSupervisorAprobar = esSupervisor && c.estado === "cerrado_operativo"
  const puedeSupervisorReabrir = esSupervisor && (c.estado === "cerrado_operativo" || c.estado === "aprobado")

  const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
    borrador: { label: "Borrador", color: "bg-ink-100 text-ink-500" },
    en_proceso: { label: "En proceso", color: "bg-info-light text-info" },
    finalizada: { label: "Finalizada", color: "bg-warn-light text-warn" },
    cerrado_operativo: { label: "Cerrado por operativo", color: "bg-warn-light text-warn" },
    aprobado: { label: "Aprobado", color: "bg-ok-light text-ok" },
    reabierto: { label: "Reabierto", color: "bg-danger-light text-danger" },
  }
  const estadoCfg = ESTADO_CONFIG[c.estado] ?? { label: c.estado, color: "bg-ink-100 text-ink-500" }

  return (
    <div className="px-6 py-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/conciliaciones" className="text-2xs uppercase tracking-[0.2em] text-ink-500 hover:text-accent inline-flex items-center gap-1">
          <ArrowLeft size={11} /> Historial
        </Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="h-page">
            {c.contrapartes?.nombre}
            {c.periodo_label && <span className="text-ink-500 text-2xl ml-2">· {c.periodo_label}</span>}
          </h1>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${estadoCfg.color}`}>
              {c.estado === "aprobado" ? <CheckCircle2 size={12} /> : c.estado === "cerrado_operativo" ? <Lock size={12} /> : <AlertCircle size={12} />}
              {estadoCfg.label}
            </span>
            <div className={`badge ${ok ? "badge-ok" : "badge-warn"} text-xs`}>
              {ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {ok ? "Sin diferencia" : "Con diferencia"}
            </div>
          </div>
        </div>
      </div>

      {/* Datos generales */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <Dato label="Conciliada el" valor={new Date(c.created_at).toLocaleDateString("es-AR")} icon={<Calendar size={11} />} />
          <Dato label="TC Cierre" valor={c.tc_cierre?.toLocaleString("es-AR", { maximumFractionDigits: 4 })} />
          <Dato label="Conciliado por" valor={c.firmado_por ?? "—"} icon={<User size={11} />} />
          <Dato label="Aprobado por" valor={c.aprobado_por ?? "—"} icon={<User size={11} />} />
        </div>
      </div>

      {/* Saldos USD + ARS en doble columna */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Saldos</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="text-left text-2xs uppercase text-ink-500 pb-2"></th>
              <th className="text-right text-2xs uppercase text-ink-500 pb-2 w-40">USD</th>
              <th className="text-right text-2xs uppercase text-ink-500 pb-2 w-44">PESOS</th>
            </tr>
          </thead>
          <tbody>
            <FilaSaldo label="Saldo s/Gestión (compañía)" usd={c.saldo_final_compania_usd ?? 0} ars={c.saldo_final_compania_ars ?? 0} />
            <FilaSaldo
              label="Diferencia"
              usd={(c.saldo_final_compania_usd ?? 0) - (c.saldo_final_contraparte_usd ?? 0)}
              ars={(c.saldo_final_compania_ars ?? 0) - (c.saldo_final_contraparte_ars ?? 0)}
              dif
            />
            <FilaSaldo label="Saldo s/Contraparte" usd={c.saldo_final_contraparte_usd ?? 0} ars={c.saldo_final_contraparte_ars ?? 0} />
          </tbody>
        </table>
      </div>

      {/* Composición de la diferencia (pendientes agrupados + ajustes) */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-3">Composición de la diferencia</div>

        {Object.entries(grupos).map(([status, items]) => {
          if (items.length === 0) return null
          const totalArs = items.reduce((acc, m) => acc + Number(m.importe_ars || 0), 0)
          const totalUsd = items.reduce((acc, m) => acc + Number(m.importe_usd || 0), 0)
          return (
            <details key={status} className="border border-ink-200 rounded-md mb-2">
              <summary className="px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm">
                <div className="flex-1">
                  <div className="font-medium">{STATUS_LABELS[status as StatusPendiente] ?? status}</div>
                  <div className="text-2xs text-ink-500">{items.length} comprobantes</div>
                </div>
                <div className="text-right text-xs">
                  <div className="num">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })} USD</div>
                  <div className="num">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS</div>
                </div>
              </summary>
              <table className="w-full text-2xs border-t border-ink-200">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="text-left px-2 py-1">Origen</th>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-left px-2 py-1">Tipo</th>
                    <th className="text-left px-2 py-1">Comprobante</th>
                    <th className="text-right px-2 py-1">ARS</th>
                    <th className="text-right px-2 py-1">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 100).map((m) => (
                    <tr key={m.id} className="border-t border-ink-100">
                      <td className="px-2 py-1">
                        <span className={`badge ${m.origen === "compania" ? "badge-ink" : "badge-ok"}`}>
                          {m.origen === "compania" ? "C" : "X"}
                        </span>
                      </td>
                      <td className="px-2 py-1">{m.fecha}</td>
                      <td className="px-2 py-1 truncate max-w-[160px]">{m.tipo_original}</td>
                      <td className="px-2 py-1 font-mono">{m.comprobante_raw}</td>
                      <td className="px-2 py-1 num text-right">{Number(m.importe_ars).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 num text-right">{Number(m.importe_usd).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {items.length > 100 && (
                    <tr><td colSpan={6} className="px-2 py-1 text-center text-ink-400">+ {items.length - 100} más</td></tr>
                  )}
                </tbody>
              </table>
            </details>
          )
        })}

        {/* Ajustes manuales */}
        {(c.ajustes_manuales?.length ?? 0) > 0 && (
          <details className="border border-ink-200 rounded-md mb-2">
            <summary className="px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm">
              <div className="flex-1">
                <div className="font-medium">Ajustes a realizar por MSU</div>
                <div className="text-2xs text-ink-500">{c.ajustes_manuales.length} ajustes manuales</div>
              </div>
              <div className="text-right text-xs">
                <div className="num">{c.ajustes_manuales.reduce((acc, a) => acc + (a.importe_usd || 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })} USD</div>
                <div className="num">{c.ajustes_manuales.reduce((acc, a) => acc + (a.importe_ars || 0), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS</div>
              </div>
            </summary>
            <table className="w-full text-2xs border-t border-ink-200">
              <thead className="bg-ink-50">
                <tr>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Concepto</th>
                  <th className="text-left px-2 py-1">Comprobante</th>
                  <th className="text-right px-2 py-1">USD</th>
                  <th className="text-right px-2 py-1">ARS</th>
                </tr>
              </thead>
              <tbody>
                {c.ajustes_manuales.map((a) => (
                  <tr key={a.id} className="border-t border-ink-100">
                    <td className="px-2 py-1">{a.fecha}</td>
                    <td className="px-2 py-1">{a.concepto}</td>
                    <td className="px-2 py-1 font-mono">{a.comprobante ?? ""}</td>
                    <td className="px-2 py-1 num text-right">{a.importe_usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-2 py-1 num text-right">{a.importe_ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {pendientes.length === 0 && (c.ajustes_manuales?.length ?? 0) === 0 && (
          <div className="text-sm text-ink-400 italic text-center py-4">Sin pendientes ni ajustes registrados</div>
        )}

        {/* Total + control */}
        <div className={`mt-4 pt-3 border-t-2 border-ink-700 px-2 py-2 rounded ${ok ? "bg-accent-light" : "bg-amber-50"}`}>
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-1">
              {ok ? <CheckCircle2 size={14} className="text-accent" /> : <AlertCircle size={14} className="text-amber-700" />}
              Control de diferencia
            </span>
            <span className={`num ${ok ? "text-accent" : "text-amber-700"}`}>
              {dif.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
      {/* ── ACCIONES DE CIERRE ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold">Estado y firmas</div>
          <button
            onClick={() => setMostrarHistorial(v => !v)}
            className="text-2xs text-ink-500 hover:text-accent flex items-center gap-1"
          >
            <History size={12} /> Historial {mostrarHistorial ? "▲" : "▼"}
          </button>
        </div>

        {/* Firmas actuales */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-2xs text-ink-400 mb-1">Cerrado por operativo</div>
            {c.cerrado_por ? (
              <div>
                <div className="font-semibold text-ink-800">{c.firmado_por ?? "—"}</div>
                <div className="text-2xs text-ink-400">{c.cerrado_fecha ? new Date(c.cerrado_fecha).toLocaleString("es-AR") : "—"}</div>
              </div>
            ) : <div className="text-ink-300 italic">Pendiente</div>}
          </div>
          <div>
            <div className="text-2xs text-ink-400 mb-1">Aprobado por supervisor</div>
            {c.aprobado_por ? (
              <div>
                <div className="font-semibold text-ok">{c.aprobado_por ?? "—"}</div>
                <div className="text-2xs text-ink-400">{c.aprobado_fecha ? new Date(c.aprobado_fecha).toLocaleString("es-AR") : "—"}</div>
              </div>
            ) : <div className="text-ink-300 italic">Pendiente</div>}
          </div>
          {c.observacion_aprobacion && (
            <div>
              <div className="text-2xs text-ink-400 mb-1">Obs. aprobación</div>
              <div className="text-ink-700">{c.observacion_aprobacion}</div>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-3 pt-2 border-t border-ink-200">
          {puedeOperativoCerrar && (
            <button
              onClick={() => setMostrarModalCierre(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Lock size={14} /> Cerrar conciliación
            </button>
          )}
          {puedeSupervisorAprobar && (
            <button
              onClick={() => setMostrarModalAprobacion(true)}
              className="btn btn-primary flex items-center gap-2"
              style={{ background: "#1A7A4A" }}
            >
              <CheckCircle2 size={14} /> Aprobar conciliación
            </button>
          )}
          {puedeSupervisorReabrir && (
            <button
              onClick={() => setMostrarModalReapertura(true)}
              className="btn btn-secondary flex items-center gap-2 text-danger"
            >
              <Unlock size={14} /> Reabrir
            </button>
          )}
          {!puedeOperativoCerrar && !puedeSupervisorAprobar && !puedeSupervisorReabrir && (
            <div className="text-2xs text-ink-400 italic">
              {c.estado === "aprobado" ? "✓ Conciliación aprobada y cerrada" : "No tenés permisos para modificar esta conciliación"}
            </div>
          )}
        </div>

        {/* Historial de estados */}
        {mostrarHistorial && (
          <div className="border-t border-ink-200 pt-3 space-y-2">
            <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">Log de cambios</div>
            {historial.length === 0 ? (
              <div className="text-2xs text-ink-400 italic">Sin registros</div>
            ) : (
              historial.map(h => (
                <div key={h.id} className="flex items-start gap-3 text-xs py-2 border-b border-ink-100 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{(h.usuarios as any)?.nombre ?? "Sistema"}</span>
                      <span className="text-ink-400">→</span>
                      <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${ESTADO_CONFIG[h.estado_nuevo]?.color ?? "bg-ink-100 text-ink-500"}`}>
                        {ESTADO_CONFIG[h.estado_nuevo]?.label ?? h.estado_nuevo}
                      </span>
                    </div>
                    {h.observacion && <div className="text-ink-500 mt-0.5">{h.observacion}</div>}
                    <div className="text-2xs text-ink-400 mt-0.5">{new Date(h.created_at).toLocaleString("es-AR")}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal cierre operativo */}
      {mostrarModalCierre && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="text-base font-semibold">Cerrar conciliación</div>
            <p className="text-sm text-ink-600">Una vez cerrada, ningún operativo podrá modificarla. El supervisor podrá revisarla y aprobarla o reabrirla.</p>
            <div>
              <label className="label">Observación (opcional)</label>
              <textarea value={observacion} onChange={e => setObservacion(e.target.value)} className="input w-full h-20 resize-none" placeholder="Notas para el supervisor…" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMostrarModalCierre(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={() => ejecutarAccion("cerrado_operativo")} disabled={accionando} className="btn btn-primary disabled:opacity-40">
                <Lock size={13} /> {accionando ? "Cerrando…" : "Confirmar cierre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aprobación supervisor */}
      {mostrarModalAprobacion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="text-base font-semibold">Aprobar conciliación</div>
            <p className="text-sm text-ink-600">Al aprobar, la conciliación queda cerrada y firmada con tu nombre y fecha.</p>
            <div>
              <label className="label">Observación (opcional)</label>
              <textarea value={observacion} onChange={e => setObservacion(e.target.value)} className="input w-full h-20 resize-none" placeholder="Comentarios de la revisión…" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMostrarModalAprobacion(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={() => ejecutarAccion("aprobado")} disabled={accionando} className="btn btn-primary disabled:opacity-40" style={{ background: "#1A7A4A" }}>
                <CheckCircle2 size={13} /> {accionando ? "Aprobando…" : "Aprobar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reapertura */}
      {mostrarModalReapertura && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="text-base font-semibold">Reabrir conciliación</div>
            <p className="text-sm text-ink-600">La reapertura queda registrada en el log. Podés modificarla y volver a cerrarla.</p>
            <div>
              <label className="label">Motivo de reapertura *</label>
              <textarea value={observacion} onChange={e => setObservacion(e.target.value)} className="input w-full h-20 resize-none" placeholder="Explicá por qué se reabre…" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMostrarModalReapertura(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={() => ejecutarAccion("reabierto")} disabled={accionando || !observacion.trim()} className="btn btn-secondary text-danger disabled:opacity-40">
                <Unlock size={13} /> {accionando ? "Reabriendo…" : "Reabrir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function Dato({ label, valor, icon }: { label: string; valor?: string | null; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-500 mb-0.5 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="font-medium text-ink-800 text-sm">{valor || "—"}</div>
    </div>
  )
}

function FilaSaldo({ label, usd, ars, dif }: { label: string; usd: number; ars: number; dif?: boolean }) {
  const cls = dif ? "text-amber-700 font-medium" : "text-ink-900"
  return (
    <tr className="border-b border-ink-100">
      <td className={`py-2 ${cls}`}>{label}</td>
      <td className={`py-2 num text-right ${cls}`}>{usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
      <td className={`py-2 num text-right ${cls}`}>{ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
    </tr>
  )
}

function agruparPorStatus(movs: MovGuardado[]): Record<string, MovGuardado[]> {
  const r: Record<string, MovGuardado[]> = {}
  for (const m of movs) {
    const k = m.estado_conciliacion || "pendiente"
    if (!r[k]) r[k] = []
    r[k].push(m)
  }
  return r
}