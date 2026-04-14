'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtKc(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M Kč'
  if (abs >= 1_000)     return sign + Math.round(abs / 1_000).toLocaleString('cs-CZ') + ' tis. Kč'
  return sign + Math.round(abs).toLocaleString('cs-CZ') + ' Kč'
}
function fmtKcFull(n: number) { return Math.round(n).toLocaleString('cs-CZ') + ' Kč' }
function fmtPct(n: number, dec = 2) { return n.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %' }

// ── typy ─────────────────────────────────────────────────────────────────────

type TaxMethod = 'pausal' | 'skutecne' | 'odpisy'

// ── hypotéka ──────────────────────────────────────────────────────────────────

function calcMonthlyPayment(principal: number, annualRate: number, years: number) {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ── simulace ─────────────────────────────────────────────────────────────────

interface YearData {
  year:                number
  effectiveRent:       number   // příjem po obsazenosti
  totalOpex:           number   // správa + údržba + pojištění + daň z nem.
  interest:            number   // úroky hypotéky (tento rok)
  cumulativeInterest:  number   // kumulativně zaplacené úroky
  principalPaid:       number   // splátka jistiny (tento rok)
  cumulativePrincipal: number   // kumulativně splacená jistina
  depreciation:        number   // odpisy (roční)
  tax:                 number   // daň z příjmu
  cashflow:            number   // čistý cashflow po dani a hypotéce
  cumulativeCashflow:  number
  propertyValue:       number
  loanBalance:         number
  netWorth:            number   // hodnota − dluh
  totalReturn:         number   // netWorth − počáteční investice + kumulativní CF
}

function simulate(
  propertyPrice:       number,
  downPaymentPct:      number,
  mortgageRate:        number,
  mortgageYears:       number,
  rentMonthly:         number,
  occupancy:           number,
  managementPct:       number,
  maintenancePct:      number,
  insuranceAnnual:     number,
  propertyTaxAnnual:   number,
  propertyAppreciation:number,
  rentGrowth:          number,
  taxMethod:           TaxMethod,
  buildingRatio:       number,
  years:               number,
): YearData[] {
  const downPayment          = propertyPrice * downPaymentPct / 100
  const principal            = propertyPrice - downPayment
  const M                    = calcMonthlyPayment(principal, mortgageRate, mortgageYears)
  const rAppreciation        = propertyAppreciation / 100 / 12
  const buildingValue        = propertyPrice * buildingRatio / 100
  const annualDepreciation   = buildingValue / 30
  const monthlyDepreciation  = annualDepreciation / 12
  const initialInvestment    = downPayment

  let propertyVal          = propertyPrice
  let loanBal              = principal
  let currentRent          = rentMonthly
  let cumulativeCashflow   = 0
  let cumulativePrincipal  = 0
  let cumulativeInterest   = 0

  const points: YearData[] = []

  for (let y = 1; y <= years; y++) {
    let yearEffectiveRent = 0
    let yearOpex          = 0
    let yearInterest      = 0
    let yearPrincipal     = 0
    let yearTax           = 0

    for (let m = 0; m < 12; m++) {
      propertyVal *= (1 + rAppreciation)

      const effectiveRentM   = currentRent * occupancy / 100
      const managementFee    = effectiveRentM * managementPct / 100
      const maintenanceM     = propertyPrice * maintenancePct / 100 / 12
      const insuranceM       = insuranceAnnual / 12
      const propTaxM         = propertyTaxAnnual / 12
      const opexM            = managementFee + maintenanceM + insuranceM + propTaxM

      // Úroky a jistina
      const r                = mortgageRate / 100 / 12
      const interestM        = loanBal * r
      const principalM       = Math.min(M - interestM, loanBal)
      loanBal                = Math.max(0, loanBal - principalM)

      // Daň
      let tax = 0
      if (taxMethod === 'pausal') {
        tax = effectiveRentM * 0.70 * 0.15
      } else if (taxMethod === 'skutecne') {
        const taxable = Math.max(0, effectiveRentM - opexM - interestM)
        tax = taxable * 0.15
      } else { // odpisy
        const taxable = Math.max(0, effectiveRentM - opexM - interestM - monthlyDepreciation)
        tax = taxable * 0.15
      }

      yearEffectiveRent += effectiveRentM
      yearOpex          += opexM
      yearInterest      += interestM
      yearPrincipal     += principalM
      yearTax           += tax

      if (m === 11) currentRent *= (1 + rentGrowth / 100)
    }

    const yearMortgageTotal = M * 12
    const cashflow          = yearEffectiveRent - yearOpex - yearMortgageTotal - yearTax
    cumulativeCashflow     += cashflow
    cumulativePrincipal    += yearPrincipal
    cumulativeInterest     += yearInterest
    const netWorth          = propertyVal - loanBal
    const totalReturn       = netWorth - initialInvestment + cumulativeCashflow

    points.push({
      year:                y,
      effectiveRent:       Math.round(yearEffectiveRent),
      totalOpex:           Math.round(yearOpex),
      interest:            Math.round(yearInterest),
      cumulativeInterest:  Math.round(cumulativeInterest),
      principalPaid:       Math.round(yearPrincipal),
      cumulativePrincipal: Math.round(cumulativePrincipal),
      depreciation:        Math.round(annualDepreciation),
      tax:                 Math.round(yearTax),
      cashflow:            Math.round(cashflow),
      cumulativeCashflow:  Math.round(cumulativeCashflow),
      propertyValue:       Math.round(propertyVal),
      loanBalance:         Math.round(loanBal),
      netWorth:            Math.round(netWorth),
      totalReturn:         Math.round(totalReturn),
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

// ── Metrická karta ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, positive }: {
  label: string; value: string; sub?: string; color?: string; positive?: boolean
}) {
  const textColor = positive === undefined ? (color ?? '') : positive ? 'text-green-500' : 'text-red-400'
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${textColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: number
}) {
  const t = useTranslations('calculators.investmentProperty')
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

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function InvestmentPropertyCalculator() {
  const t = useTranslations('calculators.investmentProperty')

  const TAX_METHODS: { key: TaxMethod; label: string; desc: string }[] = [
    { key: 'pausal',   label: t('taxMethodPausalLabel'),   desc: t('taxMethodPausalDesc') },
    { key: 'skutecne', label: t('taxMethodSkutecneLabel'),  desc: t('taxMethodSkutecneDesc') },
    { key: 'odpisy',   label: t('taxMethodOdpisyLabel'),   desc: t('taxMethodOdpisyDesc') },
  ]
  // Nemovitost + hypotéka
  const [propertyPrice,         setPropertyPrice]         = useState(7_000_000)
  const [downPaymentPct,        setDownPaymentPct]         = useState(20)
  const [mortgageRate,          setMortgageRate]           = useState(4.0)
  const [mortgageYears,         setMortgageYears]          = useState(30)
  const [propertyAppreciation,  setPropertyAppreciation]   = useState(5.0)
  // Příjmy + náklady
  const [rentMonthly,           setRentMonthly]            = useState(24_500)
  const [occupancy,             setOccupancy]              = useState(95)
  const [managementPct,         setManagementPct]          = useState(0)
  const [maintenancePct,        setMaintenancePct]         = useState(0.5)
  const [insuranceAnnual,       setInsuranceAnnual]        = useState(8_000)
  const [propertyTaxAnnual,     setPropertyTaxAnnual]      = useState(2_000)
  const [rentGrowth,            setRentGrowth]             = useState(4.0)
  // Daň
  const [taxMethod,             setTaxMethod]              = useState<TaxMethod>('odpisy')
  const [buildingRatio,         setBuildingRatio]          = useState(70)
  // Horizont
  const [years,                 setYears]                  = useState(30)

  // ── Odvozené základní hodnoty ─────────────────────────────────────────────

  const downPayment       = propertyPrice * downPaymentPct / 100
  const principal         = propertyPrice - downPayment
  const M                 = calcMonthlyPayment(principal, mortgageRate, mortgageYears)
  const effectiveRentM    = rentMonthly * occupancy / 100
  const managementM       = effectiveRentM * managementPct / 100
  const maintenanceM      = propertyPrice * maintenancePct / 100 / 12
  const insuranceM        = insuranceAnnual / 12
  const propTaxM          = propertyTaxAnnual / 12
  const opexM             = managementM + maintenanceM + insuranceM + propTaxM
  const NOI_monthly       = effectiveRentM - opexM
  const interestM1        = principal * mortgageRate / 100 / 12  // první měsíc (aproximace)
  const monthlyDep        = propertyPrice * buildingRatio / 100 / 30 / 12

  let taxM = 0
  if (taxMethod === 'pausal') {
    taxM = effectiveRentM * 0.70 * 0.15
  } else if (taxMethod === 'skutecne') {
    taxM = Math.max(0, effectiveRentM - opexM - interestM1) * 0.15
  } else {
    taxM = Math.max(0, effectiveRentM - opexM - interestM1 - monthlyDep) * 0.15
  }

  const cashflowM          = effectiveRentM - opexM - M - taxM
  const grossYield         = (rentMonthly * 12) / propertyPrice * 100
  const capRate            = (NOI_monthly * 12) / propertyPrice * 100

  const data = useMemo(() => simulate(
    propertyPrice, downPaymentPct, mortgageRate, mortgageYears,
    rentMonthly, occupancy, managementPct, maintenancePct,
    insuranceAnnual, propertyTaxAnnual, propertyAppreciation,
    rentGrowth, taxMethod, buildingRatio, years,
  ), [propertyPrice, downPaymentPct, mortgageRate, mortgageYears,
      rentMonthly, occupancy, managementPct, maintenancePct,
      insuranceAnnual, propertyTaxAnnual, propertyAppreciation,
      rentGrowth, taxMethod, buildingRatio, years])

  const last          = data[data.length - 1]
  const breakEvenYear = data.find((d) => d.cumulativeCashflow >= 0)?.year
  const tickInterval  = years <= 10 ? 0 : years <= 20 ? 4 : 9

  return (
    <div className="space-y-4 max-w-6xl">

      {/* ═══ Vstupy ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Nemovitost + Hypotéka */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {t('sectionMortgage')}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <SliderField label={t('labelPropertyPrice')} suffix="Kč"
                value={propertyPrice} min={500_000} max={50_000_000} step={50_000} sliderMax={15_000_000}
                onChange={setPropertyPrice} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            </div>
            <SliderField label={t('labelDownPayment')} suffix="%"
              value={downPaymentPct} min={0} max={100} step={1}
              onChange={setDownPaymentPct} formatDisplay={(v) => String(Math.round(v))}
              note={`= ${fmtKc(downPayment)}`} />
            <SliderField label={t('labelMortgageRate')} suffix="% p.a."
              value={mortgageRate} min={0.5} max={15} step={0.1}
              onChange={setMortgageRate}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} />
            <SliderField label={t('labelMortgageYears')} suffix="let"
              value={mortgageYears} min={5} max={40} step={1}
              onChange={setMortgageYears} formatDisplay={(v) => String(Math.round(v))} />
            <SliderField label={t('labelAppreciation')} suffix="% p.a."
              value={propertyAppreciation} min={0} max={15} step={0.5}
              onChange={setPropertyAppreciation}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="CZ ~3–5 %" />
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">{t('mortgagePayment')}</span>
              <span className="font-bold text-blue-500">{fmtKcFull(M)} / měs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('principal')}</span>
              <span className="font-medium">{fmtKc(principal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('firstMonthInterest')}</span>
              <span className="font-medium">{fmtKcFull(interestM1)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border bg-background p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('monthlyCashflow')}</p>
              <p className={`text-base font-bold tabular-nums ${cashflowM >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmtKc(cashflowM)}</p>
              <p className="text-[10px] text-muted-foreground">{t('cashflowSub')}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('grossYield')}</p>
              <p className="text-base font-bold tabular-nums text-blue-500">{fmtPct(grossYield)}</p>
              <p className="text-[10px] text-muted-foreground">{t('grossYieldSub')}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('capRate')}</p>
              <p className="text-base font-bold tabular-nums text-indigo-500">{fmtPct(capRate)}</p>
              <p className="text-[10px] text-muted-foreground">{t('noiLabel')}</p>
            </div>
          </div>
        </div>

        {/* Příjmy + Náklady + Daň */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> {t('sectionIncome')}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <SliderField label={t('labelRent')} suffix="Kč"
                value={rentMonthly} min={1_000} max={100_000} step={500} sliderMax={50_000}
                onChange={setRentMonthly} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            </div>
            <SliderField label={t('labelOccupancy')} suffix="%"
              value={occupancy} min={50} max={100} step={1}
              onChange={setOccupancy} formatDisplay={(v) => String(Math.round(v))}
              note="typicky 90–95 %" />
            <SliderField label={t('labelManagement')} suffix="% nájmu"
              value={managementPct} min={0} max={20} step={0.5}
              onChange={setManagementPct}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="8–12 % správa" />
            <SliderField label={t('labelMaintenance')} suffix="% ceny/rok"
              value={maintenancePct} min={0} max={5} step={0.1}
              onChange={setMaintenancePct}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="0,5–1 %" />
            <SliderField label={t('labelInsurance')} suffix="Kč/rok"
              value={insuranceAnnual} min={0} max={50_000} step={500} sliderMax={30_000}
              onChange={setInsuranceAnnual} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            <SliderField label={t('labelPropertyTax')} suffix="Kč/rok"
              value={propertyTaxAnnual} min={0} max={50_000} step={100} sliderMax={20_000}
              onChange={setPropertyTaxAnnual} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
            <SliderField label={t('labelRentGrowth')} suffix="% p.a."
              value={rentGrowth} min={0} max={15} step={0.5}
              onChange={setRentGrowth}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              note="CZ ~3–5 %" />
          </div>

          {/* Daňová metoda */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{t('incomeTaxTitle')}</p>
            <div className="flex rounded-md overflow-hidden border divide-x text-xs">
              {TAX_METHODS.map((tm) => (
                <button key={tm.key}
                  onClick={() => setTaxMethod(tm.key)}
                  className={`flex-1 py-1.5 px-2 text-center font-medium transition-colors ${
                    taxMethod === tm.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {tm.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 italic">
              {TAX_METHODS.find(t => t.key === taxMethod)?.desc}
            </p>
            {taxMethod === 'odpisy' && (
              <div className="mt-2">
                <SliderField label={t('labelBuildingRatio')} suffix="%"
                  value={buildingRatio} min={40} max={95} step={5}
                  onChange={setBuildingRatio} formatDisplay={(v) => String(Math.round(v))}
                  note={t('depreciationNote', { amount: fmtKcFull(monthlyDep * 12) })} />
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ═══ Horizont ═══ */}
      <div className="rounded-lg border bg-card px-5 py-4">
        <SliderField label={t('labelHorizon')} suffix="let"
          value={years} min={1} max={40} step={1}
          onChange={setYears} formatDisplay={(v) => String(Math.round(v))} />
      </div>

      {/* ═══ Grafy ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Kumulativní cashflow */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-0.5">{t('cumulativeCashflowTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-3">
            {t('cumulativeCashflowSubtitle', { amount: fmtKc(downPayment) })}
            {breakEvenYear ? t('breakEvenInfix', { n: breakEvenYear }) : ''}
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : v >= 1_000 ? `${Math.round(v/1_000)}k` : String(v)} width={65} />
              <Tooltip formatter={(v: unknown) => [fmtKcFull(Number(v)), '']} contentStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
              {breakEvenYear && (
                <ReferenceLine x={breakEvenYear} stroke="#22c55e" strokeDasharray="3 3"
                  label={{ value: `r. ${breakEvenYear}`, fontSize: 10, fill: '#22c55e' }} />
              )}
              <Bar dataKey="cashflow" name={t('barAnnualCashflow')} radius={[2, 2, 0, 0]}
                fill="#22c55e"
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t('cumulativeCfYears', { n: years })}</p>
              <p className={`font-bold text-base mt-0.5 ${last.cumulativeCashflow >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {fmtKc(last.cumulativeCashflow)}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t('effectiveTax')}</p>
              <p className="font-bold text-base mt-0.5">{fmtKcFull(taxM)}</p>
            </div>
          </div>
        </div>

        {/* Čistá hodnota majetku */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-0.5">{t('netWorthTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-3">{t('netWorthSubtitle')}</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : `${Math.round(v/1_000)}k`} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="propertyValue"  name={t('chartPropertyValue')} stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="netWorth"       name={t('chartNetWorth')}       stroke="#6366f1" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="totalReturn"    name={t('chartTotalReturn')}    stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t('labelPropertyValue')}</p>
              <p className="font-bold text-base mt-0.5 text-blue-500">{fmtKc(last.propertyValue)}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t('labelNetWorth')}</p>
              <p className="font-bold text-base mt-0.5 text-indigo-500">{fmtKc(last.netWorth)}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t('labelTotalReturn')}</p>
              <p className={`font-bold text-base mt-0.5 ${last.totalReturn >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {fmtKc(last.totalReturn)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Tabulka ═══ */}
      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">{t('tableTitle')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-1.5 pr-3 font-medium">{t('colYear')}</th>
                <th className="text-right py-1.5 pr-3 font-medium text-green-500">{t('colRentYear')}</th>
                <th className="text-right py-1.5 pr-3 font-medium">{t('colInterestCum')}</th>
                <th className="text-right py-1.5 pr-3 font-medium">{t('colPrincipalCum')}</th>
                <th className="text-right py-1.5 pr-3 font-medium">{t('colCfYear')}</th>
                <th className="text-right py-1.5 pr-3 font-medium">{t('colCfCum')}</th>
                <th className="text-right py-1.5 pr-3 font-medium text-indigo-500">{t('colNetWorth')}</th>
                <th className="text-right py-1.5 font-medium text-green-500">{t('colProfit')}</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((_, i) => {
                  if (i < 3) return true
                  if (years <= 10) return true
                  if (years <= 20) return i % 2 === 0
                  return i % 5 === 4
                })
                .map((row) => (
                  <tr key={row.year} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.year}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-green-500 font-medium">{fmtKcFull(row.effectiveRent)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtKcFull(row.cumulativeInterest)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtKcFull(row.cumulativePrincipal)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${row.cashflow >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                      {row.cashflow >= 0 ? '+' : ''}{fmtKcFull(row.cashflow)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${row.cumulativeCashflow >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                      {row.cumulativeCashflow >= 0 ? '+' : ''}{fmtKcFull(row.cumulativeCashflow)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-bold text-indigo-500">{fmtKcFull(row.netWorth)}</td>
                    <td className={`py-1.5 text-right tabular-nums font-bold ${row.totalReturn >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                      {row.totalReturn >= 0 ? '+' : ''}{fmtKcFull(row.totalReturn)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
