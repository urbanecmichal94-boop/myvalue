import { NextResponse } from 'next/server'
import { getCurrencyRatesFromDb, upsertCurrencyRates } from '@/lib/supabase-server'

const FRANKFURTER_URL = 'https://api.frankfurter.app'

const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  CZK: 25.0, USD: 1.08, GBP: 0.86, CAD: 1.47, CHF: 0.97,
  JPY: 162.0, AUD: 1.66, HKD: 8.44, NOK: 11.7, SEK: 11.3,
  DKK: 7.46, SGD: 1.45, PLN: 4.27,
}

/** Vrátí pole YYYY-MM-DD (1. den každého měsíce) v rozsahu [from, to]. */
function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  const cur = new Date(from.slice(0, 7) + '-01')
  const end = new Date(to.slice(0, 7) + '-01')
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 10))
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

/** Stáhne kurzy pro jeden měsíc z Frankfurter a uloží do DB. */
async function seedMonth(month: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${FRANKFURTER_URL}/${month}?from=EUR`, {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`)
    const data = await res.json() as { rates: Record<string, number> }
    const rates: Record<string, number> = { EUR: 1, ...data.rates }
    await upsertCurrencyRates(month, rates).catch(() => {})
    return rates
  } catch {
    await upsertCurrencyRates(month, FALLBACK_RATES).catch(() => {})
    return FALLBACK_RATES
  }
}

/**
 * GET /api/currencies/history?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Vrátí měsíční kurzy pro daný rozsah.
 * Čte primárně z Supabase currency_rates, chybějící měsíce stáhne z Frankfurter a uloží.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to') ?? new Date().toISOString().slice(0, 10)

  if (!from) {
    return NextResponse.json({ error: 'Missing "from" parameter' }, { status: 400 })
  }

  const months = monthRange(from, to)
  const result: Record<string, Record<string, number>> = {}

  // Načíst všechny dostupné měsíce z DB paralelně
  const dbResults = await Promise.all(
    months.map(async (month) => ({ month, rates: await getCurrencyRatesFromDb(month) }))
  )

  // Chybějící měsíce seedovat z Frankfurter (sekvenčně, abychom API nezahltili)
  for (const { month, rates } of dbResults) {
    if (rates) {
      result[month.slice(0, 7)] = rates
    } else {
      result[month.slice(0, 7)] = await seedMonth(month)
    }
  }

  return NextResponse.json({ months: result })
}
