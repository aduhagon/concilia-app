import { useEffect } from "react"

export type Shortcut = {
  key: string                          // ej "j", "1", "ArrowDown", "Enter"
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean                       // Cmd en Mac
  description: string
  group?: string                       // ej "Navegación", "Selección"
  handler: (e: KeyboardEvent) => void
  // Si true, también dispara cuando el foco está en un input (cuidado!)
  inInputs?: boolean
}

/**
 * Hook que registra atajos de teclado.
 * Por defecto los atajos NO se disparan cuando el foco está en un input/textarea/select,
 * a menos que `inInputs: true`.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return

    function handler(e: KeyboardEvent) {
      // Detectar si estamos en un input
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable

      for (const s of shortcuts) {
        if (s.key.toLowerCase() !== e.key.toLowerCase()) continue
        if ((s.ctrl ?? false) !== e.ctrlKey) continue
        if ((s.shift ?? false) !== e.shiftKey) continue
        if ((s.alt ?? false) !== e.altKey) continue
        if ((s.meta ?? false) !== e.metaKey) continue
        if (inInput && !s.inInputs) continue

        e.preventDefault()
        s.handler(e)
        return
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [shortcuts, enabled])
}

/**
 * Formatea un atajo para mostrarlo en UI.
 * Ej: { key: "s", ctrl: true } → "Ctrl + S"
 */
export function formatShortcut(s: Pick<Shortcut, "key" | "ctrl" | "shift" | "alt" | "meta">): string {
  const parts = []
  if (s.ctrl) parts.push("Ctrl")
  if (s.shift) parts.push("Shift")
  if (s.alt) parts.push("Alt")
  if (s.meta) parts.push("⌘")
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key)
  return parts.join(" + ")
}
