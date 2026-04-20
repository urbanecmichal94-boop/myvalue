import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import {
  getPriceHistoryFromDb,
  upsertPriceHistoryRows,
  type PriceHistoryRow,
} from '@/lib/supabase-server'

const yahooFinance = new YahooFinance()

const COMMODITY_TICKERS: Record<string, string> = {
  XAU: 'GC=F',
  XAG: 'SI=F',
  XPT: 'PL=F',
  XPD: 'PA=F',
}

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
    const result = await fetchWithCache(tickers, from, type)
    return NextResponse.json({ history: result })
  } catch (err) {
    console.error('History fetch error:', err)
    return NextResponse.json({ error: 'Nepodařilo se načíst historická data' }, { status: 500 })
  }
}

// ─── Cache vrstva ─────────────────────────────────────────────────────────────

async function fetchWithCache(
  tickers: string[],
  from: string,  // YYYY-MM-DD
  type: string,
): Promise<Record<string, Record<string, number>>> {
  const currentMonth = new Date().toISOString().slice(0, 7)  // YYYY-MM
  const fromMonth    = from.slice(0, 7)                       // YYYY-MM

  // 1. Načíst minulé měsíce z DB (< currentMonth — stabilní data)
  let dbRows: PriceHistoryRow[] = []
  try {
    dbRows = await getPriceHistoryFromDb(tickers, fromMonth, currentMonth)
  } catch (e) {
    console.warn('DB price_history read failed, falling back to Yahoo:', e)
  }

  // Sestavit mapu ticker → { month → price } z DB
  const dbMap: Record<string, Record<string, number>> = {}
  for (const row of dbRows) {
    if (!dbMap[row.ticker]) dbMap[row.ticker] = {}
    dbMap[row.ticker][row.month] = row.price
  }

  // 2. Zjistit, které tickery mají v DB mezery (chybějící minulé měsíce)
  const expectedPastMonths = generateMonths(fromMonth, currentMonth)

  const tickersNeedingFull = tickers.filter((ticker) => {
    const cached = dbMap[ticker] ?? {}
    return expectedPastMonths.some((m) => cached[m] === undefined)
  })

  // Tickery s kompletní DB cache — potřebují jen aktuální měsíc
  const tickersCurrentOnly = tickers.filter((t) => !tickersNeedingFull.includes(t))

  // 3. Yahoo: plný rozsah pro tickery s mezerami
  let yahooFull: Record<string, Record<string, number>> = {}
  if (tickersNeedingFull.length > 0) {
    yahooFull = await fetchHistoryData(tickersNeedingFull, from, type)
  }

  // 4. Yahoo: jen aktuální měsíc pro tickery s kompletní DB cache
  let yahooCurrent: Record<string, Record<string, number>> = {}
  if (tickersCurrentOnly.length > 0) {
    const currentMonthStart = `${currentMonth}-01`
    yahooCurrent = await fetchHistoryData(tickersCurrentOnly, currentMonthStart, type)
  }

  // 5. Uložit nově načtené minulé měsíce do DB (jen stabilní — < currentMonth)
  const rowsToUpsert: PriceHistoryRow[] = []
  for (const [ticker, months] of Object.entries(yahooFull)) {
    for (const [month, price] of Object.entries(months)) {
      if (month < currentMonth) {
        rowsToUpsert.push({ ticker, month, price, currency: 'USD' })
      }
    }
  }
  if (rowsToUpsert.length > 0) {
    try {
      await upsertPriceHistoryRows(rowsToUpsert)
    } catch (e) {
      console.warn('DB price_history upsert failed (non-fatal):', e)
    }
  }

  // 6. Výsledek: DB data + Yahoo data (Yahoo přepíše DB pro minulé měsíce s mezerami)
  const result: Record<string, Record<string, number>> = {}
  for (const ticker of tickers) {
    result[ticker] = {}
    // Základ: DB cache (minulé měsíce)
    for (const [month, price] of Object.entries(dbMap[ticker] ?? {})) {
      result[ticker][month] = price
    }
    // Přepsat/doplnit plným Yahoo fetchem (minulé měsíce s mezerami + aktuální)
    for (const [month, price] of Object.entries(yahooFull[ticker] ?? {})) {
      result[ticker][month] = price
    }
    // Doplnit aktuální měsíc z Yahoo current-only fetche
    for (const [month, price] of Object.entries(yahooCurrent[ticker] ?? {})) {
      result[ticker][month] = price
    }
  }

  return result
}

// ─── Yahoo Finance fetche (vrací data, ne NextResponse) ───────────────────────

async function fetchHistoryData(
  tickers: string[],
  from: string,
  type: string,
): Promise<Record<string, Record<string, number>>> {
  if (type === 'crypto')    return fetchCryptoData(tickers, from)
  if (type === 'commodity') return fetchCommodityData(tickers, from)
  return fetchStockData(tickers, from)
}

async function fetchStockData(
  tickers: string[],
  from: string,
): Promise<Record<string, Record<string, number>>> {
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

  return result
}

async function fetchCommodityData(
  tickers: string[],
  from: string,
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {}
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  await Promise.all(
    tickers.map(async (ticker) => {
      const yahooTicker = COMMODITY_TICKERS[ticker]
      if (!yahooTicker) return
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
        result[ticker] = byMonth
      } catch (e) {
        console.warn(`Historická data komodity ${ticker}:`, e)
      }
    })
  )

  return result
}

async function fetchCryptoData(
  coinIds: string[],
  from: string,
): Promise<Record<string, Record<string, number>>> {
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

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round8(n: number): number {
  return parseFloat(n.toFixed(8))
}

/** Generuje seznam měsíců 'YYYY-MM' od from (včetně) do toExclusive (bez). */
function generateMonths(from: string, toExclusive: string): string[] {
  const months: string[] = []
  let cur = from
  while (cur < toExclusive) {
    months.push(cur)
    cur = nextMonth(cur)
  }
  return months
}

function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`
}
