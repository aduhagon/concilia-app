"use client"

import { X } from "lucide-react"

type Item = { keys: string; description: string; group?: string }

type Props = {
  visible: boolean
  onClose: () => void
  shortcuts: Item[]
}

export default function ShortcutHelp({ visible, onClose, shortcuts }: Props) {
  if (!visible) return null

  // Agrupar
  const grupos: Record<string, Item[]> = {}
  for (const s of shortcuts) {
    const g = s.group ?? "General"
    if (!grupos[g]) grupos[g] = []
    grupos[g].push(s)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-950/40 flex items-center justify-center p-4 fade-in" onClick={onClose}>
      <div
        className="bg-white border border-ink-200 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3 sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold">Atajos de teclado</h3>
          <button onClick={onClose} className="btn btn-ghost p-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {Object.entries(grupos).map(([g, items]) => (
            <div key={g}>
              <div className="text-2xs uppercase tracking-wider text-ink-500 font-semibold mb-2">{g}</div>
              <table className="w-full">
                <tbody>
                  {items.map((s, i) => (
                    <tr key={i} className="border-b border-ink-100 last:border-0">
                      <td className="py-1.5 text-sm text-ink-700">{s.description}</td>
                      <td className="py-1.5 text-right">
                        {s.keys.split(" / ").map((k, j) => (
                          <span key={j}>
                            {j > 0 && <span className="text-ink-400 mx-1">o</span>}
                            {k.split(" + ").map((kp, l) => (
                              <span key={l}>
                                {l > 0 && <span className="text-ink-400 mx-0.5">+</span>}
                                <span className="kbd">{kp}</span>
                              </span>
                            ))}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="text-2xs text-ink-500 border-t border-ink-200 pt-3">
            Tip: presioná <span className="kbd">?</span> en cualquier momento para ver esta ayuda.
          </div>
        </div>
      </div>
    </div>
  )
}
