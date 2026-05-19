"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

export type EtapaProceso =
  | "idle"
  | "leyendo_compania"
  | "leyendo_contraparte"
  | "normalizando"
  | "conciliando"
  | "listo"
  | "error"

type Etapa = {
  id: EtapaProceso
  label: string
  detalle: string
}

const ETAPAS: Etapa[] = [
  { id: "leyendo_compania",   label: "Leyendo archivo de compañía",   detalle: "Extrayendo filas del Excel…" },
  { id: "leyendo_contraparte",label: "Leyendo archivo de contraparte", detalle: "Extrayendo filas del Excel…" },
  { id: "normalizando",       label: "Normalizando movimientos",       detalle: "Estandarizando fechas, importes y comprobantes…" },
  { id: "conciliando",        label: "Ejecutando motor de conciliación", detalle: "Buscando matches por nivel…" },
]

type Props = {
  etapa: EtapaProceso
  filasCompania?: number
  filasContraparte?: number
}

export default function ProgresoEjecucion({ etapa, filasCompania, filasContraparte }: Props) {
  if (etapa === "idle") return null

  const idxActual = ETAPAS.findIndex(e => e.id === etapa)

  return (
    <div className="card p-5 space-y-4">
      <div className="text-sm font-semibold text-ink-700">Procesando conciliación…</div>

      <div className="space-y-3">
        {ETAPAS.map((e, idx) => {
          const completada = idxActual > idx || etapa === "listo"
          const activa = idxActual === idx && etapa !== "listo"
          const pendiente = idxActual < idx && etapa !== "listo"

          return (
            <div key={e.id} className="flex items-start gap-3">
              {/* Ícono de estado */}
              <div className="flex-shrink-0 mt-0.5">
                {completada ? (
                  <CheckCircle2 size={16} className="text-ok" />
                ) : activa ? (
                  <Loader2 size={16} className="text-accent animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-ink-200" />
                )}
              </div>

              {/* Texto */}
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium ${
                  completada ? "text-ok" :
                  activa    ? "text-ink-900" :
                  "text-ink-400"
                }`}>
                  {e.label}
                  {/* Mostrar cantidad de filas cuando corresponde */}
                  {completada && e.id === "leyendo_compania" && filasCompania !== undefined && (
                    <span className="font-mono font-normal ml-1 text-ink-400">
                      — {filasCompania.toLocaleString("es-AR")} filas
                    </span>
                  )}
                  {completada && e.id === "leyendo_contraparte" && filasContraparte !== undefined && (
                    <span className="font-mono font-normal ml-1 text-ink-400">
                      — {filasContraparte.toLocaleString("es-AR")} filas
                    </span>
                  )}
                </div>
                {activa && (
                  <div className="text-2xs text-ink-400 mt-0.5">{e.detalle}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Barra de progreso */}
      <div className="h-1 bg-ink-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{
            width: etapa === "listo" ? "100%" :
                   idxActual < 0 ? "0%" :
                   `${Math.round(((idxActual) / ETAPAS.length) * 100)}%`
          }}
        />
      </div>
    </div>
  )
}
