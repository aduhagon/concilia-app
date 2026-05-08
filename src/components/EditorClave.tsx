"use client"
import type { ConstructorClave, OperacionClave } from "@/types"
import { Plus, X, GripVertical, Code } from "lucide-react"
import { previewClave } from "@/lib/constructor-clave"
import { useState } from "react"

type Props = {
  label: string
  constructor: ConstructorClave | undefined
  columnasDisponibles: string[]
  filaMuestra?: Record<string, unknown>
  onChange: (c: ConstructorClave) => void
}

const TIPOS_OP: { value: OperacionClave["op"]; label: string; help: string }[] = [
  { value: "campo", label: "Campo", help: "Tomar el valor de una columna" },
  { value: "literal", label: "Texto fijo", help: "Agregar un texto constante" },
  { value: "ultimos", label: "Últimos N", help: "Recortar al final" },
  { value: "primeros", label: "Primeros N", help: "Recortar al principio" },
  { value: "limpiar", label: "Limpiar", help: "Quitar guiones, espacios, etc." },
  { value: "regex", label: "Regex", help: "Extraer con expresión regular" },
]

export default function EditorClave({
  label,
  constructor,
  columnasDisponibles,
  filaMuestra,
  onChange,
}: Props) {
  const [modo, setModo] = useState<"visual" | "formula">(constructor?.tipo ?? "visual")
  const ops: OperacionClave[] = constructor?.tipo === "visual" ? constructor.operaciones : []

  function actualizarOps(nuevas: OperacionClave[]) {
    onChange({ tipo: "visual", operaciones: nuevas })
  }

  function agregar(tipo: OperacionClave["op"]) {
    const base: Record<OperacionClave["op"], OperacionClave> = {
      campo: { op: "campo", valor: columnasDisponibles[0] ?? "" },
      literal: { op: "literal", valor: "" },
      ultimos: { op: "ultimos", n: 6 },
      primeros: { op: "primeros", n: 6 },
      limpiar: { op: "limpiar", quitar: ["-", " ", "."] },
      regex: { op: "regex", patron: "\\d+", grupo: 0 },
    }
    actualizarOps([...ops, base[tipo]])
  }

  function quitar(idx: number) {
    actualizarOps(ops.filter((_, i) => i !== idx))
  }

  function modificar(idx: number, nueva: OperacionClave) {
    const c = [...ops]
    c[idx] = nueva
    actualizarOps(c)
  }

  function mover(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= ops.length) return
    const c = [...ops]
    ;[c[idx], c[j]] = [c[j], c[idx]]
    actualizarOps(c)
  }

  // Preview
  const preview = filaMuestra
    ? previewClave(filaMuestra, { tipo: "visual", operaciones: ops })
    : { resultado: "", pasos: [] }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="label">{label}</div>
        <button
          type="button"
          onClick={() => setModo(modo === "visual" ? "formula" : "visual")}
          className="text-2xs text-ink-500 hover:text-accent flex items-center gap-1 uppercase tracking-wider"
        >
          <Code size={12} />
          {modo === "visual" ? "Modo fórmula" : "Modo visual"}
        </button>
      </div>

      {modo === "visual" ? (
        <>
          <div className="space-y-1.5">
            {ops.length === 0 && (
              <div className="text-xs text-ink-400 italic px-3 py-4 border border-dashed border-ink-200 rounded-md text-center">
                Sin operaciones aún. Agregá una para empezar a construir la clave.
              </div>
            )}
            {ops.map((op, idx) => (
              <FilaOperacion
                key={idx}
                op={op}
                columnas={columnasDisponibles}
                onChange={(nueva) => modificar(idx, nueva)}
                onRemove={() => quitar(idx)}
                onMoveUp={() => mover(idx, -1)}
                onMoveDown={() => mover(idx, 1)}
              />
            ))}
          </div>

          {/* Botones para agregar */}
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_OP.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => agregar(t.value)}
                className="text-2xs px-2 py-1 rounded border border-ink-200 hover:border-accent hover:text-accent text-ink-600 flex items-center gap-1"
                title={t.help}
              >
                <Plus size={11} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Preview con datos reales */}
          {filaMuestra && (
            <div className="bg-ink-50 border border-ink-200 rounded-md p-3 space-y-2">
              <div className="text-2xs uppercase tracking-wider text-ink-500">Preview con primera fila</div>
              <div className="space-y-1">
                {preview.pasos.length === 0 ? (
                  <div className="text-xs text-ink-400">—</div>
                ) : (
                  preview.pasos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-500">{i + 1}. {p.op}</span>
                      <span className="font-mono text-ink-700 truncate">{p.salida || "(vacío)"}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-ink-200 pt-2 flex items-center justify-between">
                <span className="text-2xs uppercase tracking-wider text-ink-500">Resultado</span>
                <span className="font-mono text-sm font-medium text-accent">
                  {preview.resultado || "(vacío)"}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card-tight">
          <div className="text-xs text-ink-500 mb-2">
            Modo fórmula — disponible próximamente. Por ahora usá el modo visual.
          </div>
          <div className="font-mono text-xs text-ink-400 px-3 py-2 bg-ink-50 rounded border border-ink-200">
            =CONCAT(SUCURSAL; COMPROBANTE)
          </div>
        </div>
      )}
    </div>
  )
}

// ----- FilaOperacion: edita una operación individual -----

function FilaOperacion({
  op,
  columnas,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  op: OperacionClave
  columnas: string[]
  onChange: (op: OperacionClave) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-ink-200 rounded-md">
      <button
        onClick={onMoveUp}
        type="button"
        className="text-ink-400 hover:text-ink-700"
        title="Subir"
      >
        <GripVertical size={14} />
      </button>

      <span className="text-2xs uppercase tracking-wider text-ink-500 w-16 flex-shrink-0">
        {TIPOS_OP.find((t) => t.value === op.op)?.label}
      </span>

      <div className="flex-1 flex items-center gap-2 min-w-0">
        {op.op === "campo" && (
          <>
            <select
              value={op.valor}
              onChange={(e) => onChange({ ...op, valor: e.target.value })}
              className="input text-xs flex-1 min-w-0"
            >
              {columnas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              placeholder="Pad"
              value={op.padding ?? ""}
              onChange={(e) => onChange({ ...op, padding: e.target.value ? Number(e.target.value) : undefined })}
              className="input text-xs w-16 flex-shrink-0"
              title="Rellenar con ceros a la izquierda hasta N dígitos"
            />
          </>
        )}
        {op.op === "literal" && (
          <input
            value={op.valor}
            onChange={(e) => onChange({ ...op, valor: e.target.value })}
            placeholder="Texto"
            className="input text-xs flex-1"
          />
        )}
        {(op.op === "ultimos" || op.op === "primeros") && (
          <input
            type="number"
            min={1}
            value={op.n}
            onChange={(e) => onChange({ ...op, n: Number(e.target.value) })}
            className="input text-xs w-24"
          />
        )}
        {op.op === "limpiar" && (
          <input
            value={(op.quitar ?? []).join(" ")}
            onChange={(e) => onChange({ ...op, quitar: e.target.value.split(" ").filter(Boolean) })}
            placeholder="- . / espacio"
            className="input text-xs flex-1 font-mono"
          />
        )}
        {op.op === "regex" && (
          <>
            <input
              value={op.patron}
              onChange={(e) => onChange({ ...op, patron: e.target.value })}
              placeholder="\\d+"
              className="input text-xs flex-1 font-mono"
            />
            <input
              type="number"
              value={op.grupo ?? 0}
              onChange={(e) => onChange({ ...op, grupo: Number(e.target.value) })}
              className="input text-xs w-14"
              title="Grupo de captura"
            />
          </>
        )}
      </div>

      <button
        onClick={onRemove}
        type="button"
        className="text-ink-400 hover:text-error"
      >
        <X size={14} />
      </button>
    </div>
  )
}
