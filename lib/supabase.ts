import { createBrowserClient } from '@supabase/ssr'

// ─── Browser klient (Client Components) ──────────────────────────────────────
// Vždy volat jako createClient() — nevytvářet singleton na module level
// (createBrowserClient používá browser APIs)

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
