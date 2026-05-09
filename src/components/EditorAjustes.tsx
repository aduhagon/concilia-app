"use client"

import type { AjusteManual } from "@/types"
import { nuevoAjusteId } from "@/lib/papel-conciliacion"
import { Plus, Trash2 } from "lucide-react"

type Props = {
  ajustes: AjusteManual[]
  onChange: (ajustes: AjusteManual[]) => void
}

export default function EditorAjustes({ ajustes, onChange }: Props) {
  function agregar() {
    onChange([
      ...ajustes,
      {
        id: nuevoAjusteId(),
        fecha: new Date().toISOString().slice(0, 10),
        concepto: "",
        importe_ars: 0,
        importe_usd: 0,
      },
    ])
  }

  function modificar(idx: number, parcial: Partial<AjusteManual>) {
    const c = [...ajustes]
    c[idx] = { ...c[idx], ...parcial }
    onChange(c)
  }

  function quitar(idx: number) {
    onChange(ajustes.filter((_, i) => i !== idx))
  }

  const totalArs = ajustes.reduce((acc, a) => acc + (a.importe_ars || 0), 0)
  const totalUsd = ajustes.reduce((acc, a) => acc + (a.importe_usd || 0), 0)

  return (
    <div className="card">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Ajustes manuales</div>
          <div className="font-serif text-base">Ajustes a realizar por MSU</div>
          <p className="text-xs text-ink-500 mt-0.5">Diferencias conocidas que se explican manualmente (errores de carga, retenciones mal aplicadas, etc.)</p>
        </div>
        <button onClick={agregar} className="btn btn-secondary">
          <Plus size={14} /> Agregar ajuste
        </button>
      </div>

      {ajustes.length === 0 ? (
        <div className="text-xs text-ink-400 italic px-3 py-4 border border-dashed border-ink-200 rounded-md text-center">
          Sin ajustes. Agregá uno si tenés diferencias conocidas que explicar.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="text-left py-2 text-2xs uppercase text-ink-500 w-32">Fecha</th>
                <th className="text-left py-2 text-2xs uppercase text-ink-500">Concepto</th>
                <th className="text-left py-2 text-2xs uppercase text-ink-500 w-32">Comprobante</th>
                <th className="text-right py-2 text-2xs uppercase text-ink-500 w-32">USD</th>
                <th className="text-right py-2 text-2xs uppercase text-ink-500 w-40">ARS</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {ajustes.map((a, idx) => (
                <tr key={a.id} className="border-b border-ink-100">
                  <td className="py-1">
                    <input
                      type="date"
                      value={a.fecha}
                      onChange={(e) => modificar(idx, { fecha: e.target.value })}
                      className="input text-xs py-1 px-2"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      value={a.concepto}
                      onChange={(e) => modificar(idx, { concepto: e.target.value })}
                      placeholder="Ej: Error retención sobre liq anulada"
                      className="input text-xs py-1 px-2 w-full"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      value={a.comprobante ?? ""}
                      onChange={(e) => modificar(idx, { comprobante: e.target.value })}
                      placeholder="opcional"
                      className="input text-xs py-1 px-2 font-mono"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={a.importe_usd || ""}
                      onChange={(e) => modificar(idx, { importe_usd: parseFloat(e.target.value) || 0 })}
                      className="input text-xs py-1 px-2 text-right num"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number"
                      step="0.01"
                      value={a.importe_ars || ""}
                      onChange={(e) => modificar(idx, { importe_ars: parseFloat(e.target.value) || 0 })}
                      className="input text-xs py-1 px-2 text-right num"
                    />
                  </td>
                  <td className="py-1">
                    <button onClick={() => quitar(idx)} className="text-error hover:bg-red-50 p-1 rounded">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-300 font-medium">
                <td colSpan={3} className="py-2 text-2xs uppercase text-ink-700">Total ajustes</td>
                <td className="py-2 num text-right">{totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                <td className="py-2 num text-right">{totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
