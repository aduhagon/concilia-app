"use client"

import type { SaldosBilaterales } from "@/types"
import InputMoney from "./InputMoney"
import { Copy, AlertTriangle } from "lucide-react"
import { formatNum } from "@/lib/format"

type Props = {
  saldos: SaldosBilaterales
  onChange: (s: SaldosBilaterales) => void
  periodoLabel: string
  onPeriodoChange: (s: string) => void
  onCopiarAnterior?: () => void
  copiarAnteriorLabel?: string
}

export default function EditorSaldos({
  saldos, onChange, periodoLabel, onPeriodoChange,
  onCopiarAnterior, copiarAnteriorLabel,
}: Props) {
  function set<K extends keyof SaldosBilaterales>(k: K, v: SaldosBilaterales[K]) {
    onChange({ ...saldos, [k]: v })
  }

  // Detectar inconsistencias TC vs ARS/USD
  function inconsistenciaTC(usd: number, ars: number): { tc: number; pct: number } | null {
    if (!saldos.tc_cierre || saldos.tc_cierre === 0) return null
    if (usd === 0 || ars === 0) return null
    const tcCalc = Math.abs(ars / usd)
    const diff = Math.abs(tcCalc - saldos.tc_cierre) / saldos.tc_cierre * 100
    if (diff > 5) return { tc: tcCalc, pct: diff }
    return null
  }

  const incCmp = inconsistenciaTC(saldos.final_compania_usd, saldos.final_compania_ars)
  const incCont = inconsistenciaTC(saldos.final_contraparte_usd, saldos.final_contraparte_ars)

  return (
    <div className="panel p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="h-section">Período y saldos</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            Saldos iniciales (cierre del mes anterior) y finales (cierre del mes actual). Doble columna USD + ARS.
          </p>
        </div>
        {onCopiarAnterior && (
          <button onClick={onCopiarAnterior} className="btn btn-secondary">
            <Copy size={12} />
            {copiarAnteriorLabel ?? "Copiar de mes anterior"}
          </button>
        )}
      </div>

      {/* Período + TC */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Período</label>
          <input
            value={periodoLabel}
            onChange={(e) => onPeriodoChange(e.target.value)}
            placeholder="Ej: Enero 2026"
            className="input"
          />
        </div>
        <div>
          <label className="label">TC Cierre BNA</label>
          <InputMoney
            value={saldos.tc_cierre}
            onChange={(v) => set("tc_cierre", v)}
            placeholder="1.447,00"
          />
        </div>
      </div>

      {/* Tabla de saldos al estilo papel contable */}
      <div className="border border-ink-200">
        <table className="w-full text-sm">
          <thead className="bg-ink-50">
            <tr>
              <th className="text-left text-2xs uppercase tracking-wider text-ink-500 font-medium px-3 py-2 border-b border-ink-200"></th>
              <th className="text-right text-2xs uppercase tracking-wider text-ink-500 font-medium px-3 py-2 border-b border-ink-200 w-44" colSpan={2}>Compañía</th>
              <th className="text-right text-2xs uppercase tracking-wider text-ink-500 font-medium px-3 py-2 border-b border-ink-200 w-44" colSpan={2}>Contraparte</th>
            </tr>
            <tr>
              <th></th>
              <th className="text-right text-2xs text-ink-400 px-3 py-1 border-b border-ink-200 font-normal">USD</th>
              <th className="text-right text-2xs text-ink-400 px-3 py-1 border-b border-ink-200 font-normal">ARS</th>
              <th className="text-right text-2xs text-ink-400 px-3 py-1 border-b border-ink-200 font-normal">USD</th>
              <th className="text-right text-2xs text-ink-400 px-3 py-1 border-b border-ink-200 font-normal">ARS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 text-xs text-ink-500 border-b border-ink-100">Saldo inicial</td>
              <td className="px-2 py-1 border-b border-ink-100">
                <InputMoney value={saldos.inicial_compania_usd} onChange={(v) => set("inicial_compania_usd", v)} />
              </td>
              <td className="px-2 py-1 border-b border-ink-100">
                <InputMoney value={saldos.inicial_compania_ars} onChange={(v) => set("inicial_compania_ars", v)} />
              </td>
              <td className="px-2 py-1 border-b border-ink-100">
                <InputMoney value={saldos.inicial_contraparte_usd} onChange={(v) => set("inicial_contraparte_usd", v)} />
              </td>
              <td className="px-2 py-1 border-b border-ink-100">
                <InputMoney value={saldos.inicial_contraparte_ars} onChange={(v) => set("inicial_contraparte_ars", v)} />
              </td>
            </tr>
            <tr className="bg-accent-light/30">
              <td className="px-3 py-2 text-xs font-semibold text-ink-900 border-b border-ink-200">Saldo final</td>
              <td className="px-2 py-1 border-b border-ink-200">
                <InputMoney value={saldos.final_compania_usd} onChange={(v) => set("final_compania_usd", v)} large />
              </td>
              <td className="px-2 py-1 border-b border-ink-200">
                <InputMoney value={saldos.final_compania_ars} onChange={(v) => set("final_compania_ars", v)} large />
              </td>
              <td className="px-2 py-1 border-b border-ink-200">
                <InputMoney value={saldos.final_contraparte_usd} onChange={(v) => set("final_contraparte_usd", v)} large />
              </td>
              <td className="px-2 py-1 border-b border-ink-200">
                <InputMoney value={saldos.final_contraparte_ars} onChange={(v) => set("final_contraparte_ars", v)} large />
              </td>
            </tr>
            <tr className="bg-warn-light/40">
              <td className="px-3 py-2 text-xs font-semibold text-warn-dark">Diferencia</td>
              <td className="px-3 py-2 text-right num text-warn-dark text-sm font-semibold" colSpan={2}>
                USD {formatNum(saldos.final_compania_usd - saldos.final_contraparte_usd)}
              </td>
              <td className="px-3 py-2 text-right num text-warn-dark text-sm font-semibold" colSpan={2}>
                ARS {formatNum(saldos.final_compania_ars - saldos.final_contraparte_ars)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Avisos de inconsistencia TC */}
      {(incCmp || incCont) && (
        <div className="bg-warn-light border border-warn/30 px-3 py-2 text-xs text-warn-dark flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-1">Posible inconsistencia con el TC</div>
            {incCmp && (
              <div>
                Compañía: el TC implícito (ARS/USD) es {formatNum(incCmp.tc, 4)}, difiere {incCmp.pct.toFixed(1)}% del TC ingresado ({formatNum(saldos.tc_cierre, 4)})
              </div>
            )}
            {incCont && (
              <div>
                Contraparte: el TC implícito es {formatNum(incCont.tc, 4)}, difiere {incCont.pct.toFixed(1)}% del TC ingresado
              </div>
            )}
            <div className="text-2xs mt-1 text-warn">Verificá que los importes y el TC sean consistentes.</div>
          </div>
        </div>
      )}
    </div>
  )
}
