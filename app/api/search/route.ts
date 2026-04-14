import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

export interface SearchResult {
  ticker: string       // AAPL / bitcoin
  name: string         // Apple Inc. / Bitcoin
  exchange?: string    // NASDAQ
  type: string         // stock / etf / crypto / commodity
}

// Komodity jsou fixní seznam — bez vyhledávání
const COMMODITIES: SearchResult[] = [
  { ticker: 'XAU', name: 'Zlato (Gold)', type: 'commodity' },
  { ticker: 'XAG', name: 'Stříbro (Silver)', type: 'commodity' },
  { ticker: 'XPT', name: 'Platina (Platinum)', type: 'commodity' },
  { ticker: 'XPD', name: 'Palladium', type: 'commodity' },
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()
  const type = searchParams.get('type') // 'stock' | 'crypto' | 'commodity'

  if (!query || !type) {
    return NextResponse.json({ results: [] })
  }

  try {
    if (type === 'commodity') {
      const filtered = COMMODITIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.ticker.toLowerCase().includes(query.toLowerCase())
      )
      return NextResponse.json({ results: filtered })
    }

    if (type === 'crypto') {
      return await searchCrypto(query)
    }

    return await searchStocks(query, type)
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ results: [] })
  }
}

// ── Akcie & ETF ──────────────────────────────────────────────────────────────
async function searchStocks(query: string, type: string) {
  const data = await yahooFinance.search(query, { newsCount: 0, quotesCount: 10 })
  const raw = data as Record<string, unknown>
  const quotes = (raw.quotes ?? []) as Array<Record<string, unknown>>

  const filtered = quotes
    .filter((q) => {
      if (!q.symbol) return false
      if (!q.longname && !q.shortname) return false
      // 'stock' sekce pokrývá akcie i ETF
      if (type === 'etf') return q.quoteType === 'ETF'
      if (type === 'stock') return q.quoteType === 'EQUITY' || q.quoteType === 'ETF'
      return true
    })
    .slice(0, 8)
    .map((q) => ({
      ticker: (q.symbol as string) ?? '',
      name: (q.longname ?? q.shortname ?? q.symbol ?? '') as string,
      exchange: ((q.exchDisp ?? q.exchange ?? '') as string),
      type,
    }))

  return NextResponse.json({ results: filtered })
}

// ── Krypto (CoinGecko) ───────────────────────────────────────────────────────
async function searchCrypto(query: string) {
  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`CoinGecko search error: ${res.status}`)

  const data = await res.json() as {
    coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }>
  }

  const results: SearchResult[] = data.coins.slice(0, 8).map((c) => ({
    ticker: c.id,          // CoinGecko ID, např. "bitcoin"
    name: `${c.name} (${c.symbol.toUpperCase()})`,
    type: 'crypto',
  }))

  return NextResponse.json({ results })
}
