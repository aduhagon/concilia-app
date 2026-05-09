"use client"

import type { PapelConciliacion, AjusteManual } from "@/types"
import { CheckCircle2, AlertCircle } from "lucide-react"

type Props = {
  papel: PapelConciliacion
  contraparte: string
  periodoLabel?: string
  fechaCierre?: string
  conciliadoPor?: string
  conciliadoFecha?: string
  aprobadoPor?: string
  aprobadoFecha?: string
}

export default function PapelConciliacionView({
  papel,
  contraparte,
  periodoLabel,
  fechaCierre,
  conciliadoPor,
  conciliadoFecha,
  aprobadoPor,
  aprobadoFecha,
}: Props) {
  const s = papel.saldos
  const c = papel.composicion

  const okControl = Math.abs(papel.diferencia_sin_explicar_ars) < 1 && Math.abs(papel.diferencia_sin_explicar_usd) < 1

  return (
    <div className="card max-w-5xl mx-auto bg-white">
      {/* Cabecera */}
      <div className="border-b border-ink-200 pb-4 mb-5">
        <h2 className="font-serif text-2xl font-medium">Reporte de Conciliación</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs mt-3 text-ink-600">
          <Dato label="Cuenta" valor={contraparte} />
          <Dato label="Conciliación al" valor={fechaCierre} />
          <Dato label="Período" valor={periodoLabel} />
          <Dato label="TC Bco. Nac. Argentina" valor={s.tc_cierre.toLocaleString("es-AR", { maximumFractionDigits: 4 })} />
        </div>
      </div>

      {/* Tabla saldos: USD + PESOS en dos columnas */}
      <table className="w-full text-sm mb-5">
        <thead>
          <tr className="border-b border-ink-200">
            <th className="text-left text-2xs font-medium uppercase tracking-wider text-ink-500 pb-2"></th>
            <th className="text-right text-2xs font-medium uppercase tracking-wider text-ink-500 pb-2 w-44">USD</th>
            <th className="text-right text-2xs font-medium uppercase tracking-wider text-ink-500 pb-2 w-48">PESOS</th>
          </tr>
        </thead>
        <tbody>
          <FilaSaldo label="Saldo s/Gestión" usd={s.final_compania_usd} ars={s.final_compania_ars} />
          <FilaSaldo label="Diferencia" usd={papel.diferencia_esperada_usd} ars={papel.diferencia_esperada_ars} variante="dif" />
          <FilaSaldo label="Saldo s/Contraparte (tercero)" usd={s.final_contraparte_usd} ars={s.final_contraparte_ars} />
        </tbody>
      </table>

      {/* Detalle de la diferencia */}
      <div className="space-y-1">
        <div className="font-serif text-base mb-2 mt-6">Detalle de Diferencia</div>

        <CategoriaCard
          titulo="Comprobantes contabilizados con fecha posterior por MSU"
          subtitulo="Ya están contabilizados de su lado en un mes posterior"
          cantidad={c.posterior_msu.movimientos.length}
          totalArs={c.posterior_msu.total_ars}
          totalUsd={c.posterior_msu.total_usd}
          movimientos={c.posterior_msu.movimientos.map((m) => ({
            fecha: m.fecha?.toISOString().slice(0, 10) ?? "",
            descripcion: m.tipo_original,
            comprobante: m.comprobante_raw,
            ars: m.importe_ars,
            usd: m.importe_usd,
          }))}
        />

        <CategoriaCard
          titulo="Comprobantes pendientes de contabilizar por MSU"
          subtitulo="La contraparte los tiene, MSU todavía no"
          cantidad={c.pendiente_msu.movimientos.length}
          totalArs={c.pendiente_msu.total_ars}
          totalUsd={c.pendiente_msu.total_usd}
          movimientos={c.pendiente_msu.movimientos.map((m) => ({
            fecha: m.fecha?.toISOString().slice(0, 10) ?? "",
            descripcion: m.tipo_original,
            comprobante: m.comprobante_raw,
            ars: m.importe_ars,
            usd: m.importe_usd,
          }))}
        />

        <CategoriaCard
          titulo="Comprobantes contabilizados por contraparte con fecha posterior"
          subtitulo="Ya los registró la contraparte en un mes posterior"
          cantidad={c.posterior_contraparte.movimientos.length}
          totalArs={c.posterior_contraparte.total_ars}
          totalUsd={c.posterior_contraparte.total_usd}
          movimientos={c.posterior_contraparte.movimientos.map((m) => ({
            fecha: m.fecha?.toISOString().slice(0, 10) ?? "",
            descripcion: m.tipo_original,
            comprobante: m.comprobante_raw,
            ars: m.importe_ars,
            usd: m.importe_usd,
          }))}
        />

        <CategoriaCard
          titulo="Comprobantes no contabilizados por contraparte"
          subtitulo="MSU los tiene, la contraparte no — falta investigar"
          cantidad={c.no_contraparte.movimientos.length}
          totalArs={c.no_contraparte.total_ars}
          totalUsd={c.no_contraparte.total_usd}
          movimientos={c.no_contraparte.movimientos.map((m) => ({
            fecha: m.fecha?.toISOString().slice(0, 10) ?? "",
            descripcion: m.tipo_original,
            comprobante: m.comprobante_raw,
            ars: m.importe_ars,
            usd: m.importe_usd,
          }))}
        />

        <CategoriaCardAjustes ajustes={c.ajustes.ajustes} totalArs={c.ajustes.total_ars} totalUsd={c.ajustes.total_usd} />

        {c.sin_clasificar.movimientos.length > 0 && (
          <CategoriaCard
            titulo="Sin clasificar"
            subtitulo="⚠ Estos pendientes todavía no tienen status asignado"
            cantidad={c.sin_clasificar.movimientos.length}
            totalArs={c.sin_clasificar.total_ars}
            totalUsd={c.sin_clasificar.total_usd}
            warning
            movimientos={c.sin_clasificar.movimientos.map((m) => ({
              fecha: m.fecha?.toISOString().slice(0, 10) ?? "",
              descripcion: m.tipo_original,
              comprobante: m.comprobante_raw,
              ars: m.importe_ars,
              usd: m.importe_usd,
            }))}
          />
        )}
      </div>

      {/* Total diferencia + control */}
      <table className="w-full text-sm mt-5 border-t-2 border-ink-700 pt-2">
        <tbody>
          <tr className="border-b border-ink-200">
            <td className="py-2 font-medium">Total Diferencia explicada</td>
            <td className="py-2 num text-right">{papel.diferencia_explicada_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td className="py-2 num text-right">{papel.diferencia_explicada_ars.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr className={`${okControl ? "bg-accent-light" : "bg-amber-50"}`}>
            <td className="py-2 px-2 font-medium flex items-center gap-1">
              {okControl ? <CheckCircle2 size={14} className="text-accent" /> : <AlertCircle size={14} className="text-amber-700" />}
              Control de Diferencia (debería ser 0)
            </td>
            <td className={`py-2 px-2 num text-right font-semibold ${okControl ? "text-accent" : "text-amber-700"}`}>
              {papel.diferencia_sin_explicar_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className={`py-2 px-2 num text-right font-semibold ${okControl ? "text-accent" : "text-amber-700"}`}>
              {papel.diferencia_sin_explicar_ars.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Pie de firmas */}
      <div className="mt-8 pt-5 border-t border-ink-200 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Conciliado por</div>
          <div className="font-medium">{conciliadoPor || "—"}</div>
          <div className="text-ink-500 mt-0.5">{conciliadoFecha ? `Fecha: ${conciliadoFecha}` : ""}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Aprobado por</div>
          <div className="font-medium">{aprobadoPor || "—"}</div>
          <div className="text-ink-500 mt-0.5">{aprobadoFecha ? `Fecha: ${aprobadoFecha}` : ""}</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

function Dato({ label, valor }: { label: string; valor?: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-ink-400">{label}</div>
      <div className="font-medium text-ink-800 text-sm">{valor || "—"}</div>
    </div>
  )
}

function FilaSaldo({ label, usd, ars, variante }: { label: string; usd: number; ars: number; variante?: "dif" }) {
  const cls = variante === "dif" ? "text-amber-700 font-medium" : "text-ink-900"
  return (
    <tr className="border-b border-ink-100">
      <td className={`py-2 ${cls}`}>{label}</td>
      <td className={`py-2 num text-right ${cls}`}>{usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td className={`py-2 num text-right ${cls}`}>{ars.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  )
}

type FilaMov = { fecha: string; descripcion: string; comprobante: string; ars: number; usd: number }

function CategoriaCard({
  titulo, subtitulo, cantidad, totalArs, totalUsd, movimientos, warning,
}: {
  titulo: string
  subtitulo: string
  cantidad: number
  totalArs: number
  totalUsd: number
  movimientos: FilaMov[]
  warning?: boolean
}) {
  return (
    <details className="border border-ink-200 rounded-md overflow-hidden">
      <summary className={`px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm gap-3 ${warning ? "bg-amber-50" : "bg-white"}`}>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{titulo}</div>
          <div className="text-2xs text-ink-500 mt-0.5">{subtitulo} · {cantidad} comp.</div>
        </div>
        <div className="text-right text-xs flex-shrink-0">
          <div className="num">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div>
          <div className="num">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</div>
        </div>
      </summary>
      {movimientos.length > 0 && (
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
            {movimientos.slice(0, 50).map((m, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-2 py-1">{m.fecha}</td>
                <td className="px-2 py-1">{m.descripcion}</td>
                <td className="px-2 py-1 font-mono">{m.comprobante}</td>
                <td className="px-2 py-1 num text-right">{m.usd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-1 num text-right">{m.ars.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            {movimientos.length > 50 && (
              <tr><td colSpan={5} className="px-2 py-1 text-center text-ink-400">+ {movimientos.length - 50} más — ver Excel</td></tr>
            )}
          </tbody>
        </table>
      )}
    </details>
  )
}

function CategoriaCardAjustes({ ajustes, totalArs, totalUsd }: { ajustes: AjusteManual[]; totalArs: number; totalUsd: number }) {
  return (
    <details className="border border-ink-200 rounded-md overflow-hidden">
      <summary className="px-3 py-2 cursor-pointer hover:bg-ink-50 flex items-center justify-between text-sm gap-3 bg-white">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">Ajustes a realizar por MSU</div>
          <div className="text-2xs text-ink-500 mt-0.5">Diferencias conocidas y explicadas · {ajustes.length} ajustes</div>
        </div>
        <div className="text-right text-xs flex-shrink-0">
          <div className="num">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div>
          <div className="num">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS</div>
        </div>
      </summary>
      {ajustes.length > 0 && (
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
            {ajustes.map((a) => (
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
      )}
    </details>
  )
}
