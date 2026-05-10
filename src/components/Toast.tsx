"use client"

import { createContext, useContext, useState, useCallback } from "react"
import { CheckCircle2, AlertCircle, Info } from "lucide-react"

type Toast = { id: string; message: string; variant: "ok" | "error" | "info" }

const ToastContext = createContext<{ show: (msg: string, v?: Toast["variant"]) => void } | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, variant: Toast["variant"] = "info") => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, variant }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 text-sm shadow-lg flex items-center gap-2 fade-in min-w-[260px]
              ${t.variant === "ok" ? "bg-ok text-white" :
                t.variant === "error" ? "bg-danger text-white" :
                "bg-ink-900 text-white"}`}
          >
            {t.variant === "ok" && <CheckCircle2 size={14} />}
            {t.variant === "error" && <AlertCircle size={14} />}
            {t.variant === "info" && <Info size={14} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback: no-op si no hay provider
    return { show: (_msg: string, _v?: Toast["variant"]) => {} }
  }
  return ctx
}
