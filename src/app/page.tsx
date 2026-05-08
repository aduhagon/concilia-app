"use client"
import Link from "next/link"
import { ArrowRight, Plus, RefreshCw, FileSpreadsheet, Users, Settings } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw size={20} className="text-brand" />
          <span className="font-semibold text-base">ConciliaApp</span>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/" className="btn text-gray-500">Dashboard</Link>
          <Link href="/conciliaciones" className="btn text-gray-500">Conciliaciones</Link>
          <Link href="/maestro" className="btn text-gray-500">Maestro</Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Bienvenido</h1>
          <p className="text-gray-500 text-sm mt-1">Conciliación de cuentas corrientes — PyMEs</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-4">
          <Link href="/nueva" className="card hover:border-brand hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-3">
              <Plus size={20} className="text-brand" />
              <ArrowRight size={14} className="text-gray-300 group-hover:text-brand transition-colors" />
            </div>
            <div className="font-medium">Nueva conciliación</div>
            <div className="text-xs text-gray-400 mt-1">Cargá archivos y conciliá</div>
          </Link>
          <Link href="/maestro" className="card hover:border-brand hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-3">
              <FileSpreadsheet size={20} className="text-gray-400" />
              <ArrowRight size={14} className="text-gray-300 group-hover:text-brand transition-colors" />
            </div>
            <div className="font-medium">Maestro equivalencias</div>
            <div className="text-xs text-gray-400 mt-1">Configurá conceptos y tipos</div>
          </Link>
          <Link href="/conciliaciones" className="card hover:border-brand hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-3">
              <Users size={20} className="text-gray-400" />
              <ArrowRight size={14} className="text-gray-300 group-hover:text-brand transition-colors" />
            </div>
            <div className="font-medium">Historial</div>
            <div className="text-xs text-gray-400 mt-1">Ver conciliaciones anteriores</div>
          </Link>
        </div>

        {/* Recent */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">Últimas conciliaciones</h2>
            <Link href="/conciliaciones" className="text-xs text-brand hover:underline">Ver todas</Link>
          </div>
          <div className="text-center py-8 text-gray-400 text-sm">
            <RefreshCw size={24} className="mx-auto mb-2 text-gray-200" />
            Todavía no hay conciliaciones. <Link href="/nueva" className="text-brand hover:underline">Crear la primera</Link>
          </div>
        </div>

        {/* Setup reminder */}
        <div className="bg-brand-light border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <Settings size={18} className="text-brand mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-green-800 text-sm">Configuración inicial</div>
            <div className="text-xs text-green-700 mt-1">
              Antes de tu primera conciliación, cargá el{" "}
              <Link href="/maestro" className="underline font-medium">maestro de equivalencias</Link>{" "}
              con los conceptos de tu ERP (Tango, SAP, etc.). Esto se guarda y no lo volvés a cargar.
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
