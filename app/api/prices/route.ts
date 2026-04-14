import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

// Mapování komodit na Yahoo Finance futures tickery
const COMMODITY_TICKERS: Record<string, string> = {
  XAU: 'GC=F',   // Zlato (Gold)
  XAG: 'SI=F',   // Stříbro (Silver)
  XPT: 'PL=F',   // Platina (Platinum)
  XPD: 'PA=F',   // Palladium
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tickersParam = searchParams.get('tickers')
  const type = searchParams.get('type') // 'stock' | 'crypto' | 'commodity'

  if (!tickersParam || !type) {
    return NextResponse.json({ error: 'Chybí parametry tickers nebo type' }, { status: 400 })
  }

  const tickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean)

  try {
    if (type === 'crypto') {
      return await fetchCryptoPrices(tickers)
    }
    if (type === 'commodity') {
      return await fetchCommodityPrices(tickers)
    }
    // stock nebo etf
    return await fetchStockPrices(tickers)
  } catch (err) {
    console.error('Price fetch error:', err)
    return NextResponse.json({ error: 'Nepodařilo se načíst ceny' }, { status: 500 })
  }
}

// ── Akcie & ETF (Yahoo Finance) ──────────────────────────────────────────────
async function fetchStockPrices(tickers: string[]) {
  const prices: Record<string, number> = {}
  const dailyChanges: Record<string, number> = {}
  const currencies: Record<string, string> = {}

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(ticker, {
          fields: ['regularMarketPrice', 'regularMarketChangePercent', 'currency'],
        })
        const q = quote as Record<string, unknown>
        if (q.regularMarketPrice) {
          prices[ticker] = q.regularMarketPrice as number
        }
        if (q.regularMarketChangePercent !== undefined && q.regularMarketChangePercent !== null) {
          dailyChanges[ticker] = q.regularMarketChangePercent as number
        }
        if (q.currency) {
          currencies[ticker] = (q.currency as string).toUpperCase()
        }
      } catch (e) {
        console.warn(`Nepodařilo se načíst cenu pro ${ticker}:`, e)
      }
    })
  )

  return NextResponse.json({ prices, dailyChanges, currencies })
}

// ── Komodity (Yahoo Finance futures) ─────────────────────────────────────────
async function fetchCommodityPrices(tickers: string[]) {
  const prices: Record<string, number> = {}
  const dailyChanges: Record<string, number> = {}

  await Promise.all(
    tickers.map(async (ticker) => {
      const yahooTicker = COMMODITY_TICKERS[ticker]
      if (!yahooTicker) return
      try {
        const quote = await yahooFinance.quote(
          yahooTicker,
          { fields: ['regularMarketPrice', 'regularMarketChangePercent'] },
          { validateResult: false }
        )
        const q = quote as Record<string, unknown>
        if (q.regularMarketPrice) {
          prices[ticker] = q.regularMarketPrice as number
        }
        if (q.regularMarketChangePercent !== undefined && q.regularMarketChangePercent !== null) {
          dailyChanges[ticker] = q.regularMarketChangePercent as number
        }
      } catch (e) {
        console.warn(`Nepodařilo se načíst cenu komodity ${ticker}:`, e)
      }
    })
  )

  return NextResponse.json({ prices, dailyChanges, currency: 'USD' })
}

// ── Krypto (CoinGecko) ───────────────────────────────────────────────────────
async function fetchCryptoPrices(coinIds: string[]) {
  const ids = coinIds.join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`

  const res = await fetch(url, {
    next: { revalidate: 0 },
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)

  const data = await res.json() as Record<string, { usd: number; usd_24h_change?: number }>
  const prices: Record<string, number> = {}
  const dailyChanges: Record<string, number> = {}

  for (const [id, val] of Object.entries(data)) {
    prices[id] = val.usd
    if (val.usd_24h_change !== undefined) {
      dailyChanges[id] = val.usd_24h_change
    }
  }

  return NextResponse.json({ prices, dailyChanges, currency: 'USD' })
}
