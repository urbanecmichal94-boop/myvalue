import { createClient } from '@/lib/supabase'

// Vrátí Supabase klienta + userId pokud je uživatel přihlášen.
// Používá getSession() — čte z cookie, bez síťového requestu.
export async function getDbClient() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return {
    supabase,
    userId: session?.user?.id ?? null,
  }
}
