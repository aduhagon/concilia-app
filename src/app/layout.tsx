import "./globals.css"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "ConciliaApp",
  description: "Conciliación de cuentas corrientes",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="border-b border-ink-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-7 h-7 rounded bg-accent flex items-center justify-center">
                <span className="font-serif text-white text-sm font-medium">≡</span>
              </div>
              <div className="font-serif text-base font-medium tracking-tight">Concilia</div>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="btn btn-ghost">Inicio</Link>
              <Link href="/plantillas" className="btn btn-ghost">Plantillas</Link>
              <Link href="/conciliaciones" className="btn btn-ghost">Historial</Link>
              <Link href="/nueva" className="btn btn-primary ml-3">Nueva conciliación</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
