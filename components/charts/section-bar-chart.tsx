'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { convertCurrency } from '@/lib/calculations'
import { getCashAccounts, getCashHistory, computeBalanceAtDate } from '@/lib/db/cash'
import type { AssetWithValue, Section } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import type { Currency } from '@/types'
import { TEMPLATE_COLORS } from '@/types'

type Range = '6M' | '1R' | '2R' | '3R' | '5R' | 'Max'
const RANGES: Range[] = ['6M', '1R', '2R', '3R', '5R', 'Max']
const RANGE_MONTHS: Record<Range, number | null> = { '6M': 6, '1R': 12, '2R': 24, '3R': 36, '5R': 60, 'Max': null }

const ASSET_TYPE_TO_API: Record<string, string> = {
  stock: 'stock', etf: 'stock', crypto: 'crypto', commodity: 'commodity',
}

interface Props {
  assets: AssetWithValue[]
  section: Section
  rates: CurrencyCache
  displayCurrency: Currency
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function manualValueAtMonth(asset: AssetWithValue, month: string, rates: CurrencyCache, currency: Currency): number {
  const txs = asset.transactions?.filter((t) => t.date.slice(0, 7) <= month) ?? []
  if (txs.length === 0) return 0
  const lastUpdate = txs.filter((t) => t.type === 'update').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastUpdate) return convertCurrency(lastUpdate.price, lastUpdate.currency, currency, rates)
  const qty = quantityAtMonth(asset, month)
  if (qty <= 0) return 0
  const lastBuy = txs.filter((t) => t.type === 'buy').sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastBuy) return convertCurrency(lastBuy.price * qty, lastBuy.currency, currency, rates)
  return 0
}

function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function generateMonths(from: string, to: string): string[] {
  const months: string[] = []
  let cur = from
  while (cur <= to) { months.push(cur); cur = nextMonth(cur) }
  return months
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return new Intl.DateTimeFormat('cs-CZ', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1))
}

function formatYAxis(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

// ─── Komponenta ───────────────────────────────────────────────────────────────

export function SectionBarChart({ assets, section, rates, displayCurrency }: Props) {
  const t = useTranslations('sectionChart')
  const [range, setRange]         = useState<Range>('1R')
  const [chartData, setChartData] = useState<{ month: string; value: number }[]>([])
  const [loading, setLoading]     = useState(true)

  const color = section.color ?? TEMPLATE_COLORS[section.template]

  useEffect(() => {
    async function build() {
      setLoading(true)
      try {
        const todayMonth = new Date().toISOString().slice(0, 7)
        const tomorrow   = new Date(Date.now() + 86400000).toISOString().split('T')[0]

        // ── Savings sekce — z cash historie ───────────────────────────────
        if (section.template === 'savings') {
          const accounts = await getCashAccounts(section.id)
          const allDates = new Set<string>([todayMonth])
          const cashData: { currency: string; history: Awaited<ReturnType<typeof getCashHistory>> }[] = []
          for (const account of accounts) {
            const history = await getCashHistory(account.id)
            history.forEach((e) => allDates.add(e.date.slice(0, 7)))
            cashData.push({ currency: account.currency, history })
          }
          if (allDates.size < 2) { setChartData([]); return }
          const sorted = generateMonths(Array.from(allDates).sort()[0], todayMonth)
          const result = sorted.map((month) => {
            let value = 0
            for (const { currency, history } of cashData) {
              value += convertCurrency(computeBalanceAtDate(history, `${month}-31`), currency, displayCurrency, rates)
            }
            return { month, value: parseFloat(value.toFixed(2)) }
          }).filter((d) => d.value > 0)
          setChartData(result)
          return
        }

        // ── Asset sekce — live + manuální ─────────────────────────────────
        const liveAssets = assets.filter((a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0)
        const mergedHistory: Record<string, Record<string, number>> = {}

        if (liveAssets.length > 0) {
          const byType: Record<string, Set<string>> = {}
          for (const asset of liveAssets) {
            const apiType = ASSET_TYPE_TO_API[asset.type]
            if (!apiType) continue
            if (!byType[apiType]) byType[apiType] = new Set()
            byType[apiType].add(asset.ticker!)
          }
          await Promise.all(
            Object.entries(byType).map(async ([type, tickerSet]) => {
              try {
                const res = await fetch(`/api/history?tickers=${encodeURIComponent(Array.from(tickerSet).join(','))}&from=2020-01-01&to=${tomorrow}&type=${type}`)
                if (!res.ok) return
                const data = await res.json() as { history: Record<string, Record<string, number>> }
                Object.assign(mergedHistory, data.history)
              } catch { /* non-fatal */ }
            })
          )
        }

        const allMonths = new Set<string>([todayMonth])
        for (const months of Object.values(mergedHistory)) {
          for (const m of Object.keys(months)) allMonths.add(m)
        }
        for (const asset of assets.filter((a) => a.priceSource !== 'live' || !a.ticker)) {
          asset.transactions?.forEach((tx) => allMonths.add(tx.date.slice(0, 7)))
        }

        if (allMonths.size === 0) { setChartData([]); return }

        const earliest     = Array.from(allMonths).sort()[0]
        const sortedMonths = generateMonths(earliest, todayMonth)

        const result = sortedMonths.map((month) => {
          let value = 0
          for (const asset of assets) {
            if (asset.priceSource === 'live' && asset.ticker) {
              const qty   = quantityAtMonth(asset, month)
              const price = mergedHistory[asset.ticker]?.[month]
              if (qty > 0 && price) {
                value += convertCurrency(qty * price, asset.priceCurrency ?? 'USD', displayCurrency, rates)
              }
            } else {
              value += manualValueAtMonth(asset, month, rates, displayCurrency)
            }
          }
          return { month, value: parseFloat(value.toFixed(2)) }
        }).filter((d) => d.value > 0)

        setChartData(result)
      } catch (e) {
        console.error('SectionBarChart error:', e)
        setChartData([])
      } finally {
        setLoading(false)
      }
    }

    build()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets.map((a) => `${a.id}:${a.totalQuantity}`).join(','),
    section.id,
    displayCurrency,
  ])

  const filtered = (() => {
    const months = RANGE_MONTHS[range]
    if (!months) return chartData
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
    return chartData.filter((d) => d.month >= cutoffStr)
  })()

  const currentMonth = new Date().toISOString().slice(0, 7)

  function CustomTooltip({ active, payload, label }: {
    active?: boolean; payload?: Array<{ value: number }>; label?: string
  }) {
    if (!active || !payload?.length || !label) return null
    const [y, m] = label.split('-').map(Number)
    const date = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs mb-1">{date}</p>
        <p className="font-semibold font-mono tabular-nums">{formatCurrency(payload[0].value, displayCurrency)}</p>
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
          <div className="h-48 flex items-center justify-center">
            <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/40 animate-pulse rounded-full" />
            </div>
          </div>
        ) : filtered.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            {t('noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={filtered} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
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
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {filtered.map((entry) => (
                  <Cell
                    key={entry.month}
                    fill={color}
                    fillOpacity={entry.month === currentMonth ? 1 : 0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
