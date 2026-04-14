import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Server klient (Server Components, Route Handlers, Server Actions) ─────────

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies lze číst, ale ne zapisovat
          }
        },
      },
    },
  )
}

// ─── Pomocná funkce: vrátí přihlášeného uživatele nebo null ───────────────────

export async function getUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
