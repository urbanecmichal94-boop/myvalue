import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import type { DividendEntry, DividendFrequency } from '@/lib/storage'

const yahooFinance = new YahooFinance()

export interface DividendApiResponse {
  ticker:    string
  dividends: DividendEntry[]
  frequency: DividendFrequency
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')

  if (!ticker) {
    return NextResponse.json({ error: 'Chybí parametr ticker' }, { status: 400 })
  }

  try {
    // Stáhneme historii od 2020 — pokryje detekci frekvence i historii
    const chart = await yahooFinance.chart(
      ticker,
      { period1: '2020-01-01', period2: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
      { validateResult: false }
    ) as { meta?: { currency?: string }; events?: { dividends?: Array<{ amount: number; date: Date }> } }

    const currency = chart.meta?.currency ?? 'USD'
    const raw = chart.events?.dividends ?? []

    const dividends: DividendEntry[] = raw.map((d) => ({
      exDate:   new Date(d.date).toISOString().split('T')[0],
      amount:   parseFloat(d.amount.toFixed(8)),
      currency,
    })).sort((a, b) => a.exDate.localeCompare(b.exDate))

    const frequency = detectFrequency(dividends)

    return NextResponse.json({ ticker, dividends, frequency } satisfies DividendApiResponse)
  } catch (err) {
    console.error(`Dividend fetch error ${ticker}:`, err)
    return NextResponse.json({ error: 'Nepodařilo se načíst dividendy' }, { status: 500 })
  }
}

// ─── Detekce frekvence z intervalů mezi výplatami ────────────────────────────

function detectFrequency(dividends: DividendEntry[]): DividendFrequency {
  if (dividends.length < 2) return 'unknown'

  const intervals: number[] = []
  for (let i = 1; i < dividends.length; i++) {
    const prev = new Date(dividends[i - 1].exDate).getTime()
    const curr = new Date(dividends[i].exDate).getTime()
    intervals.push((curr - prev) / (1000 * 60 * 60 * 24))
  }

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length

  if (avg < 45)  return 'monthly'
  if (avg < 110) return 'quarterly'
  if (avg < 200) return 'semi-annual'
  return 'annual'
}
