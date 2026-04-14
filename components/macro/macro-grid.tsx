'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { FredData, FredSeriesPoint } from '@/app/api/macro/fred/route'
import type { MarketsData } from '@/app/api/macro/markets/route'
import type { CnbData } from '@/app/api/macro/cnb/route'
import { getMacroCache } from '@/lib/storage'
import { useTranslations } from 'next-intl'

type TimeWindow = '1R' | '2R' | '3R'

const COLORS = {
  cz:     '#3b82f6',
  eu:     '#10b981',
  usa:    '#f59e0b',
  cnb:    '#3b82f6',
  ecb:    '#10b981',
  fed:    '#f59e0b',
  wti:    '#3b82f6',
  brent:  '#f59e0b',
  eurczk: '#3b82f6',
  usdczk: '#10b981',
}

function filterByWindow(data: { date: string; [k: string]: unknown }[], window: TimeWindow) {
  const months = window === '1R' ? 12 : window === '2R' ? 24 : 36
  return data.slice(-months)
}

function labelDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('cs-CZ', { month: 'short', year: '2-digit' })
}

function mergeSeries(
  keys: Array<{ key: string; series: FredSeriesPoint[] }>
): Record<string, unknown>[] {
  const map: Record<string, Record<string, unknown>> = {}
  for (const { key, series } of keys) {
    for (const pt of series) {
      if (!map[pt.date]) map[pt.date] = { date: pt.date, label: labelDate(pt.date) }
      map[pt.date][key] = pt.value
    }
  }
  return Object.values(map).sort((a, b) => (a.date as string).localeCompare(b.date as string))
}

// ─── Karta grafu ─────────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string
  unit: string
  data: Record<string, unknown>[]
  lines: Array<{ key: string; label: string; color: string }>
  loading?: boolean
  window: TimeWindow
  onWindowChange: (w: TimeWindow) => void
}

function ChartCard({ title, unit, data, lines, loading, window, onWindowChange }: ChartCardProps) {
  const t = useTranslations('macro')
  const filtered = filterByWindow(data as { date: string; [k: string]: unknown }[], window)

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-1">
          {(['1R', '2R', '3R'] as TimeWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                window === w
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">{t('loading')}</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={filtered} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} unit={unit} />
            <Tooltip formatter={(v, name) => [`${v} ${unit}`, name]} contentStyle={{ fontSize: 12 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                stroke={l.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function MacroGrid() {
  const t = useTranslations('macro')
  const [fred, setFred]       = useState<FredData | null>(null)
  const [markets, setMarkets] = useState<MarketsData | null>(null)
  const [cnb, setCnb]         = useState<CnbData | null>(null)
  const [loading, setLoading] = useState(true)
  const [window, setWindow]   = useState<TimeWindow>('1R')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const cache = getMacroCache()

        const [fredRes, marketsRes, cnbRes] = await Promise.all([
          fetch('/api/macro/fred'),
          cache.markets ? Promise.resolve(null) : fetch('/api/macro/markets'),
          cache.cnb     ? Promise.resolve(null) : fetch('/api/macro/cnb'),
        ])

        if (fredRes.ok) setFred(await fredRes.json())
        if (marketsRes?.ok) setMarkets(await marketsRes.json())
        else if (cache.markets) setMarkets(cache.markets)
        if (cnbRes?.ok) setCnb(await cnbRes.json())
        else if (cache.cnb) setCnb(cache.cnb)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Inflace
  const inflationData = fred ? mergeSeries([
    { key: 'cz',  series: fred.cpiCz },
    { key: 'eu',  series: fred.cpiEu },
    { key: 'usa', series: fred.cpiUs },
  ]) : []

  // Úrokové sazby — ČNB je jedna hodnota, pro graf použijeme jen statický bod
  const ratesData = fred ? [] : []  // zatím bez historických dat sazeb

  // Nezaměstnanost
  const unemploymentData = fred ? mergeSeries([
    { key: 'cz',  series: fred.unemploymentCz },
    { key: 'eu',  series: fred.unemploymentEu },
    { key: 'usa', series: fred.unemploymentUs },
  ]) : []

  // HDP
  const gdpData = fred ? mergeSeries([
    { key: 'cz',  series: fred.gdpCz },
    { key: 'eu',  series: fred.gdpEu },
    { key: 'usa', series: fred.gdpUs },
  ]) : []

  // Ropa — zatím jen aktuální hodnota, historická data přidáme přes Yahoo history
  const oilData = markets ? [
    { date: markets.date, label: labelDate(markets.date), wti: markets.oilWti, brent: markets.oilBrent }
  ] : []

  // Kurzy — aktuální hodnota z ČNB
  const fxData = cnb ? [
    { date: cnb.date, label: labelDate(cnb.date), eurczk: cnb.eurCzk, usdczk: cnb.usdCzk }
  ] : []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ChartCard
        title={t('chartInflation')}
        unit="%"
        data={inflationData}
        lines={[
          { key: 'cz',  label: 'CZ',  color: COLORS.cz  },
          { key: 'eu',  label: 'EU',  color: COLORS.eu  },
          { key: 'usa', label: 'USA', color: COLORS.usa },
        ]}
        loading={loading}
        window={window}
        onWindowChange={setWindow}
      />
      <ChartCard
        title={t('chartUnemployment')}
        unit="%"
        data={unemploymentData}
        lines={[
          { key: 'cz',  label: 'CZ',  color: COLORS.cz  },
          { key: 'eu',  label: 'EU',  color: COLORS.eu  },
          { key: 'usa', label: 'USA', color: COLORS.usa },
        ]}
        loading={loading}
        window={window}
        onWindowChange={setWindow}
      />
      <ChartCard
        title={t('chartGdp')}
        unit="%"
        data={gdpData}
        lines={[
          { key: 'cz',  label: 'CZ',  color: COLORS.cz  },
          { key: 'eu',  label: 'EU',  color: COLORS.eu  },
          { key: 'usa', label: 'USA', color: COLORS.usa },
        ]}
        loading={loading}
        window={window}
        onWindowChange={setWindow}
      />
      <ChartCard
        title={t('chartOil')}
        unit=" USD"
        data={oilData}
        lines={[
          { key: 'wti',   label: 'WTI',   color: COLORS.wti   },
          { key: 'brent', label: 'Brent', color: COLORS.brent },
        ]}
        loading={loading}
        window={window}
        onWindowChange={setWindow}
      />
      <ChartCard
        title={t('chartFxCzk')}
        unit=""
        data={fxData}
        lines={[
          { key: 'eurczk', label: 'EUR/CZK', color: COLORS.eurczk },
          { key: 'usdczk', label: 'USD/CZK', color: COLORS.usdczk },
        ]}
        loading={loading}
        window={window}
        onWindowChange={setWindow}
      />
    </div>
  )
}
