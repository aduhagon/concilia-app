"use client"
import Link from "next/link"
import { FileSpreadsheet, Layers, ArrowRight, Zap } from "lucide-react"

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero editorial */}
      <section className="grid grid-cols-12 gap-8 items-end pb-8 border-b border-ink-200">
        <div className="col-span-12 md:col-span-8">
          <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-3">
            Conciliación de cuentas corrientes
          </div>
          <h1 className="font-serif text-5xl font-medium tracking-tight leading-[1.05] text-ink-900">
            Tus claves de Excel,<br />
            <span className="italic text-accent">guardadas y aplicadas</span>{" "}
            automáticamente.
          </h1>
          <p className="mt-5 text-ink-600 text-base max-w-xl leading-relaxed">
            Definí una vez cómo armás la clave de match para cada proveedor. La aplicación
            la reconstruye en cada conciliación y te muestra qué quedó pendiente.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 text-right">
          <div className="inline-flex items-baseline gap-2">
            <span className="font-mono text-5xl font-medium text-accent tabular-nums">v2</span>
            <span className="text-2xs text-ink-500 uppercase tracking-wider">build</span>
          </div>
        </div>
      </section>

      {/* Tarjetas de acción */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/plantillas"
          className="card hover:border-accent transition-colors group"
        >
          <Layers size={20} className="text-accent" />
          <div className="font-serif text-lg mt-4 mb-1">Plantillas de proveedor</div>
          <p className="text-sm text-ink-500 leading-relaxed">
            Configurá cómo conciliás contra cada proveedor: mapeo de columnas, reglas de tipos,
            constructor de claves.
          </p>
          <div className="flex items-center gap-1 mt-5 text-sm text-accent font-medium">
            Configurar <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        <Link
          href="/nueva"
          className="card bg-accent text-white border-accent hover:bg-accent-dark transition-colors group"
        >
          <Zap size={20} className="text-accent-light" />
          <div className="font-serif text-lg mt-4 mb-1">Nueva conciliación</div>
          <p className="text-sm text-white/80 leading-relaxed">
            Subí los dos Excels (compañía + proveedor), elegí la plantilla guardada y conciliá.
          </p>
          <div className="flex items-center gap-1 mt-5 text-sm font-medium">
            Empezar <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        <Link
          href="/conciliaciones"
          className="card hover:border-accent transition-colors group"
        >
          <FileSpreadsheet size={20} className="text-accent" />
          <div className="font-serif text-lg mt-4 mb-1">Historial</div>
          <p className="text-sm text-ink-500 leading-relaxed">
            Conciliaciones anteriores. Re-exportá Excel, revisá saldos y ajustes pendientes.
          </p>
          <div className="flex items-center gap-1 mt-5 text-sm text-accent font-medium">
            Ver historial <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </section>

      {/* Cómo funciona */}
      <section className="border-t border-ink-200 pt-10">
        <div className="text-2xs uppercase tracking-[0.2em] text-ink-500 mb-6">
          Cómo funciona
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
          {[
            { n: "01", t: "Plantilla", d: "Configurás una plantilla por proveedor: mapeo, tipos, claves." },
            { n: "02", t: "Carga", d: "Subís los dos Excels del período (compañía + proveedor)." },
            { n: "03", t: "Match", d: "El motor aplica la plantilla y arma claves automáticamente." },
            { n: "04", t: "Resultado", d: "Conciliados, diferencias y pendientes — exportable a Excel." },
          ].map((s) => (
            <li key={s.n} className="border-l-2 border-ink-200 pl-4">
              <div className="font-mono text-2xs text-ink-400 tracking-wider">{s.n}</div>
              <div className="font-serif text-base mt-1">{s.t}</div>
              <p className="text-sm text-ink-500 mt-1 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
