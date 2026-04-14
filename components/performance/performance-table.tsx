'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type AssetWithValue, type SectionTemplate } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import type { Currency } from '@/types'
import {
  computeMonthlyValuesFromHistory,
  computeReturns,
  type YearlyReturns,
  MONTHS,
  ReturnBadge,
  monthName,
} from './performance-shared'

// ─── Typy ─────────────────────────────────────────────────────────────────────

interface PerformanceTableProps {
  assets: AssetWithValue[]
  template: SectionTemplate
  displayCurrency: Currency
  rates: CurrencyCache
}

const TEMPLATE_TO_HISTORY_TYPE: Partial<Record<SectionTemplate, string>> = {
  stocks:    'stock',
  crypto:    'crypto',
  commodity: 'commodity',
}

// ─── Komponenta ───────────────────────────────────────────────────────────────

export function PerformanceTable({ assets, template, displayCurrency, rates }: PerformanceTableProps) {
  const t = useTranslations('performanceTable')

  const [yearlyReturns, setYearlyReturns] = useState<YearlyReturns | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(false)

  const onlineAssets = assets.filter(
    (a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0
  )

  const historyType = TEMPLATE_TO_HISTORY_TYPE[template]

  useEffect(() => {
    if (onlineAssets.length === 0 || !historyType) {
      setLoading(false)
      return
    }

    async function fetchAndCompute() {
      setLoading(true)
      setError(false)
      try {
        const tickers  = onlineAssets.map((a) => a.ticker!).join(',')
        const from     = '2025-12-01'
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        const res = await fetch(
          `/api/history?tickers=${encodeURIComponent(tickers)}&from=${from}&to=${tomorrow}&type=${historyType}`
        )
        if (!res.ok) throw new Error('HTTP ' + res.status)

        const data = await res.json() as { history: Record<string, Record<string, number>> }
        const monthlyValues = computeMonthlyValuesFromHistory(onlineAssets, data.history, rates, displayCurrency)
        const returns = computeReturns(monthlyValues)
        setYearlyReturns(returns)
      } catch (e) {
        console.error('PerformanceTable error:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchAndCompute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => a.id + a.totalQuantity).join(','), template, displayCurrency])

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>
  if (error)   return <p className="text-sm text-destructive py-6 text-center">{t('error')}</p>

  if (onlineAssets.length === 0 || !historyType)
    return <p className="text-sm text-muted-foreground py-6 text-center">{t('noOnlineAssets')}</p>

  if (!yearlyReturns || Object.keys(yearlyReturns).length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{t('noData')}</p>

  const years = Object.keys(yearlyReturns).map(Number).sort((a, b) => b - a)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{t('year')}</th>
            {MONTHS.map((m) => (
              <th key={m} className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-xs">
                {monthName(m)}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t('yearTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const monthData = yearlyReturns[year]
            const values = MONTHS.map((m) => monthData[m]).filter((v): v is number => v !== null && v !== undefined)
            const yearTotal = values.length > 0
              ? parseFloat(((values.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100).toFixed(2))
              : null

            return (
              <tr key={year} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2 font-semibold">{year}</td>
                {MONTHS.map((m) => {
                  const val = monthData[m] ?? null
                  return (
                    <td key={m} className="px-2 py-2 text-right tabular-nums font-mono text-xs whitespace-nowrap">
                      {val !== null
                        ? <ReturnBadge value={val} />
                        : <span className="text-muted-foreground">{t('noDataForMonth')}</span>
                      }
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums font-mono font-semibold whitespace-nowrap">
                  {yearTotal !== null
                    ? <ReturnBadge value={yearTotal} bold />
                    : <span className="text-muted-foreground">{t('noDataForMonth')}</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
