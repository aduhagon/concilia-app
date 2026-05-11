import "./globals.css"
import type { Metadata } from "next"
import Link from "next/link"
import { ToastProvider } from "@/components/Toast"
import HeaderUsuario from "@/components/HeaderUsuario"

export const metadata: Metadata = {
  title: "Concilia",
  description: "Conciliación de cuentas corrientes",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ToastProvider>
          <header className="border-b border-ink-200 bg-white h-14 sticky top-0 z-30">
            <div className="h-full px-4 flex items-center justify-between max-w-[1800px] mx-auto">
              <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-accent flex items-center justify-center">
                    <span className="text-white text-sm font-bold tracking-tighter">C</span>
                  </div>
                  <span className="font-semibold text-sm tracking-tight">Concilia</span>
                </Link>
                <nav className="flex items-center gap-1 text-xs">
                  <NavLink href="/">Inicio</NavLink>
                  <NavLink href="/plantillas">Plantillas</NavLink>
                  <NavLink href="/conciliaciones">Historial</NavLink>
                  <NavLink href="/supervisor">Tablero</NavLink>
                  <NavLink href="/usuarios">Usuarios</NavLink>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/nueva" className="btn btn-primary">
                  + Nueva conciliación
                </Link>
                <HeaderUsuario />
              </div>
            </div>
          </header>
          <main className="max-w-[1800px] mx-auto">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 text-ink-700 hover:text-ink-900 hover:bg-ink-100 transition-colors">
      {children}
    </Link>
  )
}
