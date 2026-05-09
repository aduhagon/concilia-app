"use client"

import type { ResultadoConciliacion } from "@/types"
import { Plus, Minus, ArrowRight, AlertCircle } from "lucide-react"

type Props = {
  r: ResultadoConciliacion
}

export default function ConciliacionContable({ r }: Props) {
  const movs = r.movimientos

  // Saldo de cada lado: suma de TODOS los movimientos del origen
  const saldoCmp = r.resumen.saldo_compania_ars
  const saldoCont = r.resumen.saldo_contraparte_ars

  // Pendientes contraparte = movimientos en X que no están en compañía
  // Estos se SUMAN al saldo compañía (son partidas que están de un lado y faltan del otro)
  const pendientesContraparte = movs.filter((m) => m.estado === "pendiente" && m.origen === "contraparte")
  const totalPendientesCont = pendientesContraparte.reduce((acc, m) => acc + (m.importe_ars || 0), 0)

  // Pendientes compañía = movimientos en C que no están en contraparte
  // Estos se RESTAN al saldo compañía (porque están de un lado y faltan del otro)
  const pendientesCompania = movs.filter((m) => m.estado === "pendiente" && m.origen === "compania")
  const totalPendientesCmp = pendientesCompania.reduce((acc, m) => acc + (m.importe_ars || 0), 0)

  // Saldo conciliado esperado = saldo cmp + pend.cont - pend.cmp
  // (la dirección depende del signo de los movimientos en compañía)
  const saldoConciliadoEsperado = saldoCmp + totalPendientesCont - totalPendientesCmp

  // Diferencia sin conciliar = lo que falta para llegar al saldo informado por contraparte
  const diferenciaSinConciliar = saldoConciliadoEsperado - saldoCont

  // Agrupar pendientes por TIPO normalizado para el desglose por categoría
  const grupoCompania = agruparPorTipo(pendientesCompania)
  const grupoContraparte = agruparPorTipo(pendientesContraparte)

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-semibold">Conciliación contable</h3>
        <span className="text-2xs uppercase tracking-wider text-ink-400">Saldo informado por compañía → contraparte</span>
      </div>

      <div className="space-y-1 font-mono text-sm">
        {/* Saldo compañía */}
        <FilaSaldo
          label="Saldo según compañía"
          importe={saldoCmp}
          variante="base"
        />

        <Divisor />

        {/* (+) Pendientes contraparte */}
        <FilaConcepto
          op="+"
          label="Comprobantes en contraparte no registrados por compañía"
          cantidad={pendientesContraparte.length}
          importe={totalPendientesCont}
        />
        {grupoContraparte.length > 0 && (
          <DesgloseGrupo grupos={grupoContraparte} variante="suma" />
        )}

        {/* (-) Pendientes compañía */}
        <FilaConcepto
          op="-"
          label="Comprobantes en compañía no registrados por contraparte"
          cantidad={pendientesCompania.length}
          importe={totalPendientesCmp}
        />
        {grupoCompania.length > 0 && (
          <DesgloseGrupo grupos={grupoCompania} variante="resta" />
        )}

        <Divisor />

        {/* Saldo conciliado esperado */}
        <FilaSaldo
          label="Saldo conciliado esperado"
          importe={saldoConciliadoEsperado}
          variante="resultado"
        />

        {/* Saldo informado por contraparte */}
        <FilaSaldo
          label="Saldo informado por contraparte"
          importe={saldoCont}
          variante="base"
        />

        <Divisor />

        {/* Diferencia */}
        <FilaSaldo
          label="Diferencia sin conciliar"
          importe={diferenciaSinConciliar}
          variante={Math.abs(diferenciaSinConciliar) < 1 ? "ok" : "error"}
        />
      </div>

      {/* Diferencias de importe (anotación aparte) */}
      {r.resumen.conciliados_dif_real > 0 && (
        <div className="mt-5 pt-4 border-t border-ink-200">
          <div className="flex items-start gap-2 text-xs">
            <AlertCircle size={14} className="text-amber-700 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-ink-700 font-medium">Aparte: {r.resumen.conciliados_dif_real} comprobantes con diferencia de importe real</span>
              <span className="text-ink-500"> — estos comprobantes matchean por número pero los importes no coinciden. No se incluyen en la fórmula del saldo, hay que revisarlos uno por uno.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

function FilaSaldo({
  label, importe, variante,
}: {
  label: string
  importe: number
  variante: "base" | "resultado" | "ok" | "error"
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${
      variante === "resultado" ? "font-semibold text-ink-900 bg-accent-light px-3 rounded" : ""
    }`}>
      <span className={
        variante === "ok" ? "text-accent font-medium" :
        variante === "error" ? "text-amber-700 font-medium" :
        "text-ink-700"
      }>
        {label}
      </span>
      <span className={`num tabular-nums ${
        variante === "ok" ? "text-accent font-semibold" :
        variante === "error" ? "text-amber-700 font-semibold" :
        variante === "resultado" ? "text-accent-dark" :
        "text-ink-900"
      }`}>
        {importe.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function FilaConcepto({
  op, label, cantidad, importe,
}: { op: "+" | "-"; label: string; cantidad: number; importe: number }) {
  const Icon = op === "+" ? Plus : Minus
  const color = op === "+" ? "text-accent" : "text-amber-700"
  return (
    <div className="flex items-start justify-between py-2">
      <div className="flex items-start gap-2 flex-1">
        <Icon size={14} className={`${color} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <div className="text-ink-700">{label}</div>
          <div className="text-2xs text-ink-400 mt-0.5">{cantidad} movimiento{cantidad !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <span className={`num tabular-nums ${color}`}>
        {op === "+" ? "+" : "-"}{Math.abs(importe).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function Divisor() {
  return <div className="border-t border-ink-200 my-1" />
}

function DesgloseGrupo({
  grupos, variante,
}: {
  grupos: { tipo: string; cantidad: number; total: number }[]
  variante: "suma" | "resta"
}) {
  const color = variante === "suma" ? "text-accent" : "text-amber-700"
  return (
    <div className="ml-6 pl-3 border-l border-ink-200 space-y-0.5 mb-2">
      {grupos.map((g) => (
        <div key={g.tipo} className="flex items-center justify-between text-2xs py-0.5">
          <span className="text-ink-500 truncate flex-1">
            <span className="font-mono">{g.tipo}</span>
            <span className="text-ink-400 ml-1.5">({g.cantidad})</span>
          </span>
          <span className={`num tabular-nums ${color} ml-2`}>
            {Math.abs(g.total).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function agruparPorTipo(movs: { tipo_original: string; importe_ars: number }[]) {
  const map = new Map<string, { cantidad: number; total: number }>()
  for (const m of movs) {
    const t = m.tipo_original || "(sin tipo)"
    const e = map.get(t) ?? { cantidad: 0, total: 0 }
    e.cantidad += 1
    e.total += m.importe_ars || 0
    map.set(t, e)
  }
  return Array.from(map.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}
