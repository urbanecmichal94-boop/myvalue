'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { makeFmtKc, makeFmtKcFull } from '@/lib/fmt-kc'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPct(n: number, dec = 1) { return n.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %' }

// ── výpočet hypotéky ──────────────────────────────────────────────────────────

function calcMonthlyPayment(principal: number, annualRate: number, years: number) {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function loanBalanceAfter(principal: number, annualRate: number, M: number, months: number) {
  const r = annualRate / 100 / 12
  if (r === 0) return Math.max(0, principal - M * months)
  return Math.max(0, principal * Math.pow(1 + r, months) - M * (Math.pow(1 + r, months) - 1) / r)
}

// ── simulace ─────────────────────────────────────────────────────────────────

interface DataPoint {
  year:           number
  // Hypotéka
  buyNetWorth:    number   // hodnota nemovitosti − zbývající dluh
  propertyValue:  number
  loanBalance:    number
  totalBuyCost:   number   // celkem zaplaceno (splátky + údržba + pojištění)
  // Nájem
  rentNetWorth:   number   // investiční portfolio
  totalRentCost:  number   // celkem zaplaceno na nájmu
  // Srovnání
  advantage:      number   // buyNetWorth − rentNetWorth (kladné = hypotéka výhodnější)
}

function simulate(
  propertyPrice: number,
  downPaymentPct: number,
  mortgageRate: number,
  mortgageYears: number,
  maintenancePct: number,
  insuranceMonthly: number,
  propertyAppreciation: number,
  rentMonthly: number,
  rentGrowth: number,
  investReturn: number,
  years: number,
): DataPoint[] {
  const downPayment = propertyPrice * downPaymentPct / 100
  const principal   = propertyPrice - downPayment
  const M           = calcMonthlyPayment(principal, mortgageRate, mortgageYears)
  const rInvest     = investReturn / 100 / 12
  const rAppreciation = propertyAppreciation / 100 / 12

  let propertyVal  = propertyPrice
  let loanBal      = principal
  let portfolio    = downPayment   // renter investuje akontaci hned
  let currentRent  = rentMonthly
  let totalBuyCost = downPayment
  let totalRentCost = 0

  const points: DataPoint[] = [{
    year: 0,
    buyNetWorth:   propertyPrice - principal,  // = downPayment
    propertyValue: propertyPrice,
    loanBalance:   principal,
    totalBuyCost:  downPayment,
    rentNetWorth:  downPayment,
    totalRentCost: 0,
    advantage:     0,
  }]

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      // Nemovitost se zhodnocuje
      propertyVal = propertyVal * (1 + rAppreciation)

      // Splátka hypotéky
      const monthlyMaintenance = propertyVal * maintenancePct / 100 / 12
      const totalBuyMonthly    = M + monthlyMaintenance + insuranceMonthly

      // Aktualizace dluhu
      if (loanBal > 0) {
        const r       = mortgageRate / 100 / 12
        const interest = loanBal * r
        const prinPaid = Math.min(M - interest, loanBal)
        loanBal       = Math.max(0, loanBal - prinPaid)
      }

      totalBuyCost += totalBuyMonthly

      // Renter: platí nájem, investuje rozdíl (kladný = ušetří, záporný = doplácí)
      const monthDiff = totalBuyMonthly - currentRent
      portfolio = portfolio * (1 + rInvest) + monthDiff

      totalRentCost += currentRent

      // Nájem roste jednou ročně
      if (m === 11) currentRent = currentRent * (1 + rentGrowth / 100)
    }

    const buyNetWorth  = propertyVal - loanBal
    const rentNetWorth = portfolio

    points.push({
      year:          y,
      buyNetWorth:   Math.round(buyNetWorth),
      propertyValue: Math.round(propertyVal),
      loanBalance:   Math.round(loanBal),
      totalBuyCost:  Math.round(totalBuyCost),
      rentNetWorth:  Math.round(rentNetWorth),
      totalRentCost: Math.round(totalRentCost),
      advantage:     Math.round(buyNetWorth - rentNetWorth),
    })
  }

  return points
}

// ── SliderField ───────────────────────────────────────────────────────────────

function SliderField({ label, value, min, max, step, suffix, sliderMax, sliderMin, onChange, formatDisplay, note }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string
  sliderMax?: number; sliderMin?: number; onChange: (v: number) => void
  formatDisplay?: (v: number) => string; note?: string
}) {
  const [text, setText]       = useState(String(value))
  const [focused, setFocused] = useState(false)
  const sMax = sliderMax ?? max
  const sMin = sliderMin ?? min

  function commit(raw: string) {
    const parsed = parseFloat(raw.replace(',', '.').replace(/\s/g, ''))
    if (!isNaN(parsed)) { const c = Math.min(Math.max(parsed, min), max); onChange(c); setText(String(c)) }
    else setText(String(value))
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {note && <span className="text-[10px] text-muted-foreground italic">{note}</span>}
      </div>
      <div className="relative">
        <input type="text" inputMode="decimal"
          value={focused ? text : (formatDisplay ? formatDisplay(value) : String(value))}
          onFocus={() => { setFocused(true); setText(String(value)) }}
          onBlur={() => { setFocused(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
      </div>
      <input type="range" min={sMin} max={sMax} step={step}
        value={Math.min(Math.max(value, sMin), sMax)}
        onChange={(e) => {
          const v = step % 1 === 0 ? parseInt(e.target.value) : parseFloat(e.target.value)
          onChange(v); if (!focused) setText(String(v))
        }}
        className="w-full mt-1.5 accent-primary"
      />
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: number
}) {
  const t = useTranslations('calculators.rentVsBuy')
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card shadow-md p-3 text-xs space-y-1 min-w-[220px]">
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

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function RentVsBuyCalculator() {
  const t = useTranslations('calculators.rentVsBuy')
  const tCommon = useTranslations('common')
  const fmtKc = makeFmtKc(tCommon('suffixMKc'), tCommon('suffixTisKc'), tCommon('suffixKc'))
  const fmtKcFull = makeFmtKcFull(tCommon('suffixKc'))
  // Nemovitost
  const [propertyPrice,        setPropertyPrice]        = useState(8_000_000)
  const [downPaymentPct,       setDownPaymentPct]        = useState(20)
  const [mortgageRate,         setMortgageRate]          = useState(4.0)
  const [mortgageYears,        setMortgageYears]         = useState(30)
  const [maintenancePct,       setMaintenancePct]        = useState(0.5)
  const [insuranceMonthly,     setInsuranceMonthly]      = useState(833)
  const [propertyAppreciation, setPropertyAppreciation]  = useState(5.0)
  // Nájem
  const [rentMonthly,  setRentMonthly]  = useState(25_000)
  const [rentGrowth,   setRentGrowth]   = useState(4.0)
  // Investice
  const [investReturn, setInvestReturn] = useState(7.0)
  // Doba
  const [years, setYears] = useState(30)

  const downPayment = propertyPrice * downPaymentPct / 100
  const principal   = propertyPrice - downPayment
  const M           = calcMonthlyPayment(principal, mortgageRate, mortgageYears)
  const maintenanceMonthly = propertyPrice * maintenancePct / 100 / 12
  const totalBuyMonthly    = M + maintenanceMonthly + insuranceMonthly

  const data = useMemo(
    () => simulate(
      propertyPrice, downPaymentPct, mortgageRate, mortgageYears,
      maintenancePct, insuranceMonthly, propertyAppreciation,
      rentMonthly, rentGrowth, investReturn, years
    ),
    [propertyPrice, downPaymentPct, mortgageRate, mortgageYears,
     maintenancePct, insuranceMonthly, propertyAppreciation,
     rentMonthly, rentGrowth, investReturn, years]
  )

  const last = data[data.length - 1]
  const breakEvenYear = data.find((d, i) => i > 0 && data[i-1].advantage <= 0 && d.advantage > 0)?.year
    ?? data.find((d, i) => i > 0 && data[i-1].advantage >= 0 && d.advantage < 0)?.year

  const buyWins  = last.advantage > 0
  const tickInterval = years <= 10 ? 0 : years <= 20 ? 4 : 9

  return (
    <div className="space-y-4 max-w-6xl">

      {/* ═══ Horní řada — vstupy vedle sebe ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Koupě nemovitosti */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {t('sectionBuy')}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <SliderField label={t('labelPropertyPrice')} suffix="Kč"
                value={propertyPrice} min={500_000} max={50_000_000} step={100_000} sliderMax={20_000_000}
                onChange={setPropertyPrice} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            </div>
            <SliderField label={t('labelDownPayment')} suffix="%"
              value={downPaymentPct} min={10} max={100} step={1}
              onChange={setDownPaymentPct}
              formatDisplay={(v) => String(Math.round(v))}
              note={`= ${fmtKc(downPayment)}`} />
            <SliderField label={t('labelMortgageRate')} suffix="% p.a."
              value={mortgageRate} min={0.5} max={15} step={0.1}
              onChange={setMortgageRate}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} />
            <SliderField label={t('labelMortgageYears')} suffix="let"
              value={mortgageYears} min={5} max={40} step={1}
              onChange={setMortgageYears}
              formatDisplay={(v) => String(Math.round(v))} />
            <SliderField label={t('labelAppreciation')} suffix="% p.a."
              value={propertyAppreciation} min={0} max={15} step={0.5}
              onChange={setPropertyAppreciation}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="CZ ~3–4 %" />
            <SliderField label={t('labelMaintenance')} suffix="% hodnoty/rok"
              value={maintenancePct} min={0} max={5} step={0.1}
              onChange={setMaintenancePct}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="typicky 1–2 %" />
            <SliderField label={t('labelInsurance')} suffix={tCommon('suffixKcMes')}
              value={insuranceMonthly} min={0} max={10_000} step={100} sliderMax={5_000}
              onChange={setInsuranceMonthly}
              formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">{t('mortgagePayment')}</span>
              <span className="font-medium">{fmtKcFull(M)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('maintenance')}</span>
              <span className="font-medium">{fmtKcFull(maintenanceMonthly)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('insurance')}</span>
              <span className="font-medium">{fmtKcFull(insuranceMonthly)}</span>
            </div>
            <div className="flex justify-between col-span-2 border-t border-border pt-1 mt-0.5">
              <span className="font-semibold">{t('totalMonthly')}</span>
              <span className="font-bold text-blue-500">{fmtKcFull(totalBuyMonthly)}</span>
            </div>
          </div>
        </div>

        {/* Nájem + investice */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> {t('sectionRent')}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <SliderField label={t('labelRent')} suffix="Kč"
                value={rentMonthly} min={1_000} max={150_000} step={500} sliderMax={80_000}
                onChange={setRentMonthly} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            </div>
            <SliderField label={t('labelRentGrowth')} suffix="% p.a."
              value={rentGrowth} min={0} max={15} step={0.5}
              onChange={setRentGrowth}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="CZ ~3–5 %" />
            <SliderField label={t('labelInvestReturn')} suffix="% p.a."
              value={investReturn} min={0} max={20} step={0.5} sliderMax={15}
              onChange={setInvestReturn}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="ETF, rozdíl" />
          </div>

          <div className="rounded-md bg-orange-400/10 border border-orange-400/20 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('rentMonthly')}</span>
              <span className="font-medium">{fmtKcFull(rentMonthly)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('monthlyExtra')}</span>
              <span className={`font-medium ${totalBuyMonthly - rentMonthly >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {totalBuyMonthly >= rentMonthly ? '+' : ''}{fmtKcFull(totalBuyMonthly - rentMonthly)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1">
              <span className="font-semibold">{t('downPaymentInvested')}</span>
              <span className="font-bold text-orange-400">{fmtKc(downPayment)}</span>
            </div>
          </div>

          {/* Horizont + výsledek v pravém panelu */}
          <div className="pt-2">
            <SliderField label={t('labelHorizon')} suffix="let"
              value={years} min={1} max={50} step={1}
              onChange={setYears} formatDisplay={(v) => String(Math.round(v))} />
          </div>

          <div className={`rounded-lg border p-4 space-y-3 ${buyWins ? 'border-blue-500/40 bg-blue-500/5' : 'border-orange-400/40 bg-orange-400/5'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('resultAfterYears', { n: years })}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-blue-500 font-semibold mb-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{t('buySide')}
                </p>
                <p className="text-lg font-bold text-blue-500">{fmtKc(last.buyNetWorth)}</p>
                <p className="text-[10px] text-muted-foreground">{fmtKc(last.propertyValue)} − {fmtKc(last.loanBalance)}</p>
              </div>
              <div>
                <p className="text-[10px] text-orange-400 font-semibold mb-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />{t('rentSide')}
                </p>
                <p className="text-lg font-bold text-orange-400">{fmtKc(last.rentNetWorth)}</p>
                <p className="text-[10px] text-muted-foreground">{t('portfolioNote')}</p>
              </div>
            </div>
            <div className={`rounded-md p-2.5 text-center ${buyWins ? 'bg-blue-500/10' : 'bg-orange-400/10'}`}>
              <p className="text-xs text-muted-foreground">{buyWins ? t('buyBetter') : t('rentBetter')}</p>
              <p className={`text-base font-bold ${buyWins ? 'text-blue-500' : 'text-orange-400'}`}>{fmtKc(Math.abs(last.advantage))}</p>
            </div>
            {breakEvenYear && (
              <p className="text-xs text-center text-muted-foreground">
                {t('breakEvenYear', { n: breakEvenYear })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Spodní řada — grafy ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Graf čisté hodnoty */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-1">{t('netWorthTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-3">{t('netWorthSubtitle')}</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : `${Math.round(v/1_000)}k`} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="buyNetWorth"   name={t('chartBuyNet')}         stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="rentNetWorth"  name={t('chartRentPortfolio')}  stroke="#f97316" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="propertyValue" name={t('chartPropertyValue')}  stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              {breakEvenYear && (
                <ReferenceLine x={breakEvenYear} stroke="#6b7280" strokeDasharray="3 3"
                  label={{ value: t('breakEvenLabel', { n: breakEvenYear }), fontSize: 10, fill: '#6b7280' }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Graf výhody + tabulka */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold text-base mb-1">{t('advantageTitle')}</h2>
            <p className="text-xs text-muted-foreground mb-3">{t('advantageSubtitle')}</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : v >= 1_000 ? `${Math.round(v/1_000)}k` : String(v)} width={65} />
                <Tooltip formatter={(v: unknown) => [fmtKcFull(Number(v)), t('chartAdvantage')]} contentStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                <Line type="monotone" dataKey="advantage" name={t('chartAdvantage')} stroke="#6b7280" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">{t('tableTitle')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 pr-2 font-medium">{t('colYear')}</th>
                    <th className="text-right py-1.5 pr-2 font-medium text-blue-500">{t('colBuyNet')}</th>
                    <th className="text-right py-1.5 pr-2 font-medium text-orange-400">{t('colRentPortfolio')}</th>
                    <th className="text-right py-1.5 font-medium">{t('colAdvantage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data
                    .filter((_, i) => {
                      if (years <= 10) return i > 0
                      if (years <= 20) return i > 0 && i % 2 === 0
                      return i > 0 && i % 5 === 0
                    })
                    .map((row) => (
                      <tr key={row.year} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-1.5 pr-2 text-muted-foreground">{row.year}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-blue-500">{fmtKcFull(row.buyNetWorth)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-orange-400">{fmtKcFull(row.rentNetWorth)}</td>
                        <td className={`py-1.5 text-right tabular-nums font-bold ${row.advantage > 0 ? 'text-blue-500' : 'text-orange-400'}`}>
                          {row.advantage > 0 ? '+' : ''}{fmtKcFull(row.advantage)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
