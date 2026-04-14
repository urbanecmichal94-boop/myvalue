'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type AssetWithValue, type Section, type SectionTemplate } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import type { Currency } from '@/types'
import { computeMonthlyValuesFromHistory, computeReturns, YearlyReturns, MONTHS, ReturnBadge, monthName } from './performance-shared'

// ─── Typy ─────────────────────────────────────────────────────────────────────

interface DashboardPerformanceTableProps {
  sections: Section[]
  assets: AssetWithValue[]
  displayCurrency: Currency
  rates: CurrencyCache
}

const TEMPLATE_TO_HISTORY_TYPE: Partial<Record<SectionTemplate, string>> = {
  stocks:    'stock',
  crypto:    'crypto',
  commodity: 'commodity',
}

// ─── Komponenta ───────────────────────────────────────────────────────────────

export function DashboardPerformanceTable({ sections, assets, displayCurrency, rates }: DashboardPerformanceTableProps) {
  const t = useTranslations('performanceTable')

  const [yearlyReturns, setYearlyReturns] = useState<YearlyReturns | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(false)

  const onlineAssets = assets.filter(
    (a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0
  )

  useEffect(() => {
    if (onlineAssets.length === 0) { setLoading(false); return }

    async function fetchAndCompute() {
      setLoading(true)
      setError(false)
      try {
        // Seskupit tickery dle typu
        const byType: Record<string, string[]> = {}
        for (const asset of onlineAssets) {
          const section = sections.find((s) => s.id === asset.section_id)
          if (!section) continue
          const type = TEMPLATE_TO_HISTORY_TYPE[section.template]
          if (!type) continue
          if (!byType[type]) byType[type] = []
          if (!byType[type].includes(asset.ticker!)) byType[type].push(asset.ticker!)
        }

        // Paralelní fetch pro každý typ
        const from = '2025-12-01'
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        const mergedHistory: Record<string, Record<string, number>> = {}

        await Promise.all(
          Object.entries(byType).map(async ([type, tickers]) => {
            const res = await fetch(
              `/api/history?tickers=${encodeURIComponent(tickers.join(','))}&from=${from}&to=${tomorrow}&type=${type}`
            )
            if (!res.ok) return
            const data = await res.json() as { history: Record<string, Record<string, number>> }
            Object.assign(mergedHistory, data.history)
          })
        )

        const monthlyValues = computeMonthlyValuesFromHistory(onlineAssets, mergedHistory, rates, displayCurrency)
        const returns = computeReturns(monthlyValues)
        setYearlyReturns(returns)
      } catch (e) {
        console.error('DashboardPerformanceTable error:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchAndCompute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => a.id + a.totalQuantity).join(','), displayCurrency])

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>
  if (error)   return <p className="text-sm text-destructive py-6 text-center">{t('error')}</p>
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
