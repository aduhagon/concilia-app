export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // El login no usa el header principal — tiene su propia pantalla completa
  return <>{children}</>
}