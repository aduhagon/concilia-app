import { useEffect, useState } from "react"

/**
 * Hook que sincroniza un estado con localStorage.
 * Si recargás la página, recupera el último valor guardado.
 *
 * Usage:
 *   const [saldos, setSaldos] = usePersistedState("saldos-cargill-0126", SALDOS_VACIOS)
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const [state, setState] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)

  // Cargar en mount
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        setState(JSON.parse(raw))
      }
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [key])

  // Guardar en cada cambio
  useEffect(() => {
    if (!loaded || typeof window === "undefined") return
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore (cuota llena)
    }
  }, [key, state, loaded])

  function clear() {
    setState(initial)
    if (typeof window !== "undefined") localStorage.removeItem(key)
  }

  return [state, setState, clear]
}
