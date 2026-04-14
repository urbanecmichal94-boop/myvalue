import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export interface NewsItem {
  uuid: string
  title: string
  publisher: string
  link: string
  publishedAt: string   // ISO string
  thumbnail?: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')

  if (!symbol) {
    return NextResponse.json({ error: 'Chybí parametr symbol' }, { status: 400 })
  }

  try {
    const result = await yahooFinance.search(symbol, {}, { validateResult: false })
    const raw = (result as { news?: unknown[] }).news ?? []

    const news: NewsItem[] = raw
      .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
      .slice(0, 15)
      .map((n) => {
        const thumb = n.thumbnail as { resolutions?: { url: string; width: number }[] } | undefined
        const img = thumb?.resolutions?.sort((a, b) => b.width - a.width)[0]?.url

        const ts = n.providerPublishTime
        const date = ts instanceof Date
          ? ts.toISOString()
          : typeof ts === 'number'
            ? new Date(ts * 1000).toISOString()
            : new Date().toISOString()

        return {
          uuid:        String(n.uuid ?? ''),
          title:       String(n.title ?? ''),
          publisher:   String(n.publisher ?? ''),
          link:        String(n.link ?? ''),
          publishedAt: date,
          thumbnail:   img,
        }
      })
      .filter((n) => n.title && n.link)

    return NextResponse.json({ news })
  } catch (err) {
    console.error('News fetch error:', err)
    return NextResponse.json({ error: 'Nepodařilo se načíst novinky' }, { status: 500 })
  }
}
