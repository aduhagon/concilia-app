import { createBrowserClient } from "@supabase/ssr"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

// createBrowserClient de @supabase/ssr guarda la sesión en cookies
// lo que permite que el middleware del servidor la lea correctamente.
// Es un drop-in replacement de createClient — la API es idéntica.
export const supabase = createBrowserClient(url, anonKey)