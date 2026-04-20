'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { convertCurrency } from '@/lib/calculations'
import { computeMonthlyValuesFromHistory } from '@/components/performance/performance-shared'
import { getCashAccounts, getCashHistory } from '@/lib/db/cash'
import type { AssetWithValue, Section, SectionTemplate } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import type { Currency } from '@/types'

type Range = '3M' | '6M' | '1R' | 'Max'
const RANGES: Range[] = ['3M', '6M', '1R', 'Max']
const RANGE_MONTHS: Record<Range, number | null> = { '3M': 3, '6M': 6, '1R': 12, 'Max': null }

const TEMPLATE_TO_HISTORY_TYPE: Partial<Record<SectionTemplate, string>> = {
  stocks: 'stock', crypto: 'crypto', commodity: 'commodity',
}

function niceStep(range: number): number {
  const rough = range / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const steps = [1, 2, 2.5, 5, 10]
  const normalized = rough / magnitude
  const nice = steps.find((s) => s >= normalized) ?? 10
  return nice * magnitude
}

function niceScale(min: number, max: number): { domain: [number, number]; ticks: number[] } {
  const step = niceStep(max - min || max)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
    ticks.push(Math.round(v * 100) / 100)
  }
  return { domain: [niceMin, niceMax], ticks }
}

function formatYAxis(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return new Intl.DateTimeFormat('cs-CZ', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1))
}

function quantityAtMonth(asset: AssetWithValue, month: string): number {
  if (!asset.transactions?.length) return asset.totalQuantity
  let qty = 0
  for (const tx of asset.transactions) {
    if (tx.date.slice(0, 7) > month) continue
    if (tx.type === 'buy') qty += tx.quantity
    else if (tx.type === 'sell') qty -= tx.quantity
  }
  return Math.max(0, qty)
}

// Hodnota manuálního aktiva v daném měsíci (z update/buy transakcí)
function manualAssetValueAtMonth(asset: AssetWithValue, month: string, rates: CurrencyCache, displayCurrency: Currency): number {
  const txs = asset.transactions?.filter((t) => t.date.slice(0, 7) <= month) ?? []
  if (txs.length === 0) return 0

  // update transakce = explicitní zadání aktuální hodnoty
  const lastUpdate = txs.filter((t) => t.type === 'update').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastUpdate) {
    return convertCurrency(lastUpdate.price, lastUpdate.currency, displayCurrency, rates)
  }

  // fallback: množství × poslední nákupní cena
  const qty = quantityAtMonth(asset, month)
  if (qty <= 0) return 0
  const lastBuy = txs.filter((t) => t.type === 'buy').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastBuy) {
    return convertCurrency(lastBuy.price * qty, lastBuy.currency, displayCurrency, rates)
  }
  return 0
}

interface PortfolioChartProps {
  assets: AssetWithValue[]
  sections: Section[]
  rates: CurrencyCache
  displayCurrency: Currency
}

export function SnapshotChart({ assets, sections, rates, displayCurrency }: PortfolioChartProps) {
  const t = useTranslations('snapshotChart')
  const [range, setRange] = useState<Range>('1R')
  const [chartData, setChartData] = useState<{ month: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (assets.length === 0) { setChartData([]); setLoading(false); return }

    async function fetchData() {
      setLoading(true)
      try {
        const allMonths = new Set<string>()

        // ── 1. Live aktiva — historické ceny z API ─────────────────────────
        const liveAssets = assets.filter((a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0)
        let liveMonthlyValues: Record<string, number> = {}

        if (liveAssets.length > 0) {
          const byType: Record<string, string[]> = {}
          for (const asset of liveAssets) {
            const section = sections.find((s) => s.id === asset.section_id)
            const type = section ? TEMPLATE_TO_HISTORY_TYPE[section.template] : undefined
            if (!type) continue
            if (!byType[type]) byType[type] = []
            if (!byType[type].includes(asset.ticker!)) byType[type].push(asset.ticker!)
          }

          const from = '2020-01-01'
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
          const mergedHistory: Record<string, Record<string, number>> = {}

          await Promise.all(
            Object.entries(byType).map(async ([type, tickers]) => {
              const res = await fetch(`/api/history?tickers=${encodeURIComponent(tickers.join(','))}&from=${from}&to=${tomorrow}&type=${type}`)
              if (!res.ok) return
              const data = await res.json() as { history: Record<string, Record<string, number>> }
              Object.assign(mergedHistory, data.history)
            })
          )

          liveMonthlyValues = computeMonthlyValuesFromHistory(liveAssets, mergedHistory, rates, displayCurrency)
          Object.keys(liveMonthlyValues).forEach((m) => allMonths.add(m))
        }

        // ── 2. Manuální aktiva — z transakcí ──────────────────────────────
        const manualAssets = assets.filter((a) => a.priceSource !== 'live' || !a.ticker)
        for (const asset of manualAssets) {
          asset.transactions?.forEach((tx) => allMonths.add(tx.date.slice(0, 7)))
        }

        // ── 3. Cash/úspory — z historie zůstatků ──────────────────────────
        const savingsSections = sections.filter((s) => s.template === 'savings')
        const cashBySection: { currency: string; history: { date: string; amount: number }[] }[] = []

        for (const section of savingsSections) {
          const accounts = await getCashAccounts(section.id)
          for (const account of accounts) {
            const history = await getCashHistory(account.id)
            history.forEach((e) => allMonths.add(e.date.slice(0, 7)))
            cashBySection.push({ currency: account.currency, history: history.map((e) => ({ date: e.date, amount: e.amount })) })
          }
        }

        // ── Sestavit data pro každý měsíc ──────────────────────────────────
        const sorted = Array.from(allMonths).sort()
        const result = sorted.map((month) => {
          // Live aktiva
          const liveVal = liveMonthlyValues[month] ?? 0

          // Manuální aktiva
          const manualVal = manualAssets.reduce((sum, asset) => {
            return sum + manualAssetValueAtMonth(asset, month, rates, displayCurrency)
          }, 0)

          // Cash — poslední zůstatek ≤ konec měsíce
          const cashVal = cashBySection.reduce((sum, { currency, history }) => {
            const lastEntry = history
              .filter((e) => e.date.slice(0, 7) <= month)
              .sort((a, b) => b.date.localeCompare(a.date))[0]
            if (!lastEntry) return sum
            return sum + convertCurrency(lastEntry.amount, currency, displayCurrency, rates)
          }, 0)

          return { month, value: liveVal + manualVal + cashVal }
        }).filter((d) => d.value > 0)

        setChartData(result)
      } catch (e) {
        console.error('PortfolioChart error:', e)
        setChartData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map((a) => a.id + a.totalQuantity).join(','), sections.map((s) => s.id).join(','), displayCurrency])

  const filtered = (() => {
    const months = RANGE_MONTHS[range]
    if (!months) return chartData
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
    return chartData.filter((d) => d.month >= cutoffStr)
  })()

  const minVal = filtered.length ? Math.min(...filtered.map((d) => d.value)) : 0
  const maxVal = filtered.length ? Math.max(...filtered.map((d) => d.value)) : 1
  const { domain, ticks } = niceScale(minVal, maxVal)

  function CustomTooltip({ active, payload, label }: {
    active?: boolean; payload?: Array<{ value: number }>; label?: string
  }) {
    if (!active || !payload?.length || !label) return null
    const [y, m] = label.split('-').map(Number)
    const date = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs mb-1">{date}</p>
        <p className="font-semibold font-mono">{formatCurrency(payload[0].value, displayCurrency)}</p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{t('title')}</CardTitle>
          <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 text-xs rounded transition-colors font-medium ${
                  range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-4">
        {loading ? (
          <div className="h-52 flex items-center justify-center">
            <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/40 animate-pulse rounded-full" />
            </div>
          </div>
        ) : filtered.length < 2 ? (
          <div className="h-52 flex flex-col items-center justify-center text-muted-foreground text-sm gap-1">
            <p>{t('noData')}</p>
            <p className="text-xs">{t('noDataDesc')}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filtered} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={72}
                domain={domain}
                ticks={ticks}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--primary)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
