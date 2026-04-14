'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKc(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M Kč'
  if (n >= 1_000)     return Math.round(n / 1_000).toLocaleString('cs-CZ') + ' tis. Kč'
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}

function fmtKcFull(n: number) {
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}

// ── výpočet ───────────────────────────────────────────────────────────────────

interface DataPoint {
  year:       number
  totalValue: number
  invested:   number
  interest:   number
  realValue:  number   // po odečtení inflace
}

function calcCompound(
  initial: number,
  monthly: number,
  annualRate: number,
  years: number,
  inflation: number,
): DataPoint[] {
  const r = annualRate / 100 / 12
  const points: DataPoint[] = []

  for (let y = 0; y <= years; y++) {
    const months    = y * 12
    const fvInitial = initial * Math.pow(1 + r, months)
    const fvContrib = r > 0
      ? monthly * ((Math.pow(1 + r, months) - 1) / r)
      : monthly * months
    const totalValue = fvInitial + fvContrib
    const invested   = initial + monthly * months
    const interest   = totalValue - invested
    const realValue  = totalValue / Math.pow(1 + inflation / 100, y)

    points.push({
      year:       y,
      totalValue: Math.round(totalValue),
      invested:   Math.round(invested),
      interest:   Math.round(Math.max(0, interest)),
      realValue:  Math.round(realValue),
    })
  }
  return points
}

// ── SliderField ───────────────────────────────────────────────────────────────

function SliderField({
  label, value, min, max, step, suffix,
  sliderMin, sliderMax,
  onChange,
  formatDisplay,
  color,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  sliderMin?: number
  sliderMax?: number
  onChange: (v: number) => void
  formatDisplay?: (v: number) => string
  color?: string
}) {
  const [text, setText]       = useState(String(value))
  const [focused, setFocused] = useState(false)
  const sMin = sliderMin ?? min
  const sMax = sliderMax ?? max

  function commit(raw: string) {
    const parsed = parseFloat(raw.replace(',', '.').replace(/\s/g, ''))
    if (!isNaN(parsed)) {
      const clamped = Math.min(Math.max(parsed, min), max)
      onChange(clamped)
      setText(String(clamped))
    } else {
      setText(String(value))
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="text" inputMode="decimal"
          value={focused ? text : (formatDisplay ? formatDisplay(value) : String(value))}
          onFocus={() => { setFocused(true); setText(String(value)) }}
          onBlur={() => { setFocused(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
      </div>
      <input
        type="range" min={sMin} max={sMax} step={step}
        value={Math.min(Math.max(value, sMin), sMax)}
        onChange={(e) => {
          const v = step % 1 === 0 ? parseInt(e.target.value) : parseFloat(e.target.value)
          onChange(v)
          if (!focused) setText(String(v))
        }}
        className="w-full mt-2"
        style={color ? { accentColor: color } : undefined}
      />
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, showB, showInflation }: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: number
  showB: boolean
  showInflation: boolean
}) {
  const t = useTranslations('calculators.compound')
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-md p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold text-sm mb-1.5">{t('tooltipYear', { n: label ?? 0 })}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums">{fmtKcFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── hlavní komponenta ─────────────────────────────────────────────────────────

export function CompoundCalculator() {
  const t = useTranslations('calculators.compound')
  // Scénář A
  const [initial, setInitial] = useState(100_000)
  const [monthly, setMonthly] = useState(10_000)
  const [rate, setRate]       = useState(10)
  const [years, setYears]     = useState(30)

  // Inflace
  const [inflation, setInflation] = useState(0)

  // Scénář B
  const [showB, setShowB]     = useState(false)
  const [monthlyB, setMonthlyB] = useState(3_000)
  const [rateB, setRateB]     = useState(4)

  const dataA = useMemo(
    () => calcCompound(initial, monthly, rate, years, inflation),
    [initial, monthly, rate, years, inflation]
  )
  const dataB = useMemo(
    () => showB ? calcCompound(initial, monthlyB, rateB, years, inflation) : [],
    [initial, monthlyB, rateB, years, inflation, showB]
  )

  // Merge pro graf
  const chartData = useMemo(() => dataA.map((ptA, i) => ({
    year:       ptA.year,
    invested:   ptA.invested,
    interest:   ptA.interest,
    totalA:     ptA.totalValue,
    realA:      ptA.realValue,
    ...(showB && dataB[i] ? { totalB: dataB[i].totalValue, realB: dataB[i].realValue } : {}),
  })), [dataA, dataB, showB])

  const lastA = dataA[dataA.length - 1]
  const lastB = showB ? dataB[dataB.length - 1] : null

  const tickInterval = years <= 10 ? 0 : years <= 20 ? 4 : 9

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-6xl">

      {/* ═══ Levý panel ═══ */}
      <div className="flex-none lg:w-72 space-y-4">

        {/* Scénář A */}
        <div className="rounded-lg border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">
              {showB ? <span className="flex items-center gap-2">{t('scenarioAHeader')} <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /></span> : t('parametersHeader')}
            </h2>
          </div>

          <SliderField label={t('labelInitial')} suffix="Kč"
            value={initial} min={0} max={50_000_000} step={10_000} sliderMax={5_000_000}
            onChange={setInitial} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
          <SliderField label={t('labelMonthly')} suffix="Kč"
            value={monthly} min={0} max={1_000_000} step={500} sliderMax={100_000}
            onChange={setMonthly} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')}
            color="#60a5fa" />
          <SliderField label={t('labelRate')} suffix="%"
            value={rate} min={0} max={50} step={0.5} sliderMax={20}
            onChange={setRate} formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
            color="#60a5fa" />
          <SliderField label={t('labelYears')} suffix="let"
            value={years} min={1} max={100} step={1} sliderMax={50}
            onChange={setYears} formatDisplay={(v) => String(Math.round(v))} />
        </div>

        {/* Inflace */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">{t('inflationHeader')}</h2>
          <SliderField label={t('labelInflation')} suffix="%"
            value={inflation} min={0} max={20} step={0.5} sliderMax={10}
            onChange={setInflation} formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
            color="#f59e0b" />
          <p className="text-[11px] text-muted-foreground">
            Reálný výnos ≈ {Math.max(0, rate - inflation).toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} % p.a.
            (Fisher: {(((1 + rate / 100) / (1 + inflation / 100) - 1) * 100).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %)
          </p>
        </div>

        {/* Scénář B toggle + vstupy */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={showB} onChange={(e) => setShowB(e.target.checked)}
              className="rounded accent-orange-400" />
            <span className="font-semibold text-base">{t('compareScenarioB')}</span>
            {showB && <span className="w-2.5 h-2.5 rounded-full bg-orange-400 ml-auto" />}
          </label>

          {showB && (
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground">{t('sharedDesc')}</p>
              <SliderField label={t('labelMonthlyB')} suffix="Kč"
                value={monthlyB} min={0} max={1_000_000} step={500} sliderMax={100_000}
                onChange={setMonthlyB} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')}
                color="#fb923c" />
              <SliderField label={t('labelRateB')} suffix="%"
                value={rateB} min={0} max={50} step={0.5} sliderMax={20}
                onChange={setRateB} formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
                color="#fb923c" />
            </div>
          )}
        </div>

        {/* Výsledky */}
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('afterYears', { n: years })}
          </h3>

          {/* Scénář A výsledky */}
          <div className={showB ? 'pb-3 border-b border-border' : ''}>
            {showB && <p className="text-[10px] font-semibold text-blue-400 mb-1.5 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />{t('scenarioAHeader')}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">{t('labelNominal')}</p>
                <p className="text-lg font-bold text-primary">{fmtKc(lastA.totalValue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t('labelRealWithPct', { pct: inflation })}</p>
                <p className="text-lg font-bold text-amber-500">{fmtKc(lastA.realValue)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <p className="text-[10px] text-muted-foreground">{t('labelInvested')}</p>
                <p className="text-sm font-semibold">{fmtKc(lastA.invested)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{t('labelReturns')}</p>
                <p className="text-sm font-semibold text-green-500">{fmtKc(lastA.interest)}</p>
              </div>
            </div>
          </div>

          {/* Scénář B výsledky */}
          {showB && lastB && (
            <div>
              <p className="text-[10px] font-semibold text-orange-400 mb-1.5 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />{t('scenarioBLabel')}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelNominal')}</p>
                  <p className="text-lg font-bold text-orange-400">{fmtKc(lastB.totalValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelRealShort')}</p>
                  <p className="text-lg font-bold text-amber-500/70">{fmtKc(lastB.realValue)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelInvested')}</p>
                  <p className="text-sm font-semibold">{fmtKc(lastB.invested)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelReturns')}</p>
                  <p className="text-sm font-semibold text-green-500">{fmtKc(lastB.interest)}</p>
                </div>
              </div>
              {/* Rozdíl */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">{t('labelDiffAB')}</p>
                <p className={`text-sm font-bold ${lastA.totalValue >= lastB.totalValue ? 'text-green-500' : 'text-red-400'}`}>
                  {lastA.totalValue >= lastB.totalValue ? '+' : ''}{fmtKc(lastA.totalValue - lastB.totalValue)}
                </p>
              </div>
            </div>
          )}

          {!showB && (
            <>
              <div className="h-px bg-border" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelGrowth')}</p>
                  <p className="text-sm font-semibold text-green-500">
                    +{lastA.invested > 0 ? ((lastA.totalValue - lastA.invested) / lastA.invested * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) : 0} %
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('labelMultiplier')}</p>
                  <p className="text-sm font-semibold">
                    ×{lastA.invested > 0 ? (lastA.totalValue / lastA.invested).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '1,0'}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{t('labelInvested')}</span><span>{t('labelReturns')}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                  <div className="h-full bg-blue-400 transition-all duration-300"
                    style={{ width: `${Math.min(100, (lastA.invested / lastA.totalValue) * 100)}%` }} />
                  <div className="h-full flex-1 bg-green-500" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Pravý panel ═══ */}
      <div className="flex-1 space-y-4">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-4">
            {showB ? t('chartTitleCompare') : t('chartTitleSingle')}
          </h2>

          <ResponsiveContainer width="100%" height={340}>
            {showB ? (
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : `${Math.round(v / 1_000)}k`} width={60} />
                <Tooltip content={<CustomTooltip showB={showB} showInflation={inflation > 0} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="invested" name={t('chartInvestedAB')} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="totalA" name={t('chartScenarioA')} stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="realA"  name={t('chartScenarioAReal')} stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                <Line type="monotone" dataKey="totalB" name={t('chartScenarioB')} stroke="#fb923c" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="realB"  name={t('chartScenarioBReal')} stroke="#fb923c" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              </LineChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradInterest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : `${Math.round(v / 1_000)}k`} width={60} />
                <Tooltip content={<CustomTooltip showB={false} showInflation={inflation > 0} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="invested" name={t('chartInvested')} stroke="#60a5fa" strokeWidth={2} fill="url(#gradInvested)" stackId="1" />
                <Area type="monotone" dataKey="interest" name={t('chartReturns')} stroke="#22c55e" strokeWidth={2} fill="url(#gradInterest)" stackId="1" />
                {inflation > 0 && (
                  <Area type="monotone" dataKey="realA" name={t('chartRealValue', { pct: inflation })}
                    stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" fill="none" />
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Tabulka */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">{t('tableTitle')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1.5 pr-3 font-medium">{t('colYear')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium">{t('colInvested')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium">{t('colReturnsA')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-blue-500">{t('colTotalA')}</th>
                  {inflation > 0 && <th className="text-right py-1.5 pr-3 font-medium text-amber-500">{t('colRealA')}</th>}
                  {showB && <th className="text-right py-1.5 font-medium text-orange-400">{t('colTotalB')}</th>}
                </tr>
              </thead>
              <tbody>
                {dataA
                  .filter((_, i) => {
                    if (years <= 10) return i > 0
                    if (years <= 20) return i > 0 && i % 2 === 0
                    return i > 0 && i % 5 === 0
                  })
                  .map((row) => {
                    const rowB = showB ? dataB[row.year] : null
                    return (
                      <tr key={row.year} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-1.5 pr-3 text-muted-foreground">{row.year}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmtKcFull(row.invested)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-green-500">{fmtKcFull(row.interest)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-blue-500">{fmtKcFull(row.totalValue)}</td>
                        {inflation > 0 && <td className="py-1.5 pr-3 text-right tabular-nums text-amber-500">{fmtKcFull(row.realValue)}</td>}
                        {showB && <td className="py-1.5 text-right tabular-nums font-semibold text-orange-400">{rowB ? fmtKcFull(rowB.totalValue) : '—'}</td>}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
