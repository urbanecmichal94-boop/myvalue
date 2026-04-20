'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Settings2, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Section, Currency } from '@/types'
import type { CurrencyCache, TickerHistory, CurrencyRateHistory } from '@/lib/storage'
import { getChartSectionFilter, saveChartSectionFilter } from '@/lib/storage'
import { TEMPLATE_COLORS } from '@/types'
import { formatCurrency } from '@/lib/format'
import {
  generateMonths,
  getEarliestTransactionMonth,
  calculateMonthlyValues,
  currentMonthLabel,
  currentYearMonth,
  type MonthlyValue,
} from '@/lib/history'
import type { Asset, Transaction } from '@/types'

// ─── Typy a konstanty ────────────────────────────────────────────────────────

type TimeRange = 'ALL' | '10Y' | '5Y' | '3Y' | '1Y'

const RANGES: TimeRange[] = ['ALL', '10Y', '5Y', '3Y', '1Y']

const RANGE_YEARS: Record<TimeRange, number | null> = {
  ALL: null, '10Y': 10, '5Y': 5, '3Y': 3, '1Y': 1,
}

// ─── Formátovací helpers ─────────────────────────────────────────────────────

function formatYAxis(value: number, currency: Currency): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

function xAxisInterval(count: number): number {
  if (count <= 12) return 1
  if (count <= 36) return 2
  if (count <= 72) return 5
  return 11
}

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

interface PortfolioChartProps {
  sections: Section[]
  assets: Asset[]
  transactions: Transaction[]
  history: Record<string, TickerHistory>
  rates: CurrencyCache
  displayCurrency: Currency
  historyLoading: boolean
  // Živé hodnoty pro aktuální měsíc (section_id → hodnota v display měně)
  currentSectionValues: Record<string, number>
  rateHistory: CurrencyRateHistory | null
}

export function PortfolioChart({
  sections,
  assets,
  transactions,
  history,
  rates,
  displayCurrency,
  historyLoading,
  currentSectionValues,
  rateHistory,
}: PortfolioChartProps) {
  const t = useTranslations('portfolioChart')
  const [range, setRange] = useState<TimeRange>('ALL')
  const [enabledIds, setEnabledIds] = useState<Set<string> | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterPos, setFilterPos] = useState<{ top: number; left: number } | null>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Načíst uložený filtr — prázdné pole [] je falsy pro naše účely
  useEffect(() => {
    const saved = getChartSectionFilter()
    if (saved && saved.length > 0) {
      setEnabledIds(new Set(saved))
    } else {
      setEnabledIds(new Set(sections.map((s) => s.id)))
    }
  }, [sections])

  // Synchronizovat nové sekce (přidané po načtení)
  useEffect(() => {
    if (!enabledIds) return
    const newIds = sections.map((s) => s.id).filter((id) => !enabledIds.has(id))
    if (newIds.length > 0) {
      const updated = new Set([...enabledIds, ...newIds])
      setEnabledIds(updated)
      saveChartSectionFilter([...updated])
    }
  }, [sections, enabledIds])

  // Zavřít dropdown kliknutím mimo
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        filterBtnRef.current && !filterBtnRef.current.contains(e.target as Node)
      ) {
        setFilterOpen(false)
      }
    }
    if (filterOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [filterOpen])

  if (!enabledIds) return null

  // ── Výpočet dat grafu ───────────────────────────────────────────────────────

  const earliestMonth = getEarliestTransactionMonth(transactions) ?? new Date().toISOString().slice(0, 7)
  const allMonths = generateMonths(earliestMonth)

  // Filtr dle časového rozsahu
  const years = RANGE_YEARS[range]
  const filteredMonths = years
    ? allMonths.filter((m) => {
        const cutoff = new Date()
        cutoff.setFullYear(cutoff.getFullYear() - years)
        return m >= cutoff.toISOString().slice(0, 7)
      })
    : allMonths

  const historicalData: MonthlyValue[] = calculateMonthlyValues(
    filteredMonths,
    sections,
    enabledIds,
    assets,
    transactions,
    history,
    rates,
    displayCurrency,
    rateHistory,
  )

  // Přidat aktuální měsíc se živými cenami
  const curMonth = currentYearMonth()
  const curBySectionId: Record<string, number> = {}
  let curTotal = 0
  for (const section of sections) {
    if (!enabledIds.has(section.id)) continue
    const val = currentSectionValues[section.id] ?? 0
    curBySectionId[section.id] = val
    curTotal += val
  }
  const currentMonthEntry: MonthlyValue = {
    month: curMonth,
    label: currentMonthLabel(),
    total: curTotal,
    bySectionId: curBySectionId,
  }

  const monthlyData: MonthlyValue[] = [...historicalData, currentMonthEntry]

  const maxValue = Math.max(...monthlyData.map((d) => d.total), 1)
  const interval = xAxisInterval(monthlyData.length)

  // ── Toggle sekce ───────────────────────────────────────────────────────────

  function toggleSection(id: string) {
    const next = new Set(enabledIds)
    if (next.has(id)) {
      if (next.size > 1) next.delete(id)
    } else {
      next.add(id)
    }
    setEnabledIds(next)
    saveChartSectionFilter([...next])
  }

  function resetFilter() {
    const all = new Set(sections.map((s) => s.id))
    setEnabledIds(all)
    saveChartSectionFilter([...all])
  }

  // ── Custom tooltip ─────────────────────────────────────────────────────────

  function CustomTooltip({ active, payload, label }: {
    active?: boolean; payload?: Array<{ value: number }>; label?: string
  }) {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="font-semibold mb-1">{label}</p>
        <p className="font-mono">{formatCurrency(payload[0].value, displayCurrency)}</p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{t('title')}</CardTitle>
          <div className="flex items-center gap-2">
            {/* Filtr sekcí */}
            <button
              ref={filterBtnRef}
              onClick={() => {
                if (!filterOpen && filterBtnRef.current) {
                  const r = filterBtnRef.current.getBoundingClientRect()
                  setFilterPos({ top: r.bottom + 4, left: r.right - 224 })
                }
                setFilterOpen((o) => !o)
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={t('filterSections')}
            >
              <Settings2 className="h-4 w-4" />
            </button>

            {/* Časové rozsahy */}
            <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors font-medium ${
                    range === r
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-4">
        {historyLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : monthlyData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            Žádná historická data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={interval}
              />
              <YAxis
                tickFormatter={(v) => formatYAxis(v, displayCurrency)}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={56}
                domain={[0, Math.ceil(maxValue * 1.05)]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {monthlyData.map((entry, index) => {
                  // Barva dle dominantní sekce
                  let dominantId = ''
                  let maxVal = -1
                  for (const [sid, val] of Object.entries(entry.bySectionId)) {
                    if (val > maxVal) { maxVal = val; dominantId = sid }
                  }
                  const section = sections.find((s) => s.id === dominantId)
                  const color = section ? (section.color ?? TEMPLATE_COLORS[section.template]) : '#3b82f6'
                  return <Cell key={index} fill={color} fillOpacity={0.85} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>

      {/* Dropdown filtr sekcí — portal */}
      {filterOpen && filterPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 9999 }}
          className="bg-card border rounded-lg shadow-lg w-56 py-2"
        >
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('sectionsInChart')}</span>
            <button
              onClick={resetFilter}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title={t('showAll')}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
          <div className="border-t mx-2 mb-1" />
          {sections.map((section) => (
            <label
              key={section.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={enabledIds.has(section.id)}
                onChange={() => toggleSection(section.id)}
                className="h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: section.color ?? TEMPLATE_COLORS[section.template] }}
              />
              <span className="text-sm truncate">{section.name}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </Card>
  )
}
