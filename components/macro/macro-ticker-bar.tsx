'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, RotateCcw } from 'lucide-react'
import type { CnbData } from '@/app/api/macro/cnb/route'
import type { MarketsData } from '@/app/api/macro/markets/route'
import { getMacroCache, saveMacroCache, isMacroCacheValid } from '@/lib/storage'

interface TickerItem {
  label: string
  value: string
  change?: number
}

function ChangeIcon({ change }: { change?: number }) {
  if (change === undefined || change === 0) return <Minus className="h-3 w-3 text-muted-foreground" />
  if (change > 0) return <TrendingUp className="h-3 w-3 text-green-600" />
  return <TrendingDown className="h-3 w-3 text-red-600" />
}

function fmt(val: number | null, decimals = 2, suffix = ''): string {
  if (val === null) return '—'
  return `${val.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
}

export function MacroTickerBar() {
  const [cnb, setCnb]       = useState<CnbData | null>(null)
  const [markets, setMarkets] = useState<MarketsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const cache = getMacroCache()
        let cnbData: CnbData | null = null
        let marketsData: MarketsData | null = null

        // ČNB — cache 6 hodin
        if (cache.cnb && isMacroCacheValid(cache.cnb.updatedAt, 6)) {
          cnbData = cache.cnb
        } else {
          const res = await fetch('/api/macro/cnb')
          if (res.ok) {
            cnbData = await res.json()
            saveMacroCache({ ...cache, cnb: { ...cnbData!, updatedAt: new Date().toISOString() } })
          }
        }

        // Trhy — cache 2 hodiny
        if (cache.markets && isMacroCacheValid(cache.markets.updatedAt, 2)) {
          marketsData = cache.markets
        } else {
          const res = await fetch('/api/macro/markets')
          if (res.ok) {
            marketsData = await res.json()
            saveMacroCache({ ...getMacroCache(), markets: { ...marketsData!, updatedAt: new Date().toISOString() } })
          }
        }

        if (cnbData)     setCnb(cnbData)
        if (marketsData) setMarkets(marketsData)
      } catch {
        // tiché selhání — zobrazíme —
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const tickers: TickerItem[] = [
    { label: 'Repo sazba ČNB', value: fmt(cnb?.repoRate ?? null, 2, ' %') },
    { label: 'EUR/CZK',        value: fmt(cnb?.eurCzk ?? null, 2) },
    { label: 'USD/CZK',        value: fmt(cnb?.usdCzk ?? null, 2) },
    { label: 'Ropa WTI',       value: fmt(markets?.oilWti ?? null, 2, ' USD') },
    { label: 'Ropa Brent',     value: fmt(markets?.oilBrent ?? null, 2, ' USD') },
    { label: 'US 10Y výnos',   value: fmt(markets?.bond10yUs ?? null, 3, ' %') },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tickers.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3"
          >
            <span className="text-xs text-muted-foreground truncate">{item.label}</span>
            <div className="flex items-center gap-1.5">
              {loading
                ? <span className="text-lg font-bold text-muted-foreground">…</span>
                : <span className="text-lg font-bold tabular-nums">{item.value}</span>
              }
              {!loading && <ChangeIcon change={item.change} />}
            </div>
          </div>
        ))}
      </div>
      {cnb?.date && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <RotateCcw className="h-3 w-3" />
          Kurzy ČNB ke dni {cnb.date}
        </p>
      )}
    </div>
  )
}
