'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { TEMPLATE_COLORS } from '@/types'
import type { AssetWithValue, Section, SectionTemplate } from '@/types'
import type { Currency } from '@/types'

interface AllocationChartProps {
  sections: Section[]
  assets: AssetWithValue[]
  cashTotalsBySectionId: Record<string, number>
  displayCurrency: Currency
  totalNetWorth: number
  sectionValueOverrides?: Record<string, number>
}

interface SliceData {
  name: string
  value: number
  color: string
  pct: number
}

export function AllocationChart({
  sections, assets, cashTotalsBySectionId, displayCurrency, totalNetWorth, sectionValueOverrides,
}: AllocationChartProps) {
  const t = useTranslations('allocationChart')

  const data = useMemo<SliceData[]>(() => {
    if (totalNetWorth <= 0) return []

    return sections
      .map((section) => {
        const isSavings = section.template === 'savings'
        const override = sectionValueOverrides?.[section.id]
        const value = override !== undefined
          ? override
          : isSavings
            ? (cashTotalsBySectionId[section.id] ?? 0)
            : assets.filter((a) => a.section_id === section.id).reduce((s, a) => s + a.currentValueDisplay, 0)
        return {
          name: section.name,
          value,
          color: section.color ?? TEMPLATE_COLORS[section.template as SectionTemplate] ?? '#6b7280',
          pct: (value / totalNetWorth) * 100,
        }
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [sections, assets, cashTotalsBySectionId, totalNetWorth, sectionValueOverrides])

  function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SliceData }> }) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="font-medium mb-0.5">{d.name}</p>
        <p className="font-mono font-semibold">{formatCurrency(d.value, displayCurrency)}</p>
        <p className="text-muted-foreground text-xs">{d.pct.toFixed(1)} %</p>
      </div>
    )
  }

  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base font-semibold">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Donut */}
          <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Celková hodnota ve středu */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xs text-muted-foreground leading-none mb-0.5">{t('total')}</p>
              <p className="text-sm font-bold font-mono leading-none">
                {formatCurrency(totalNetWorth, displayCurrency)}
              </p>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex flex-col gap-2 w-full min-w-0">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-sm truncate flex-1 min-w-0">{d.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{d.pct.toFixed(1)} %</span>
                <span className="text-xs font-mono shrink-0">{formatCurrency(d.value, displayCurrency)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
