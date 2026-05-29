"use client"

import { useState } from "react"
import { Copy, Calendar, Pencil } from "lucide-react"
import type { SaldosBilaterales } from "@/types"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

// Genera opciones de año: 2 años atrás hasta 1 año adelante
function generarAnios(): number[] {
  const hoy = new Date().getFullYear()
  return [hoy - 2, hoy - 1, hoy, hoy + 1]
}

// Parsea "Mayo 2026" → { mes: 4, anio: 2026 } (mes 0-indexed)
function parsearPeriodo(label: string): { mes: number; anio: number } | null {
  if (!label) return null
  for (let i = 0; i < MESES.length; i++) {
    if (label.startsWith(MESES[i])) {
      const partes = label.trim().split(" ")
      const anio = parseInt(partes[partes.length - 1])
      if (!isNaN(anio)) return { mes: i, anio }
    }
  }
  return null
}

type Props = {
  saldos: SaldosBilaterales
  onChange: (s: SaldosBilaterales) => void
  periodoLabel: string
  onPeriodoChange: (s: string) => void
  onCopiarAnterior?: () => void
  copiarAnteriorLabel?: string
}

export default function EditorSaldos({
  saldos,
  onChange,
  periodoLabel,
  onPeriodoChange,
  onCopiarAnterior,
  copiarAnteriorLabel = "Copiar de mes anterior",
}: Props) {
  // Detectar si el periodo actual es formato estándar o libre
  const parsed = parsearPeriodo(periodoLabel)
  const [modoLibre, setModoLibre] = useState(!parsed && !!periodoLabel)

  const hoy = new Date()
  const [mesSelec, setMesSelec] = useState<number>(parsed?.mes ?? hoy.getMonth())
  const [anioSelec, setAnioSelec] = useState<number>(parsed?.anio ?? hoy.getFullYear())

  const anios = generarAnios()

  function handleMesChange(mes: number) {
    setMesSelec(mes)
    onPeriodoChange(`${MESES[mes]} ${anioSelec}`)
  }

  function handleAnioChange(anio: number) {
    setAnioSelec(anio)
    onPeriodoChange(`${MESES[mesSelec]} ${anio}`)
  }

  function activarModoLibre() {
    setModoLibre(true)
  }

  function activarModoSelector() {
    // Intentar parsear el texto libre, si no usar mes/año actual
    const p = parsearPeriodo(periodoLabel)
    const mes = p?.mes ?? hoy.getMonth()
    const anio = p?.anio ?? hoy.getFullYear()
    setMesSelec(mes)
    setAnioSelec(anio)
    onPeriodoChange(`${MESES[mes]} ${anio}`)
    setModoLibre(false)
  }

  const num = (v: number | string) => (v === 0 || v === "" ? "" : String(v))

  return (
    <div className="card space-y-5 mt-3">
      {/* Período */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Período *</label>
          <button
            type="button"
            onClick={modoLibre ? activarModoSelector : activarModoLibre}
            className="text-2xs text-ink-400 hover:text-accent flex items-center gap-1 underline"
          >
            {modoLibre
              ? <><Calendar size={11} /> Usar selector</>
              : <><Pencil size={11} /> Texto libre</>
            }
          </button>
        </div>

        {modoLibre ? (
          <input
            type="text"
            value={periodoLabel}
            onChange={e => onPeriodoChange(e.target.value)}
            placeholder="Ej: Mayo 2026, Q1 2026, etc."
            className="input"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={mesSelec}
              onChange={e => handleMesChange(Number(e.target.value))}
              className="input flex-1"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select
              value={anioSelec}
              onChange={e => handleAnioChange(Number(e.target.value))}
              className="input w-28"
            >
              {anios.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {/* Preview del label generado */}
            {periodoLabel && (
              <span className="text-xs text-ink-500 font-mono whitespace-nowrap">
                → {periodoLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Botón copiar de anterior */}
      {onCopiarAnterior && (
        <button
          type="button"
          onClick={onCopiarAnterior}
          className="btn btn-secondary text-xs w-full"
        >
          <Copy size={13} /> {copiarAnteriorLabel}
        </button>
      )}

      {/* Saldos iniciales */}
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">
          Saldos iniciales
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CampoImporte
            label="Saldo inicial Compañía ARS"
            value={saldos.inicial_compania_ars}
            onChange={v => onChange({ ...saldos, inicial_compania_ars: v })}
          />
          <CampoImporte
            label="Saldo inicial Compañía USD"
            value={saldos.inicial_compania_usd}
            onChange={v => onChange({ ...saldos, inicial_compania_usd: v })}
          />
          <CampoImporte
            label="Saldo inicial Contraparte ARS"
            value={saldos.inicial_contraparte_ars}
            onChange={v => onChange({ ...saldos, inicial_contraparte_ars: v })}
          />
          <CampoImporte
            label="Saldo inicial Contraparte USD"
            value={saldos.inicial_contraparte_usd}
            onChange={v => onChange({ ...saldos, inicial_contraparte_usd: v })}
          />
        </div>
      </div>

      {/* Saldos finales */}
      <div>
        <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">
          Saldos finales del período
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CampoImporte
            label="Saldo final Compañía ARS"
            value={saldos.final_compania_ars}
            onChange={v => onChange({ ...saldos, final_compania_ars: v })}
          />
          <CampoImporte
            label="Saldo final Compañía USD"
            value={saldos.final_compania_usd}
            onChange={v => onChange({ ...saldos, final_compania_usd: v })}
          />
          <CampoImporte
            label="Saldo final Contraparte ARS"
            value={saldos.final_contraparte_ars}
            onChange={v => onChange({ ...saldos, final_contraparte_ars: v })}
          />
          <CampoImporte
            label="Saldo final Contraparte USD"
            value={saldos.final_contraparte_usd}
            onChange={v => onChange({ ...saldos, final_contraparte_usd: v })}
          />
        </div>
      </div>

      {/* TC cierre */}
      <div className="w-48">
        <CampoImporte
          label="TC cierre (1 USD = $ ARS)"
          value={saldos.tc_cierre}
          onChange={v => onChange({ ...saldos, tc_cierre: v })}
          placeholder="Ej: 1050"
        />
      </div>
    </div>
  )
}

function CampoImporte({
  label, value, onChange, placeholder,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        value={value === 0 ? "" : value}
        onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder={placeholder ?? "0"}
        className="input"
      />
    </div>
  )
}
