'use client'

import { createBrowserClient } from '@supabase/ssr'

// ─── Browser klient (použití v Client Components) ─────────────────────────────

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Singleton pro použití mimo React (localStorage, storage helpers)
export const supabase = createClient()

// ─── Makro data ───────────────────────────────────────────────────────────────

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
