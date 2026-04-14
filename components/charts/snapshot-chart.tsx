'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { PortfolioSnapshot } from '@/lib/storage'
import type { Currency } from '@/types'

type Range = '1T' | '1M' | '3M' | '6M' | '1R'

const RANGES: Range[] = ['1T', '1M', '3M', '6M', '1R']

const RANGE_DAYS: Record<Range, number> = {
  '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365,
}

function formatXAxis(date: string, range: Range): string {
  const d = new Date(date)
  if (range === '1T') {
    return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function formatYAxis(value: number, currency: Currency): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toFixed(0)
}

interface SnapshotChartProps {
  snapshots: PortfolioSnapshot[]
  displayCurrency: Currency
}

export function SnapshotChart({ snapshots, displayCurrency }: SnapshotChartProps) {
  const t = useTranslations('snapshotChart')
  const [range, setRange] = useState<Range>('1M')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range])
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const filtered = snapshots.filter((s) => s.date >= cutoffStr)

  function CustomTooltip({ active, payload, label }: {
    active?: boolean; payload?: Array<{ value: number }>; label?: string
  }) {
    if (!active || !payload?.length || !label) return null
    const d = new Date(label)
    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="text-muted-foreground text-xs mb-1">
          {d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <p className="font-semibold font-mono">{formatCurrency(payload[0].value, displayCurrency)}</p>
      </div>
    )
  }

  const minVal = filtered.length ? Math.min(...filtered.map((s) => s.value)) : 0
  const maxVal = filtered.length ? Math.max(...filtered.map((s) => s.value)) : 1
  const padding = (maxVal - minVal) * 0.1 || maxVal * 0.1

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
      </CardHeader>

      <CardContent className="px-2 pb-4">
        {filtered.length < 2 ? (
          <div className="h-52 flex flex-col items-center justify-center text-muted-foreground text-sm gap-1">
            <p>{t('noData')}</p>
            <p className="text-xs">{t('noDataDesc')}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filtered} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatXAxis(v, range)}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => formatYAxis(v, displayCurrency)}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={56}
                domain={[Math.max(0, minVal - padding), maxVal + padding]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
