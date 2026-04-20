import { NextResponse } from 'next/server'

// Frankfurter.app — ECB data, free, bez registrace
// Bez filtru vrátí kurzy pro všechny dostupné měny vůči EUR
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=EUR'

// Fallback kurzy pokud API selže (přibližné hodnoty)
const FALLBACK_RATES: Record<string, number> = {
  CZK: 25.0, USD: 1.08, GBP: 0.86, CAD: 1.47, CHF: 0.97,
  JPY: 162.0, AUD: 1.66, HKD: 8.44, NOK: 11.7, SEK: 11.3,
  DKK: 7.46, SGD: 1.45, PLN: 4.27, HUF: 395.0, RON: 4.97,
}

export async function GET() {
  try {
    const res = await fetch(FRANKFURTER_URL, {
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

    return NextResponse.json({
      eurCzk: rates['CZK'] ?? FALLBACK_RATES.CZK,
      eurUsd: rates['USD'] ?? FALLBACK_RATES.USD,
      rates,
      date: data.date,
    })
  } catch (err) {
    console.error('Currency fetch error:', err)
    return NextResponse.json({
      eurCzk: FALLBACK_RATES.CZK,
      eurUsd: FALLBACK_RATES.USD,
      rates: FALLBACK_RATES,
      date: new Date().toISOString().split('T')[0],
      fallback: true,
    })
  }
}
