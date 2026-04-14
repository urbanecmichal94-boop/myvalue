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

// ─── Makro data (server-side, volá se z Route Handlers) ──────────────────────

export interface MacroRow {
  region:   string   // 'CZ' | 'EU' | 'US'
  category: string   // 'cnb' | 'markets' | 'fred'
  key:      string   // 'eurCzk' | 'oilWti' | 'cpiCz' atd.
  value:    number
  unit:     string
  date:     string   // YYYY-MM-DD
}

export async function upsertMacroRows(rows: MacroRow[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('macro_data')
    .upsert(rows, { onConflict: 'region,category,key,date' })
  if (error) throw error
}

export async function getMacroRows(
  region: string,
  category: string,
  keys: string[],
  fromDate: string,
): Promise<MacroRow[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('macro_data')
    .select('region,category,key,value,unit,date')
    .eq('region', region)
    .eq('category', category)
    .in('key', keys)
    .gte('date', fromDate)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as MacroRow[]
}
