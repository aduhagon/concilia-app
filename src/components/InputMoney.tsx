"use client"

import { useState, useEffect } from "react"
import { formatNum, parseNumInput } from "@/lib/format"

type Props = {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
  large?: boolean
  prefix?: string         // ej "USD" / "ARS"
}

/**
 * Input para importes con:
 *  - Formato AR mientras escribís: 23.061.058.962,99
 *  - Acepta pegar valores con cualquier formato (AR, US, mixed)
 *  - Mantiene el cursor estable
 */
export default function InputMoney({ value, onChange, placeholder, className = "", large, prefix }: Props) {
  // Estado local del texto visible
  const [display, setDisplay] = useState(value === 0 ? "" : formatNum(value))
  const [editing, setEditing] = useState(false)

  // Sincronizar cuando el valor externo cambia (ej: copiar de mes anterior)
  useEffect(() => {
    if (!editing) {
      setDisplay(value === 0 ? "" : formatNum(value))
    }
  }, [value, editing])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDisplay(raw)
    const num = parseNumInput(raw)
    onChange(num)
  }

  function handleBlur() {
    setEditing(false)
    // Re-formatear al perder foco
    const num = parseNumInput(display)
    setDisplay(num === 0 && display !== "0" ? "" : formatNum(num))
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setEditing(true)
    e.target.select()
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-2xs uppercase tracking-wider text-ink-400 pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder ?? "0,00"}
        className={`input font-mono tabular-nums text-right
          ${large ? "input-lg text-base font-semibold" : "text-sm"}
          ${prefix ? "pl-12" : ""}
          ${className}`}
      />
    </div>
  )
}
