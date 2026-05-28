'use client'

// components/ProbarClavePanel.tsx
//
// Panel que muestra el resultado de probar los constructores de clave
// contra movimientos reales. Se monta dentro del EditorClave cuando el
// metodo_match de la regla es 'clave'.
//
// Props:
//   contraparteId       — UUID de la contraparte
//   constructorCompania — ConstructorClave del lado compania (en edicion)
//   constructorContraparte — ConstructorClave del lado contraparte (en edicion)
//   className           — opcional, clase extra para el wrapper

import { useState } from 'react'
import { FlaskConical, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

// ── Tipos locales (duplicados del lib para no importar server-only en cliente) ─

interface OperacionClave {
  op: 'campo' | 'literal' | 'ultimos' | 'primeros' | 'regex' | 'limpiar'
  valor?: string
  n?: number
  patron?: string
  quitar?: string[]
}

interface ConstructorClave {
  operaciones: OperacionClave[]
}

interface ResultadoPrueba {
  comprobante_raw: string
  fecha: string
  tipo_original: string
  importe_ars: number | null
  clave_calculada: string | null
  error?: string
}

interface ResultadoProbarClave {
  compania: ResultadoPrueba[]
  contraparte: ResultadoPrueba[]
  total_compania: number
  total_contraparte: number
}

interface Props {
  contraparteId: string
  constructorCompania: ConstructorClave
  constructorContraparte: ConstructorClave
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatImporte(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

// Cuenta cuantas claves de compania coinciden con alguna de contraparte
function calcularCoincidencias(
  compania: ResultadoPrueba[],
  contraparte: ResultadoPrueba[]
): number {
  const setContraparte = new Set(
    contraparte
      .map((r) => r.clave_calculada)
      .filter((c): c is string => !!c && c.trim() !== '')
  )
  return compania.filter(
    (r) => r.clave_calculada && setContraparte.has(r.clave_calculada)
  ).length
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ProbarClavePanel({
  contraparteId,
  constructorCompania,
  constructorContraparte,
  className = '',
}: Props) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'ok' | 'error'>('idle')
  const [resultado, setResultado] = useState<ResultadoProbarClave | null>(null)
  const [mensajeError, setMensajeError] = useState('')

  const probar = async () => {
    setEstado('cargando')
    setResultado(null)
    setMensajeError('')

    try {
      const res = await fetch(`/plantillas/${contraparteId}/probar-clave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contraparte_id: contraparteId,
          constructor_compania: constructorCompania,
          constructor_contraparte: constructorContraparte,
          limite: 20,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `Error ${res.status}`)
      }

      const data: ResultadoProbarClave = await res.json()
      setResultado(data)
      setEstado('ok')
    } catch (e: any) {
      setMensajeError(e?.message ?? 'Error desconocido')
      setEstado('error')
    }
  }

  const sinMovimientos =
    estado === 'ok' &&
    resultado &&
    resultado.total_compania === 0 &&
    resultado.total_contraparte === 0

  const coincidencias =
    resultado ? calcularCoincidencias(resultado.compania, resultado.contraparte) : 0

  const pctCoincidencia =
    resultado && resultado.total_compania > 0
      ? Math.round((coincidencias / resultado.total_compania) * 100)
      : null

  return (
    <div className={`rounded-lg border border-border bg-card ${className}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FlaskConical size={16} className="text-muted-foreground" />
          Probar clave
        </div>
        <button
          onClick={probar}
          disabled={estado === 'cargando'}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {estado === 'cargando' ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Calculando...
            </>
          ) : (
            <>
              <FlaskConical size={12} />
              Probar clave
            </>
          )}
        </button>
      </div>

      {/* ── Estado idle ── */}
      {estado === 'idle' && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          Hace click en <span className="font-medium text-foreground">Probar clave</span> para
          ver cómo quedan las claves calculadas sobre los últimos 20 comprobantes reales de cada
          lado.
        </div>
      )}

      {/* ── Error ── */}
      {estado === 'error' && (
        <div className="flex items-start gap-3 px-4 py-4 text-sm text-destructive">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <span>{mensajeError}</span>
        </div>
      )}

      {/* ── Sin movimientos previos ── */}
      {sinMovimientos && (
        <div className="flex items-start gap-3 px-4 py-4 text-sm text-muted-foreground">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-yellow-500" />
          <span>
            Esta contraparte no tiene conciliaciones previas con movimientos cargados. La clave se
            podrá verificar una vez que se ejecute la primera conciliación.
          </span>
        </div>
      )}

      {/* ── Resultado ── */}
      {estado === 'ok' && resultado && !sinMovimientos && (
        <div className="px-4 py-4 space-y-4">
          {/* Resumen de coincidencias */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
            {pctCoincidencia !== null && pctCoincidencia >= 80 ? (
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-yellow-500 shrink-0" />
            )}
            <span className="text-sm">
              <span className="font-medium">
                {coincidencias} de {resultado.total_compania}
              </span>{' '}
              claves de compañía coinciden con contraparte
              {pctCoincidencia !== null && (
                <span className="ml-1 text-muted-foreground">({pctCoincidencia}%)</span>
              )}
            </span>
          </div>

          {/* Tablas lado a lado */}
          <div className="grid grid-cols-2 gap-4">
            {/* Compañia */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Compañía ({resultado.total_compania})
              </p>
              <TablaClaves filas={resultado.compania} claveSet={
                new Set(resultado.contraparte.map(r => r.clave_calculada ?? '').filter(Boolean))
              } />
            </div>

            {/* Contraparte */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Contraparte ({resultado.total_contraparte})
              </p>
              <TablaClaves filas={resultado.contraparte} claveSet={
                new Set(resultado.compania.map(r => r.clave_calculada ?? '').filter(Boolean))
              } />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Mostrando los últimos {Math.max(resultado.total_compania, resultado.total_contraparte)} movimientos
            con comprobante. Las claves resaltadas en verde aparecen en ambos lados.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sub-componente tabla ──────────────────────────────────────────────────────

function TablaClaves({
  filas,
  claveSet,
}: {
  filas: ResultadoPrueba[]
  claveSet: Set<string>
}) {
  if (filas.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-3 text-center border border-border rounded-md">
        Sin movimientos
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/60 border-b border-border">
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Comprobante</th>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Clave</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => {
            const coincide = !!fila.clave_calculada && claveSet.has(fila.clave_calculada)
            const tieneError = !!fila.error
            return (
              <tr
                key={i}
                className={`border-b border-border/60 last:border-0 ${
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                }`}
              >
                <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground max-w-[120px] truncate">
                  {fila.comprobante_raw}
                </td>
                <td className="px-2 py-1.5">
                  {tieneError ? (
                    <span className="text-destructive flex items-center gap-1">
                      <XCircle size={11} />
                      <span className="truncate max-w-[100px]">{fila.error}</span>
                    </span>
                  ) : (
                    <span
                      className={`font-mono font-medium ${
                        coincide
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-foreground'
                      }`}
                    >
                      {fila.clave_calculada || '—'}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
