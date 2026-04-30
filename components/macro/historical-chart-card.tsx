'use client'

import { useState, useId } from 'react'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import type { HistoricalPoint } from '@/data/historical/usa'

export type Range = '10R' | '20R' | '30R' | 'Max'
export const RANGES: Range[] = ['10R', '20R', '30R', 'Max']

export function filterByRange(data: HistoricalPoint[], range: Range): HistoricalPoint[] {
  if (range === 'Max') return data
  const years = parseInt(range)
  const cutoff = new Date().getFullYear() - years
  return data.filter((p) => p.year >= cutoff)
}

function formatValue(value: number, unit: string): string {
  if (unit === 'body') return value >= 1000 ? value.toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) : value.toFixed(2)
  if (unit === '%') return `${value.toFixed(1)} %`
  if (unit === 'index') return value.toFixed(1)
  if (unit === 'tis. Kč') return `${value.toFixed(0)} tis. Kč`
  if (unit === 'roky') return `${value.toFixed(1)} r.`
  if (unit === 'mld. Kč') return `${value.toFixed(0)} mld. Kč`
  if (unit === 'tis. ks') return `${value.toFixed(1)} tis. ks`
  if (unit === 'USD/oz') return `${value.toFixed(0)} USD/oz`
  if (unit === 'USD/lb') return `${value.toFixed(2)} USD/lb`
  if (unit === 'USD/bbl') return `${value.toFixed(0)} USD/bbl`
  if (unit === 'USD/MMBtu') return `${value.toFixed(2)} $/MMBtu`
  if (unit === 'USD') {
    if (value >= 1000) return value.toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) + ' USD'
    if (value < 1) return value.toFixed(2) + ' USD'
    return value.toFixed(0) + ' USD'
  }
  return `${value.toFixed(1)} ${unit}`
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  unit: string
}

function CustomTooltip({ active, payload, label, unit }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name && !['value', 'value2', 'value3'].includes(p.name) ? `${p.name}: ` : ''}
          {formatValue(p.value, unit)}
        </div>
      ))}
    </div>
  )
}

export interface ChartCardProps {
  title: string
  source: string
  unit: string
  color: string
  data: HistoricalPoint[]
  data2?: HistoricalPoint[]
  color2?: string
  label1?: string
  label2?: string
  data3?: HistoricalPoint[]
  color3?: string
  label3?: string
  logScale?: boolean
  defaultLog?: boolean
  referenceZero?: boolean
  rebase?: boolean
  cumulative?: boolean
  altMode?: 'cumulative' | 'rebase'
  altUnit?: string
  note?: string
  area?: boolean
  showCagr?: boolean
}

export function ChartCard({
  title, source, unit, color, data,
  data2, color2, label1, label2,
  data3, color3, label3,
  logScale = false, defaultLog, referenceZero = false, rebase = false, cumulative = false,
  altMode, altUnit = '%', note, area = false, showCagr = false,
}: ChartCardProps) {
  const [range, setRange] = useState<Range>('Max')
  const [useLog, setUseLog] = useState(defaultLog !== undefined ? defaultLog : logScale)
  const [useAlt, setUseAlt] = useState(false)
  const gradientId = useId().replace(/:/g, '')

  const filtered = filterByRange(data, range)
  const filtered2 = data2 ? filterByRange(data2, range) : []
  const filtered3 = data3 ? filterByRange(data3, range) : []

  const effectiveCumulative = cumulative || (useAlt && altMode === 'cumulative')
  const effectiveRebase = rebase || (useAlt && altMode === 'rebase')
  const base = (effectiveRebase || effectiveCumulative) && filtered.length > 0 ? filtered[0].value : 1

  const chartData = filtered.map((p) => {
    const v2 = filtered2.find((p2) => p2.year === p.year)
    const v3 = filtered3.find((p3) => p3.year === p.year)
    return {
      year: p.year,
      _label: p.label ?? String(p.year),
      [label1 ?? 'value']: effectiveCumulative ? (base / p.value - 1) * 100
        : effectiveRebase ? (p.value / base) * 100
        : p.value,
      ...(data2 ? { [label2 ?? 'value2']: v2?.value ?? null } : {}),
      ...(data3 ? { [label3 ?? 'value3']: v3?.value ?? null } : {}),
    }
  })

  const effectiveUnit = useAlt && altMode ? altUnit : unit

  const vals = filtered.map((p) => p.value)
  const vals2 = filtered2.map((p) => p.value)
  const vals3 = filtered3.map((p) => p.value)
  const allVals = [...vals, ...(data2 ? vals2 : []), ...(data3 ? vals3 : [])]
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)

  const showAvg = unit === '%'
  const avg1 = showAvg && vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  const avg2 = showAvg && vals2.length > 0 ? vals2.reduce((s, v) => s + v, 0) / vals2.length : null
  const avg3 = showAvg && vals3.length > 0 ? vals3.reduce((s, v) => s + v, 0) / vals3.length : null

  const cagr = showCagr && filtered.length >= 2
    ? ((filtered[filtered.length - 1].value / filtered[0].value) ** (1 / (filtered[filtered.length - 1].year - filtered[0].year)) - 1) * 100
    : null

  const yDomain = useLog
    ? [Math.max(0.01, minVal * 0.9), maxVal * 1.1]
    : [Math.min(0, minVal < 0 ? minVal * 1.15 : 0), maxVal * 1.1]

  const key1 = label1 ?? 'value'
  const key2 = label2 ?? 'value2'
  const key3 = label3 ?? 'value3'

  const sharedChildren = (
    <>
      {area && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
          {data2 && color2 && (
            <linearGradient id={`${gradientId}b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color2} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color2} stopOpacity={0.01} />
            </linearGradient>
          )}
          {data3 && color3 && (
            <linearGradient id={`${gradientId}c`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color3} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color3} stopOpacity={0.01} />
            </linearGradient>
          )}
        </defs>
      )}
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
      <XAxis
        dataKey="_label"
        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
        tickLine={false}
        axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
        tickLine={false}
        axisLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
        scale={useLog ? 'log' : 'auto'}
        domain={yDomain}
        tickFormatter={(v: number) => {
          if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
          return v % 1 === 0 ? String(v) : v.toFixed(1)
        }}
      />
      <Tooltip content={<CustomTooltip unit={effectiveUnit} />} />
    </>
  )

  const hasLegend = (data2 && color2) || (data3 && color3)

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{source}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {altMode && (
              <button
                onClick={() => setUseAlt((v) => !v)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  useAlt ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-muted hover:border-foreground'
                }`}
              >
                %
              </button>
            )}
            {logScale && (
              <button
                onClick={() => setUseLog((v) => !v)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  useLog ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-muted hover:border-foreground'
                }`}
              >
                log
              </button>
            )}
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  range === r ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground border-muted hover:border-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {showAvg && avg1 !== null && (
            <div className="text-xs text-muted-foreground">
              {avg3 !== null
                ? `Ø ${label1 ?? ''} ${avg1.toFixed(1)} % · ${label2 ?? ''} ${avg2?.toFixed(1)} % · ${label3 ?? ''} ${avg3.toFixed(1)} %`
                : avg2 !== null
                ? `Ø ${label1 ?? ''} ${avg1.toFixed(1)} % · ${label2 ?? ''} ${avg2.toFixed(1)} %`
                : `Ø ${avg1.toFixed(1)} %`}
            </div>
          )}
          {cagr !== null && (
            <div className="text-xs text-muted-foreground">
              Ø růst {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)} % / rok
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        {area ? (
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            {sharedChildren}
            {<ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />}
            <Area type="monotone" dataKey={key1} name={label1} stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 3, fill: color }} />
            {data2 && color2 && <Area type="monotone" dataKey={key2} name={label2} stroke={color2} strokeWidth={1.5} fill={`url(#${gradientId}b)`} dot={false} activeDot={{ r: 3, fill: color2 }} connectNulls />}
            {data3 && color3 && <Area type="monotone" dataKey={key3} name={label3} stroke={color3} strokeWidth={1.5} fill={`url(#${gradientId}c)`} dot={false} activeDot={{ r: 3, fill: color3 }} connectNulls />}
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            {sharedChildren}
            {<ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />}
            <Line type="monotone" dataKey={key1} name={label1} stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color }} />
            {data2 && color2 && <Line type="monotone" dataKey={key2} name={label2} stroke={color2} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color2 }} connectNulls />}
            {data3 && color3 && <Line type="monotone" dataKey={key3} name={label3} stroke={color3} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color3 }} connectNulls />}
          </LineChart>
        )}
      </ResponsiveContainer>

      {(note || hasLegend) && (
        <div className="flex items-center justify-between gap-2">
          {note && <div className="text-xs text-muted-foreground">{note}</div>}
          {hasLegend && (
            <div className="flex items-center gap-3 shrink-0 ml-auto">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span style={{ display: 'inline-block', width: 12, height: 2, background: color, borderRadius: 1 }} />
                {label1 ?? 'série 1'}
              </span>
              {data2 && color2 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span style={{ display: 'inline-block', width: 12, height: 2, background: color2, borderRadius: 1 }} />
                  {label2 ?? 'série 2'}
                </span>
              )}
              {data3 && color3 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span style={{ display: 'inline-block', width: 12, height: 2, background: color3, borderRadius: 1 }} />
                  {label3 ?? 'série 3'}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
