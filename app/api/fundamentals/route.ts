import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

export interface FundamentalsData {
  // Identita
  name?: string
  description?: string
  sector?: string
  industry?: string
  country?: string
  website?: string
  employees?: number
  // Valuace
  marketCap?: number
  peRatio?: number
  forwardPE?: number
  eps?: number
  priceToBook?: number
  // Výnos
  dividendYield?: number
  dividendRate?: number
  payoutRatio?: number
  // Cena
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  fiftyDayAverage?: number
  twoHundredDayAverage?: number
  // Objem
  avgVolume?: number
  currency?: string
  // Zdraví firmy
  freeCashflow?: number
  returnOnEquity?: number
  debtToEquity?: number
  beta?: number
  profitMargin?: number
  revenueGrowth?: number
}

// GET /api/fundamentals?ticker=AAPL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.trim()

  if (!ticker) {
    return NextResponse.json({ error: 'Chybí parametr ticker' }, { status: 400 })
  }

  try {
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'summaryDetail', 'defaultKeyStatistics', 'price', 'financialData'],
    })

    const profile  = result.assetProfile
    const summary  = result.summaryDetail    as Record<string, unknown> | undefined
    const stats    = result.defaultKeyStatistics as Record<string, unknown> | undefined
    const price    = result.price            as Record<string, unknown> | undefined
    const finData  = result.financialData    as Record<string, unknown> | undefined

    const data: FundamentalsData = {
      // Identita
      name:        (price?.longName ?? price?.shortName) as string | undefined,
      description: profile?.longBusinessSummary ?? undefined,
      sector:      profile?.sector   ?? undefined,
      industry:    profile?.industry ?? undefined,
      country:     profile?.country  ?? undefined,
      website:     profile?.website  ?? undefined,
      employees:   profile?.fullTimeEmployees ?? undefined,
      // Valuace
      marketCap:    (summary?.marketCap   ?? price?.marketCap)  as number | undefined,
      peRatio:      summary?.trailingPE   as number | undefined,
      forwardPE:    summary?.forwardPE    as number | undefined,
      eps:          stats?.trailingEps    as number | undefined,
      priceToBook:  stats?.priceToBook    as number | undefined,
      // Výnos
      dividendYield: summary?.dividendYield  as number | undefined,
      dividendRate:  summary?.dividendRate   as number | undefined,
      payoutRatio:   summary?.payoutRatio    as number | undefined,
      // Cena
      fiftyTwoWeekHigh:      summary?.fiftyTwoWeekHigh      as number | undefined,
      fiftyTwoWeekLow:       summary?.fiftyTwoWeekLow       as number | undefined,
      fiftyDayAverage:       summary?.fiftyDayAverage       as number | undefined,
      twoHundredDayAverage:  summary?.twoHundredDayAverage  as number | undefined,
      // Objem
      avgVolume: summary?.averageVolume as number | undefined,
      currency:  (summary?.currency ?? price?.currency) as string | undefined,
      // Zdraví firmy
      freeCashflow:   finData?.freeCashflow   as number | undefined,
      returnOnEquity: finData?.returnOnEquity as number | undefined,
      debtToEquity:   finData?.debtToEquity   as number | undefined,
      beta:           (summary?.beta ?? finData?.beta) as number | undefined,
      profitMargin:   finData?.profitMargins  as number | undefined,
      revenueGrowth:  finData?.revenueGrowth  as number | undefined,
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Fundamentals fetch error:', err)
    return NextResponse.json({ error: 'Nepodařilo se načíst data' }, { status: 500 })
  }
}
