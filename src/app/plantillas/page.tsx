"use client"

export const dynamic = "force-dynamic"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase-client"
import { Plus, Settings, Building2 } from "lucide-react"

type Item = {
  id: string
  nombre: string
  cuit: string | null
  plantilla_id?: string
}

export default function PlantillasPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [creando, setCreando] = useState(false)

  async function cargar() {
    setLoading(true)
    const { data: contras } = await supabase
      .from("contrapartes")
      .select("id, nombre, cuit, plantillas_proveedor(id)")
      .order("nombre")

    const items: Item[] = (contras ?? []).map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      cuit: c.cuit,
      plantilla_id: c.plantillas_proveedor?.[0]?.id,
    }))
    setItems(items)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function crearContraparte() {
    if (!nuevoNombre.trim()) return
    setCreando(true)
    const { data: empresa } = await supabase.from("empresas").select("id").limit(1).single()
    const { data: nueva, error } = await supabase
      .from("contrapartes")
      .insert({ nombre: nuevoNombre.trim(), empresa_id: empresa?.id, tipo: "proveedor" })
      .select()
      .single()

    if (!error && nueva) {
      // crear plantilla vacía asociada
      await supabase.from("plantillas_proveedor").insert({ contraparte_id: nueva.id })
      setNuevoNombre("")
      cargar()
    }
    setCreando(false)
  }

  return (
    <div className="px-6 py-6 space-y-8">
      <div className="flex items-end justify-between border-b border-ink-200 pb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-2">Plantillas</div>
          <h1 className="h-page">Plantillas de proveedor</h1>
          <p className="text-ink-600 mt-2 text-sm max-w-xl">
            Cada proveedor tiene su receta: mapeo de columnas, equivalencia de tipos y construcción
            de claves para matchear.
          </p>
        </div>
      </div>

      {/* Crear nueva */}
      <div className="card">
        <div className="text-2xs uppercase tracking-wider text-ink-500 mb-2">Agregar proveedor</div>
        <div className="flex items-center gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre del proveedor (ej. Cargill, Bunge, ACA)"
            className="input flex-1"
            onKeyDown={(e) => e.key === "Enter" && crearContraparte()}
          />
          <button
            onClick={crearContraparte}
            disabled={creando || !nuevoNombre.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            <Plus size={14} />
            Agregar
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-ink-400 text-center py-8">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 size={32} className="mx-auto text-ink-300 mb-3" />
          <div className="text-base font-semibold">Sin proveedores aún</div>
          <p className="text-sm text-ink-500 mt-1">Agregá el primero usando el formulario de arriba.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/plantillas/${item.id}`}
              className="card flex items-center justify-between hover:border-accent transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-accent-light flex items-center justify-center text-accent">
                  <Building2 size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold">{item.nombre}</div>
                  <div className="text-xs text-ink-500">
                    {item.cuit ?? "Sin CUIT"} · {item.plantilla_id ? "Con plantilla" : "Sin plantilla"}
                  </div>
                </div>
              </div>
              <Settings size={16} className="text-ink-400 group-hover:text-accent transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
