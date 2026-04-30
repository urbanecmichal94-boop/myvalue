'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { convertCurrency } from '@/lib/calculations'
import { getCashAccounts, getCashHistory, computeBalanceAtDate } from '@/lib/db/cash'
import { calcPropertyEquity } from '@/lib/property-utils'
import type { AssetWithValue, Section, SectionTemplate } from '@/types'
import { TEMPLATE_COLORS } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import type { Currency } from '@/types'
import type { Property } from '@/types/property'
import type { CashBalanceEntry } from '@/types/cash'

type Range = '6M' | '1R' | '2R' | '3R' | '5R' | 'Max'
const RANGES: Range[] = ['6M', '1R', '2R', '3R', '5R', 'Max']
const RANGE_MONTHS: Record<Range, number | null> = { '6M': 6, '1R': 12, '2R': 24, '3R': 36, '5R': 60, 'Max': null }

const ASSET_TYPE_TO_API: Partial<Record<string, string>> = {
  stock: 'stock', etf: 'stock', crypto: 'crypto', commodity: 'commodity',
}

type ChartPoint = { month: string } & Record<string, number>

interface Props {
  assets: AssetWithValue[]
  sections: Section[]
  rates: CurrencyCache
  displayCurrency: Currency
  properties?: Property[]
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

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
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

function propertyEquityAtMonth(prop: Property, month: string, todayMonth: string): number {
  const purchaseMonth = prop.purchaseDate.slice(0, 7)
  if (month < purchaseMonth) return 0
  const initialEquity = prop.mortgage
    ? Math.max(0, prop.purchasePrice - prop.mortgage.principal)
    : prop.purchasePrice
  const currentEquity = calcPropertyEquity(prop)
  if (month >= todayMonth) return currentEquity
  const total = monthDiff(purchaseMonth, todayMonth)
  if (total <= 0) return currentEquity
  return initialEquity + (currentEquity - initialEquity) * (monthDiff(purchaseMonth, month) / total)
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

export function PortfolioStackedChart({ assets, sections, rates, displayCurrency, properties = [] }: Props) {
  const t = useTranslations('snapshotChart')
  const [range, setRange]       = useState<Range>('1R')
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function buildChart() {
      setLoading(true)
      try {
        const todayMonth = new Date().toISOString().slice(0, 7)
        const from       = '2020-01-01'
        const tomorrow   = new Date(Date.now() + 86400000).toISOString().split('T')[0]

        // ── 1. Historické ceny live aktiv ─────────────────────────────────
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
                const tickers = Array.from(tickerSet).join(',')
                const res = await fetch(`/api/history?tickers=${encodeURIComponent(tickers)}&from=${from}&to=${tomorrow}&type=${type}`)
                if (!res.ok) return
                const data = await res.json() as { history: Record<string, Record<string, number>> }
                Object.assign(mergedHistory, data.history)
              } catch { /* non-fatal */ }
            })
          )
        }

        // ── 2. Cash účty pro savings sekce ────────────────────────────────
        const cashBySectionId: Record<string, { currency: string; history: CashBalanceEntry[] }[]> = {}
        for (const section of sections.filter((s) => s.template === 'savings')) {
          try {
            const accounts = await getCashAccounts(section.id)
            cashBySectionId[section.id] = []
            for (const account of accounts) {
              const history = await getCashHistory(account.id)
              cashBySectionId[section.id].push({ currency: account.currency, history })
            }
          } catch { /* non-fatal */ }
        }

        // ── 3. Rozsah měsíců ──────────────────────────────────────────────
        const allMonths = new Set<string>([todayMonth])

        for (const months of Object.values(mergedHistory)) {
          for (const m of Object.keys(months)) allMonths.add(m)
        }
        for (const asset of assets.filter((a) => a.priceSource !== 'live' || !a.ticker)) {
          asset.transactions?.forEach((tx) => allMonths.add(tx.date.slice(0, 7)))
        }
        for (const entries of Object.values(cashBySectionId)) {
          for (const { history } of entries) {
            history.forEach((e) => allMonths.add(e.date.slice(0, 7)))
          }
        }
        for (const prop of properties) {
          if (prop.purchaseDate) allMonths.add(prop.purchaseDate.slice(0, 7))
        }

        if (allMonths.size === 0) { setChartData([]); return }

        const earliest      = Array.from(allMonths).sort()[0]
        const sortedMonths  = generateMonths(earliest, todayMonth)

        // ── 4. Hodnota každé sekce per měsíc ──────────────────────────────
        const sectionValues: Record<string, Record<string, number>> = {}
        for (const s of sections) sectionValues[s.id] = {}

        for (const month of sortedMonths) {
          for (const section of sections) {
            let value = 0

            if (section.template === 'savings') {
              for (const { currency, history } of (cashBySectionId[section.id] ?? [])) {
                value += convertCurrency(
                  computeBalanceAtDate(history, `${month}-31`),
                  currency, displayCurrency, rates,
                )
              }

            } else if (section.template === 'property') {
              for (const prop of properties) {
                value += convertCurrency(
                  propertyEquityAtMonth(prop, month, todayMonth),
                  'CZK', displayCurrency, rates,
                )
              }

            } else {
              // Live + manuální aktiva
              for (const asset of assets.filter((a) => a.section_id === section.id)) {
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
            }

            sectionValues[section.id][month] = parseFloat(value.toFixed(2))
          }
        }

        // ── 5. Sestavit data pro chart ────────────────────────────────────
        const result: ChartPoint[] = sortedMonths
          .map((month) => {
            const point = { month } as ChartPoint
            let total = 0
            for (const section of sections) {
              const v = sectionValues[section.id][month] ?? 0
              point[section.id] = v
              total += v
            }
            return total > 0 ? point : null
          })
          .filter((p): p is ChartPoint => p !== null)

        setChartData(result)
      } catch (e) {
        console.error('PortfolioStackedChart error:', e)
        setChartData([])
      } finally {
        setLoading(false)
      }
    }

    buildChart()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets.map((a) => `${a.id}:${a.totalQuantity}`).join(','),
    sections.map((s) => s.id).join(','),
    displayCurrency,
    properties.map((p) => `${p.id}:${p.currentValue}`).join(','),
  ])

  // Filtrovat dle range
  const filtered = (() => {
    const months = RANGE_MONTHS[range]
    if (!months) return chartData
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`
    return chartData.filter((d) => d.month >= cutoffStr)
  })()

  function CustomTooltip({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ name: string; value: number; fill: string }>
    label?: string
  }) {
    if (!active || !payload?.length || !label) return null
    const [y, m] = label.split('-').map(Number)
    const date  = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
    const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)

    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm min-w-[200px]">
        <p className="text-muted-foreground text-xs mb-2">{date}</p>
        {[...payload].reverse().map((p) => {
          const section = sections.find((s) => s.id === p.name)
          if (!section || p.value <= 0) return null
          return (
            <div key={p.name} className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
                <span className="text-xs text-muted-foreground truncate">{section.name}</span>
              </div>
              <span className="text-xs font-mono font-medium tabular-nums">
                {formatCurrency(p.value, displayCurrency)}
              </span>
            </div>
          )
        })}
        <div className="border-t mt-1.5 pt-1.5 flex justify-between">
          <span className="text-xs font-medium">{t('total')}</span>
          <span className="text-xs font-mono font-semibold tabular-nums">
            {formatCurrency(total, displayCurrency)}
          </span>
        </div>
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
                {sections.map((section) => {
                  const color = section.color ?? TEMPLATE_COLORS[section.template]
                  return (
                    <linearGradient key={section.id} id={`sg-${section.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                    </linearGradient>
                  )
                })}
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
              />
              <Tooltip content={<CustomTooltip />} />
              {sections.map((section) => {
                const color = section.color ?? TEMPLATE_COLORS[section.template]
                return (
                  <Area
                    key={section.id}
                    type="monotone"
                    dataKey={section.id}
                    stackId="portfolio"
                    stroke={color}
                    strokeWidth={1}
                    fill={`url(#sg-${section.id})`}
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 3, fill: color }}
                    name={section.id}
                    connectNulls
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
