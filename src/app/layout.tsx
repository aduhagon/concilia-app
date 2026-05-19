import "./globals.css"
import type { Metadata } from "next"
import { ToastProvider } from "@/components/Toast"
import ThemeProvider from "@/components/ThemeProvider"
import DynamicHeader from "@/components/DynamicHeader"
import { UserProvider } from "@/lib/user-context"

export const metadata: Metadata = {
  title: "Concilia",
  description: "Conciliación de cuentas corrientes",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ThemeProvider>
          <ToastProvider>
            <UserProvider>
              <DynamicHeader />
              <main className="max-w-[1800px] mx-auto">{children}</main>
            </UserProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
