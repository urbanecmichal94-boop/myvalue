import { NextResponse } from 'next/server'

// FRED API — Federal Reserve Economic Data
// Registrace a API klíč: https://fred.stlouisfed.org/docs/api/fred/
// Klíč nastavit jako: FRED_API_KEY v .env.local

// Serie IDs pro Česko + EU + USA:
// CZECPIALLMINMEI  = CZ CPI (měsíčně)
// CP0000EZ19M086NEST = EU CPI (měsíčně)
// CPIAUCSL          = US CPI (měsíčně)
// NAEXKP01CZQ659S  = CZ HDP growth (kvartálně)
// CLVMNACSCAB1GQEZ = EU HDP growth (kvartálně)
// A191RL1Q225SBEA  = US HDP growth (kvartálně)
// LRHUTTTTCZM156S  = CZ nezaměstnanost (měsíčně)
// LRHUTTTTEZM156S  = EU nezaměstnanost (měsíčně)
// UNRATE            = US nezaměstnanost (měsíčně)

export interface FredSeriesPoint {
  date: string   // YYYY-MM-DD
  value: number
}

export interface FredData {
  cpiCz:          FredSeriesPoint[]
  cpiEu:          FredSeriesPoint[]
  cpiUs:          FredSeriesPoint[]
  gdpCz:          FredSeriesPoint[]
  gdpEu:          FredSeriesPoint[]
  gdpUs:          FredSeriesPoint[]
  unemploymentCz: FredSeriesPoint[]
  unemploymentEu: FredSeriesPoint[]
  unemploymentUs: FredSeriesPoint[]
  updatedAt:      string
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

// EU nezaměstnanost z Eurostatu (FRED má data jen do 2023)
async function fetchEuUnemployment(): Promise<FredSeriesPoint[]> {
  try {
    const res = await fetch(
      'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=EA20&sex=T&age=TOTAL&s_adj=SA&unit=PC_ACT&lastTimePeriod=36&format=JSON',
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return []
    const json = await res.json() as {
      value: Record<string, number>
      dimension: { time: { category: { index: Record<string, number>; label: Record<string, string> } } }
    }
    const timeIndex = json.dimension.time.category.index
    const timeLabel = json.dimension.time.category.label
    return Object.entries(timeIndex)
      .map(([period, idx]) => ({
        date: period.replace('M', '-') + '-01', // 2025M12 → 2025-12-01
        value: parseFloat((json.value[idx] ?? 0).toFixed(2)),
        label: timeLabel[period],
      }))
      .filter(p => p.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

async function fetchSeries(seriesId: string, apiKey: string, limit = 24, units = 'pc1'): Promise<FredSeriesPoint[]> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}&units=${units}`
  const res = await fetch(url, { next: { revalidate: 86400 } }) // cache 24h
  if (!res.ok) return []
  const json = await res.json() as { observations: Array<{ date: string; value: string }> }
  return json.observations
    .filter(o => o.value !== '.' && !isNaN(parseFloat(o.value)))
    .map(o => ({ date: o.date, value: parseFloat(parseFloat(o.value).toFixed(2)) }))
    .reverse() // chronologicky
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY

  if (!apiKey) {
    // Stub — vrátíme prázdná data s jasnou zprávou
    return NextResponse.json({
      error: 'FRED_API_KEY není nastaven. Přidej ho do .env.local.',
      stub: true,
      cpiCz: [], cpiEu: [], cpiUs: [],
      gdpCz: [], gdpEu: [], gdpUs: [],
      unemploymentCz: [], unemploymentEu: [], unemploymentUs: [],
      updatedAt: new Date().toISOString(),
    })
  }

  try {
    const [
      cpiCz, cpiEu, cpiUs,
      gdpCz, gdpEu, gdpUs,
      unemploymentCz, unemploymentEu, unemploymentUs,
    ] = await Promise.all([
      fetchSeries('CZECPIALLMINMEI',    apiKey, 24, 'pc1'),  // CZ CPI meziroční %
      fetchSeries('CP0000EZ19M086NEST', apiKey, 24, 'pc1'),  // EU CPI meziroční %
      fetchSeries('CPIAUCSL',           apiKey, 24, 'pc1'),  // US CPI meziroční %
      fetchSeries('CZEGDPRQPSMEI',      apiKey, 12, 'lin'),  // CZ HDP růst % meziroční
      fetchSeries('NAEXKP01EZQ659S',    apiKey, 12, 'lin'),  // EU HDP růst % meziroční
      fetchSeries('A191RL1Q225SBEA',    apiKey, 12, 'lin'),  // US HDP růst % (již v %)
      fetchSeries('LRHUTTTTCZM156S',    apiKey, 24, 'lin'),  // CZ nezaměstnanost % (již v %)
      fetchEuUnemployment(),                                  // EU nezaměstnanost z Eurostatu (aktuální)
      fetchSeries('UNRATE',             apiKey, 24, 'lin'),  // US nezaměstnanost % (již v %)
    ])

    const data: FredData = {
      cpiCz, cpiEu, cpiUs,
      gdpCz, gdpEu, gdpUs,
      unemploymentCz, unemploymentEu, unemploymentUs,
      updatedAt: new Date().toISOString(),
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('FRED fetch error:', err)
    return NextResponse.json({ error: 'FRED fetch failed' }, { status: 500 })
  }
}
