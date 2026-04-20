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

// ─── Sdílená cache historických cen aktiv ─────────────────────────────────────

export interface PriceHistoryRow {
  ticker:   string   // kanonický ticker (XAU, bitcoin, AAPL…)
  month:    string   // 'YYYY-MM'
  price:    number
  currency: string   // 'USD'
}

/**
 * Načte záznamy pro dané tickery v rozsahu [fromMonth, toMonthExclusive).
 * Výsledek je seřazený podle month ASC.
 */
export async function getPriceHistoryFromDb(
  tickers: string[],
  fromMonth: string,
  toMonthExclusive: string,
): Promise<PriceHistoryRow[]> {
  if (tickers.length === 0) return []
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('price_history')
    .select('ticker,month,price,currency')
    .in('ticker', tickers)
    .gte('month', fromMonth)
    .lt('month', toMonthExclusive)
    .order('month', { ascending: true })
  if (error) throw error
  return (data ?? []) as PriceHistoryRow[]
}

/** Uloží (nebo přepíše) řádky do sdílené cache. */
export async function upsertPriceHistoryRows(rows: PriceHistoryRow[]): Promise<void> {
  if (rows.length === 0) return
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('price_history')
    .upsert(rows, { onConflict: 'ticker,month' })
  if (error) throw error
}

// ─── Sdílená tabulka měsíčních kurzů ─────────────────────────────────────────

export interface CurrencyRatesRow {
  month:      string                  // 'YYYY-MM-DD' (vždy 1. den měsíce)
  rates:      Record<string, number>  // { USD: 1.08, CAD: 1.47, ... } vůči EUR
  fetched_at: string
}

/** Načte kurzy pro konkrétní měsíc (např. '2026-04-01'). */
export async function getCurrencyRatesFromDb(month: string): Promise<Record<string, number> | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('currency_rates')
      .select('rates')
      .eq('month', month)
      .single()
    if (error || !data) return null
    return data.rates as Record<string, number>
  } catch {
    return null
  }
}

/** Uloží (nebo přepíše) kurzy pro daný měsíc. Selže tiše — kurzy jsou best-effort. */
export async function upsertCurrencyRates(month: string, rates: Record<string, number>): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('currency_rates')
      .upsert({ month, rates, fetched_at: new Date().toISOString() }, { onConflict: 'month' })
  } catch {
    // Ignorujeme — kurzy jsou sdílená cache, výpadek DB aplikaci neshodí
  }
}

/** Načte kurzy pro seznam měsíců (pro hromadné dotazy). */
export async function getCurrencyRatesRangeFromDb(
  fromMonth: string,
  toMonth: string,
): Promise<Record<string, Record<string, number>>> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('currency_rates')
      .select('month,rates')
      .gte('month', fromMonth)
      .lte('month', toMonth)
      .order('month', { ascending: true })
    if (error || !data) return {}
    return Object.fromEntries(data.map((r) => [r.month.slice(0, 7), r.rates as Record<string, number>]))
  } catch {
    return {}
  }
}
