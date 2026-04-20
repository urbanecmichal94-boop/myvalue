import { NextResponse } from 'next/server'
import { getCurrencyRatesFromDb, upsertCurrencyRates } from '@/lib/supabase-server'

const FRANKFURTER_URL = 'https://api.frankfurter.app'

const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  CZK: 25.0, USD: 1.08, GBP: 0.86, CAD: 1.47, CHF: 0.97,
  JPY: 162.0, AUD: 1.66, HKD: 8.44, NOK: 11.7, SEK: 11.3,
  DKK: 7.46, SGD: 1.45, PLN: 4.27,
}

/** Vrátí první den měsíce pro daný datum string (nebo dnešek). */
function firstOfMonth(dateStr?: string | null): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * GET /api/currencies/seed-month?month=2026-04-01
 *
 * Načte kurzy pro daný měsíc z DB, nebo je stáhne z Frankfurter.app a uloží.
 * Lazy load — volá se automaticky při potřebě historického kurzu.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = firstOfMonth(searchParams.get('month'))

  // 1. Zkusit DB
  const cached = await getCurrencyRatesFromDb(month)
  if (cached) {
    return NextResponse.json({ month, rates: cached, source: 'db' })
  }

  // 2. Stáhnout z Frankfurter — kurz ke konkrétnímu datu
  try {
    const res = await fetch(`${FRANKFURTER_URL}/${month}?from=EUR`, {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`Frankfurter error: ${res.status}`)

    const data = await res.json() as {
      base: string
      date: string
      rates: Record<string, number>
    }

    const rates: Record<string, number> = { EUR: 1, ...data.rates }

    // 3. Uložit do DB
    await upsertCurrencyRates(month, rates)

    return NextResponse.json({ month, rates, source: 'frankfurter' })
  } catch (err) {
    console.error('Currency seed error:', err)

    // Fallback — uložit přibližné hodnoty ať příště nepotřebujeme API
    await upsertCurrencyRates(month, FALLBACK_RATES).catch(() => {})

    return NextResponse.json({ month, rates: FALLBACK_RATES, source: 'fallback' })
  }
}
