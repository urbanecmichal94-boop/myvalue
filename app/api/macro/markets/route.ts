import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { upsertMacroRows } from '@/lib/supabase'
const yahooFinance = new YahooFinance()

// Tickery pro makro data z Yahoo Finance
// CL=F  = WTI ropa (USD/barel)
// BZ=F  = Brent ropa (USD/barel)
// ^TNX  = US 10Y výnos dluhopisu (%)
// ^IRX  = US 3M Treasury (%)
// CZ10Y = CZ 10Y (není vždy dostupný, fallback)

export interface MarketsData {
  oilWti:    number | null
  oilBrent:  number | null
  bond10yUs: number | null
  date:      string
}

const TICKERS = {
  oilWti:    'CL=F',
  oilBrent:  'BZ=F',
  bond10yUs: '^TNX',
}

async function fetchQuote(ticker: string): Promise<number | null> {
  try {
    const q = await yahooFinance.quote(ticker, {}, { validateResult: false }) as { regularMarketPrice?: number }
    return q.regularMarketPrice ?? null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const [oilWti, oilBrent, bond10yUs] = await Promise.all([
      fetchQuote(TICKERS.oilWti),
      fetchQuote(TICKERS.oilBrent),
      fetchQuote(TICKERS.bond10yUs),
    ])

    const data: MarketsData = {
      oilWti:    oilWti    !== null ? parseFloat(oilWti.toFixed(2))    : null,
      oilBrent:  oilBrent  !== null ? parseFloat(oilBrent.toFixed(2))  : null,
      bond10yUs: bond10yUs !== null ? parseFloat(bond10yUs.toFixed(3)) : null,
      date: new Date().toISOString().split('T')[0],
    }

    // Uložit do Supabase (tiše — neblokujeme odpověď)
    const rows = []
    if (data.oilWti    !== null) rows.push({ region: 'GLOBAL', category: 'markets', key: 'oilWti',    value: data.oilWti,    unit: 'USD', date: data.date })
    if (data.oilBrent  !== null) rows.push({ region: 'GLOBAL', category: 'markets', key: 'oilBrent',  value: data.oilBrent,  unit: 'USD', date: data.date })
    if (data.bond10yUs !== null) rows.push({ region: 'US',     category: 'markets', key: 'bond10yUs', value: data.bond10yUs, unit: '%',   date: data.date })
    if (rows.length > 0) {
      upsertMacroRows(rows).catch(e => console.error('Supabase markets upsert error:', e))
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Markets macro fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 })
  }
}
