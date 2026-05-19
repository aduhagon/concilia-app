"use client"

import { useState } from "react"

// Definición centralizada de categorías.
// Fuente: Manual A-MP-08-03, sección 6.1.1.
export const CAT_CONFIG: Record<string, {
  color: string
  frecuencia: string
  descripcion: string
  validacion: string
  criterio: string
}> = {
  A: {
    color: "bg-danger-light text-danger",
    frecuencia: "Semanal + mensual",
    descripcion: "Monto > USD 7.425 y más de 60 movimientos",
    validacion: "Confirmación de tercero",
    criterio: "Punteo diario · conciliación mensual",
  },
  B: {
    color: "bg-warn-light text-warn",
    frecuencia: "Mensual",
    descripcion: "Monto > USD 49.504 (sin cumplir criterio A)",
    validacion: "Confirmación de tercero",
    criterio: "Punteo y conciliación mensual",
  },
  C: {
    color: "bg-yellow-50 text-yellow-700",
    frecuencia: "Anual",
    descripcion: "No cumple criterios A, B, D ni E",
    validacion: "Confirmación de tercero",
    criterio: "Punteo y conciliación anual",
  },
  D: {
    color: "bg-ok-light text-ok",
    frecuencia: "Anual",
    descripcion: "Monto < USD 495 y menos de 10 movimientos",
    validacion: "Procedimiento alternativo",
    criterio: "Punteo y conciliación anual",
  },
  E: {
    color: "bg-info-light text-info",
    frecuencia: "Manual",
    descripcion: "Fuera del alcance del procedimiento",
    validacion: "No aplica",
    criterio: "Sin periodicidad automática",
  },
  F: {
    color: "bg-ink-100 text-ink-500",
    frecuencia: "Manual",
    descripcion: "Asignación específica por responsable",
    validacion: "No aplica",
    criterio: "Sin periodicidad automática",
  },
}

// Colores exportados para compatibilidad con código existente
export const CAT_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(CAT_CONFIG).map(([k, v]) => [k, v.color])
)

// Frecuencias exportadas para compatibilidad con código existente
export const CAT_FREQ: Record<string, string> = Object.fromEntries(
  Object.entries(CAT_CONFIG).map(([k, v]) => [k, v.frecuencia])
)

type Props = {
  categoria: string
  className?: string
}

export default function CategoriaBadge({ categoria, className = "" }: Props) {
  const [visible, setVisible] = useState(false)
  const cfg = CAT_CONFIG[categoria]
  if (!cfg) return null

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span
        tabIndex={0}
        className={`text-2xs font-bold px-1.5 py-0.5 rounded font-mono cursor-default select-none ${cfg.color} ${className}`}
        aria-label={`Categoría ${categoria}: ${cfg.descripcion}`}
      >
        {categoria}
      </span>

      {visible && (
        <div
          className="absolute z-50 bottom-full left-1/2 mb-2 w-56 bg-white border border-ink-200 shadow-md rounded p-3 text-left pointer-events-none"
          style={{ transform: "translateX(-50%)" }}
          role="tooltip"
        >
          {/* Flecha */}
          <div
            className="absolute left-1/2 top-full -mt-px border-4 border-transparent border-t-ink-200"
            style={{ transform: "translateX(-50%)" }}
          />
          <div
            className="absolute left-1/2 top-full -mt-0.5 border-4 border-transparent border-t-white"
            style={{ transform: "translateX(-50%)" }}
          />

          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono ${cfg.color}`}>
              {categoria}
            </span>
            <span className="text-xs font-semibold text-ink-800">{cfg.frecuencia}</span>
          </div>

          <div className="space-y-1.5 text-2xs text-ink-600 leading-relaxed">
            <div>
              <span className="text-ink-400 uppercase tracking-wide" style={{ fontSize: "10px" }}>Criterio</span>
              <p className="text-ink-700">{cfg.descripcion}</p>
            </div>
            <div>
              <span className="text-ink-400 uppercase tracking-wide" style={{ fontSize: "10px" }}>Periodicidad</span>
              <p className="text-ink-700">{cfg.criterio}</p>
            </div>
            <div>
              <span className="text-ink-400 uppercase tracking-wide" style={{ fontSize: "10px" }}>Validación</span>
              <p className="text-ink-700">{cfg.validacion}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
