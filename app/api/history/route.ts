import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

const COMMODITY_TICKERS: Record<string, string> = {
  XAU: 'GC=F',
  XAG: 'SI=F',
  XPT: 'PL=F',
  XPD: 'PA=F',
}

// Výsledek: { ticker -> { 'YYYY-MM' -> close_price (8 des. míst) } }
export type HistoryResponse = {
  history: Record<string, Record<string, number>>
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tickersParam = searchParams.get('tickers')
  const from         = searchParams.get('from')  // YYYY-MM-DD
  const type         = searchParams.get('type')  // 'stock' | 'crypto' | 'commodity'

  if (!tickersParam || !from || !type) {
    return NextResponse.json({ error: 'Chybí parametry tickers, from nebo type' }, { status: 400 })
  }

  const tickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean)

  try {
    if (type === 'crypto') {
      return await fetchCryptoHistory(tickers, from)
    }
    if (type === 'commodity') {
      return await fetchCommodityHistory(tickers, from)
    }
    return await fetchStockHistory(tickers, from)
  } catch (err) {
    console.error('History fetch error:', err)
    return NextResponse.json({ error: 'Nepodařilo se načíst historická data' }, { status: 500 })
  }
}

// ── Akcie & ETF (Yahoo Finance) ───────────────────────────────────────────────

async function fetchStockHistory(tickers: string[], from: string) {
  const result: Record<string, Record<string, number>> = {}
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const chart = await yahooFinance.chart(
          ticker,
          { period1: from, period2: tomorrow, interval: '1d' },
          { validateResult: false }
        ) as { quotes: Array<{ date: Date; close: number | null }> }
        // Poslední dostupná cena každého měsíce
        const byMonth: Record<string, number> = {}
        for (const item of chart.quotes) {
          if (!item.date || !item.close || item.close <= 0) continue
          const month = new Date(item.date).toISOString().slice(0, 7)
          byMonth[month] = round8(item.close)
        }
        result[ticker] = byMonth
      } catch (e) {
        console.warn(`Historická data ${ticker}:`, e)
      }
    })
  )

  return NextResponse.json({ history: result })
}

// ── Komodity (Yahoo Finance futures) ─────────────────────────────────────────

async function fetchCommodityHistory(tickers: string[], from: string) {
  const result: Record<string, Record<string, number>> = {}
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  await Promise.all(
    tickers.map(async (ticker) => {
      const yahooTicker = COMMODITY_TICKERS[ticker]
      if (!yahooTicker) return
      try {
        // Futures mají díry v měsíčních datech — použijeme denní a vezmeme poslední close měsíce
        const chart = await yahooFinance.chart(
          yahooTicker,
          { period1: from, period2: tomorrow, interval: '1d' },
          { validateResult: false }
        ) as { quotes: Array<{ date: Date; close: number | null }> }

        // Poslední dostupná cena každého měsíce
        const byMonth: Record<string, number> = {}
        for (const item of chart.quotes) {
          if (!item.date || !item.close || item.close <= 0) continue
          const month = new Date(item.date).toISOString().slice(0, 7)
          byMonth[month] = round8(item.close)
        }
        result[ticker] = byMonth
      } catch (e) {
        console.warn(`Historická data komodity ${ticker}:`, e)
      }
    })
  )

  return NextResponse.json({ history: result })
}

// ── Krypto (Yahoo Finance) ────────────────────────────────────────────────────
// CoinGecko market_chart/range je na free tieru rate-limitovaný — používáme Yahoo Finance.
// Mapování: CoinGecko ID → Yahoo Finance ticker

const CRYPTO_TO_YAHOO: Record<string, string> = {
  bitcoin:              'BTC-USD',
  ethereum:             'ETH-USD',
  solana:               'SOL-USD',
  ripple:               'XRP-USD',
  cardano:              'ADA-USD',
  dogecoin:             'DOGE-USD',
  'shiba-inu':          'SHIB-USD',
  polkadot:             'DOT-USD',
  chainlink:            'LINK-USD',
  litecoin:             'LTC-USD',
  'bitcoin-cash':       'BCH-USD',
  'avalanche-2':        'AVAX-USD',
  'matic-network':      'POL-USD',
  cosmos:               'ATOM-USD',
  uniswap:              'UNI-USD',
  stellar:              'XLM-USD',
  monero:               'XMR-USD',
  tron:                 'TRX-USD',
  near:                 'NEAR-USD',
  aptos:                'APT-USD',
  sui:                  'SUI-USD',
  toncoin:              'TON-USD',
  pepe:                 'PEPE-USD',
  'wrapped-bitcoin':    'WBTC-USD',
  'internet-computer':  'ICP-USD',
  filecoin:             'FIL-USD',
  hedera:               'HBAR-USD',
  'the-sandbox':        'SAND-USD',
  decentraland:         'MANA-USD',
  aave:                 'AAVE-USD',
  'lido-dao':           'LDO-USD',
  'injective-protocol': 'INJ-USD',
  'render-token':       'RNDR-USD',
  'bitcoin-sv':         'BSV-USD',
  'crypto-com-chain':   'CRO-USD',
  'the-graph':          'GRT-USD',
  vechain:              'VET-USD',
  algorand:             'ALGO-USD',
  'eos':                'EOS-USD',
  tezos:                'XTZ-USD',
  'pancakeswap-token':  'CAKE-USD',
}

async function fetchCryptoHistory(coinIds: string[], from: string) {
  const result: Record<string, Record<string, number>> = {}
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  await Promise.all(
    coinIds.map(async (id) => {
      const yahooTicker = CRYPTO_TO_YAHOO[id]
      if (!yahooTicker) {
        console.warn(`Krypto ${id}: chybí mapování na Yahoo Finance ticker`)
        return
      }
      try {
        const chart = await yahooFinance.chart(
          yahooTicker,
          { period1: from, period2: tomorrow, interval: '1d' },
          { validateResult: false }
        ) as { quotes: Array<{ date: Date; close: number | null }> }

        const byMonth: Record<string, number> = {}
        for (const item of chart.quotes) {
          if (!item.date || !item.close || item.close <= 0) continue
          const month = new Date(item.date).toISOString().slice(0, 7)
          byMonth[month] = round8(item.close)
        }
        result[id] = byMonth
      } catch (e) {
        console.warn(`Historická data crypto ${id} (${yahooTicker}):`, e)
      }
    })
  )

  return NextResponse.json({ history: result })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round8(n: number): number {
  return parseFloat(n.toFixed(8))
}
