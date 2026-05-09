"use client"

import type { SaldosBilaterales } from "@/types"

type Props = {
  saldos: SaldosBilaterales
  onChange: (s: SaldosBilaterales) => void
  periodoLabel: string
  onPeriodoChange: (s: string) => void
}

export default function EditorSaldos({ saldos, onChange, periodoLabel, onPeriodoChange }: Props) {
  function setNum<K extends keyof SaldosBilaterales>(k: K, v: number) {
    onChange({ ...saldos, [k]: v })
  }

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Período y saldos</div>
        <div className="font-serif text-base">Saldos del período</div>
        <p className="text-xs text-ink-500 mt-0.5">
          Saldos iniciales (cierre del mes anterior) y finales (cierre del mes actual) en ARS y USD para cada lado.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <label className="label">TC Cierre (BNA)</label>
          <input
            type="number"
            step="0.0001"
            value={saldos.tc_cierre || ""}
            onChange={(e) => setNum("tc_cierre", parseFloat(e.target.value) || 0)}
            placeholder="1447.00"
            className="input num"
          />
        </div>
      </div>

      {/* Saldos iniciales */}
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">Saldos iniciales (cierre mes anterior)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FilaSaldo
            titulo="Compañía"
            arsValue={saldos.inicial_compania_ars}
            usdValue={saldos.inicial_compania_usd}
            onArs={(v) => setNum("inicial_compania_ars", v)}
            onUsd={(v) => setNum("inicial_compania_usd", v)}
          />
          <FilaSaldo
            titulo="Contraparte"
            arsValue={saldos.inicial_contraparte_ars}
            usdValue={saldos.inicial_contraparte_usd}
            onArs={(v) => setNum("inicial_contraparte_ars", v)}
            onUsd={(v) => setNum("inicial_contraparte_usd", v)}
          />
        </div>
      </div>

      {/* Saldos finales */}
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">Saldos finales (cierre mes actual)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FilaSaldo
            titulo="Compañía"
            arsValue={saldos.final_compania_ars}
            usdValue={saldos.final_compania_usd}
            onArs={(v) => setNum("final_compania_ars", v)}
            onUsd={(v) => setNum("final_compania_usd", v)}
            destacado
          />
          <FilaSaldo
            titulo="Contraparte"
            arsValue={saldos.final_contraparte_ars}
            usdValue={saldos.final_contraparte_usd}
            onArs={(v) => setNum("final_contraparte_ars", v)}
            onUsd={(v) => setNum("final_contraparte_usd", v)}
            destacado
          />
        </div>
      </div>

      {/* Diferencia visual */}
      <div className="border-t border-ink-200 pt-3">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">Diferencia esperada (Compañía − Contraparte)</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <span className="text-ink-700">USD</span>
            <span className="num font-medium text-amber-700">
              {(saldos.final_compania_usd - saldos.final_contraparte_usd).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <span className="text-ink-700">ARS</span>
            <span className="num font-medium text-amber-700">
              {(saldos.final_compania_ars - saldos.final_contraparte_ars).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="text-2xs text-ink-500 mt-2">
          Esta diferencia hay que explicarla con: pendientes (4 categorías) + ajustes manuales.
        </div>
      </div>
    </div>
  )
}

function FilaSaldo({
  titulo, arsValue, usdValue, onArs, onUsd, destacado,
}: {
  titulo: string
  arsValue: number
  usdValue: number
  onArs: (v: number) => void
  onUsd: (v: number) => void
  destacado?: boolean
}) {
  return (
    <div className={`border rounded-md p-3 ${destacado ? "border-accent/30 bg-accent-light/30" : "border-ink-200"}`}>
      <div className="text-xs font-medium mb-2">{titulo}</div>
      <div className="space-y-2">
        <div>
          <label className="text-2xs uppercase tracking-wider text-ink-500">USD</label>
          <input
            type="number"
            step="0.01"
            value={usdValue || ""}
            onChange={(e) => onUsd(parseFloat(e.target.value) || 0)}
            className="input text-sm num"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-2xs uppercase tracking-wider text-ink-500">ARS</label>
          <input
            type="number"
            step="0.01"
            value={arsValue || ""}
            onChange={(e) => onArs(parseFloat(e.target.value) || 0)}
            className="input text-sm num"
            placeholder="0.00"
          />
        </div>
      </div>
    </div>
  )
}
