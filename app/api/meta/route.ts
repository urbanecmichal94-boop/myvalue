import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

// GET /api/meta?tickers=AAPL,MSFT
// Vrátí sector, industry, country pro každý ticker — pouze pro stock/etf
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tickersParam = searchParams.get('tickers')
  if (!tickersParam) {
    return NextResponse.json({ error: 'Chybí parametr tickers' }, { status: 400 })
  }

  const tickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean)
  const meta: Record<string, { sector?: string; industry?: string; country?: string }> = {}

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const result = await yahooFinance.quoteSummary(ticker, {
          modules: ['assetProfile'],
        })
        const profile = result.assetProfile
        if (profile) {
          meta[ticker] = {
            sector:   profile.sector   ?? undefined,
            industry: profile.industry ?? undefined,
            country:  profile.country  ?? undefined,
          }
        }
      } catch (e) {
        console.warn(`Meta fetch failed for ${ticker}:`, e)
      }
    })
  )

  return NextResponse.json({ meta })
}
