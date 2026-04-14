import { NextResponse } from 'next/server'

// Frankfurter.app — historické ECB kurzy, free, bez registrace
// Range query: https://api.frankfurter.app/2020-01-01..2024-12-31?from=EUR
// Vrátí denní kurzy → agregujeme na měsíční průměr

const FALLBACK_RATES: Record<string, number> = {
  CZK: 25.0, USD: 1.08, GBP: 0.86, CAD: 1.47, CHF: 0.97,
  JPY: 162.0, AUD: 1.66, HKD: 8.44, NOK: 11.7, SEK: 11.3,
  DKK: 7.46, PLN: 4.27, HUF: 395.0, RON: 4.97,
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')   // YYYY-MM-DD
  const to   = searchParams.get('to')     // YYYY-MM-DD (default: today)

  if (!from) {
    return NextResponse.json({ error: 'Missing "from" parameter' }, { status: 400 })
  }

  const toDate = to ?? new Date().toISOString().split('T')[0]
  const url = `https://api.frankfurter.app/${from}..${toDate}?from=EUR`

  try {
    const res = await fetch(url, {
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`Frankfurter error: ${res.status}`)

    const data = await res.json() as {
      base: string
      start_date: string
      end_date: string
      rates: Record<string, Record<string, number>>  // date → currency → rate
    }

    // Agregovat denní kurzy na měsíční průměr
    // months: YYYY-MM → { currency → průměrný kurz }
    const monthSums: Record<string, Record<string, number>> = {}
    const monthCounts: Record<string, number> = {}

    for (const [date, dayRates] of Object.entries(data.rates)) {
      const month = date.slice(0, 7)  // YYYY-MM
      if (!monthSums[month]) {
        monthSums[month] = { EUR: 1 }
        monthCounts[month] = 0
      }
      monthCounts[month]++
      for (const [currency, rate] of Object.entries(dayRates)) {
        monthSums[month][currency] = (monthSums[month][currency] ?? 0) + rate
      }
    }

    const months: Record<string, Record<string, number>> = {}
    for (const [month, sums] of Object.entries(monthSums)) {
      const count = monthCounts[month]
      months[month] = {}
      for (const [currency, sum] of Object.entries(sums)) {
        months[month][currency] = currency === 'EUR' ? 1 : sum / count
      }
    }

    return NextResponse.json({ months })
  } catch (err) {
    console.error('Currency history fetch error:', err)
    // Vrátit fallback pro každý měsíc v rozsahu
    const months: Record<string, Record<string, number>> = {}
    const start = new Date(from)
    const end = new Date(toDate)
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      const month = cur.toISOString().slice(0, 7)
      months[month] = { EUR: 1, ...FALLBACK_RATES }
      cur.setMonth(cur.getMonth() + 1)
    }
    return NextResponse.json({ months, fallback: true })
  }
}
