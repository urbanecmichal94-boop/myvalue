'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Konstanty CZ 2026 ─────────────────────────────────────────────────────────
const STATE_CONTRIB_RATE = 0.20        // 20 % ze svého příspěvku
const STATE_CONTRIB_MAX  = 340         // max 340 Kč/měsíc
const STATE_CONTRIB_MIN_FOR_MAX = 1_700 // příspěvek pro max státní příspěvek
const TAX_DEDUCT_THRESHOLD_MONTHLY = 1_700  // příspěvky nad tuto hranici jdou do daňového odpočtu
const TAX_DEDUCT_MAX_YEARLY = 48_000   // max odpočet ze základu daně ročně
const TAX_RATE = 0.15                  // sazba daně (pro výpočet daňové úspory)
const EMPLOYER_TAX_FREE_LIMIT = 50_000 // příspěvek zaměstnavatele daňově volný do 50k/rok

// ── Presety ───────────────────────────────────────────────────────────────────
interface Preset {
  label:       string
  grossReturn: number   // hrubý výnos % p.a.
  ter:         number   // správcovský poplatek % p.a.
  perfFee:     number   // výkonnostní poplatek % ze zisku
}

const PRESETS: Preset[] = [
  { label: 'Konzervativní', grossReturn: 2.5, ter: 0.6,  perfFee: 0   },
  { label: 'Vyvážený',      grossReturn: 5.0, ter: 1.0,  perfFee: 10  },
  { label: 'Dynamický',     grossReturn: 8.0, ter: 1.0,  perfFee: 15  },
  { label: 'Vlastní',       grossReturn: 7.0, ter: 0.5,  perfFee: 0   },
]

const ETF_TER   = 0.2    // ETF kopíruje hrubý výnos DPS, liší se jen poplatky
const SP500_GROSS = 10.26  // průměrný roční výnos S&P 500 za posledních ~100 let
const SP500_TER   = 0.07   // typický TER S&P 500 ETF (Vanguard VOO apod.)

// ── Výpočet čistého měsíčního výnosu po poplatcích ──────────────────────────
// Výkonnostní poplatek: odečteme každý rok ze zisku daného roku
function netAnnualRate(grossReturn: number, ter: number, perfFee: number): number {
  const gross = grossReturn / 100
  const terR  = ter / 100
  const netBeforePerf = gross - terR
  const perfDeduct = (perfFee / 100) * Math.max(0, netBeforePerf)
  return Math.max(0, netBeforePerf - perfDeduct)
}

// ── Výpočet po letech ─────────────────────────────────────────────────────────
interface DataPoint {
  year:          number
  // DPS
  dpsValue:      number
  dpsInvested:   number   // vlastní příspěvky
  dpsStateTotal: number   // kumulativní státní příspěvky
  dpsEmployer:   number   // kumulativní zaměstnavatel
  dpsTaxSaving:  number   // kumulativní daňová úspora
  dpsInterest:   number   // výnosy
  // ETF (alternativa — stejný celkový vklad bez státní podpory)
  etfValue:      number
  etfInvested:   number
  etfInterest:   number
  // S&P 500 alternativa
  sp500Value:    number
}

function calcPension(
  ownMonthly: number,
  employerMonthly: number,
  grossReturn: number,
  ter: number,
  perfFee: number,
  years: number,
  showEtf: boolean,
): DataPoint[] {
  const stateMonthly = Math.min(ownMonthly * STATE_CONTRIB_RATE, STATE_CONTRIB_MAX)
  const totalMonthlyDps = ownMonthly + employerMonthly + stateMonthly

  // Daňová úspora ročně
  const ownYearly = ownMonthly * 12
  const deductible = Math.min(
    Math.max(0, ownYearly - TAX_DEDUCT_THRESHOLD_MONTHLY * 12),
    TAX_DEDUCT_MAX_YEARLY
  )
  const taxSavingYearly = deductible * TAX_RATE

  const rDps = netAnnualRate(grossReturn, ter, perfFee) / 12
  const rEtf   = netAnnualRate(grossReturn, ETF_TER, 0) / 12
  const rSp500 = netAnnualRate(SP500_GROSS, SP500_TER, 0) / 12

  // ETF/S&P: vlastní + zaměstnavatel + daňová úspora, bez státního příspěvku
  const etfMonthly = ownMonthly + employerMonthly + taxSavingYearly / 12

  const points: DataPoint[] = []
  let dpsVal = 0, etfVal = 0, sp500Val = 0

  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      for (let m = 0; m < 12; m++) {
        dpsVal   = dpsVal   * (1 + rDps)   + totalMonthlyDps
        if (showEtf) etfVal = etfVal * (1 + rEtf) + etfMonthly
        sp500Val = sp500Val * (1 + rSp500) + etfMonthly
      }
    }

    const months = y * 12
    const dpsInvested   = ownMonthly * months
    const dpsStateTotal = stateMonthly * months
    const dpsEmpTotal   = employerMonthly * months
    const dpsTaxTotal   = taxSavingYearly * y
    const dpsInterest   = Math.max(0, dpsVal - dpsInvested - dpsStateTotal - dpsEmpTotal)

    const etfInvested  = etfMonthly * months
    const etfInterest  = Math.max(0, etfVal - etfInvested)

    points.push({
      year:          y,
      dpsValue:      Math.round(dpsVal),
      dpsInvested:   Math.round(dpsInvested),
      dpsStateTotal: Math.round(dpsStateTotal),
      dpsEmployer:   Math.round(dpsEmpTotal),
      dpsTaxSaving:  Math.round(dpsTaxTotal),
      dpsInterest:   Math.round(dpsInterest),
      etfValue:      Math.round(etfVal),
      etfInvested:   Math.round(etfInvested),
      etfInterest:   Math.round(etfInterest),
      sp500Value:    Math.round(sp500Val),
    })
  }
  return points
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtKc(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M Kč'
  if (Math.abs(n) >= 1_000)     return Math.round(n / 1_000).toLocaleString('cs-CZ') + ' tis. Kč'
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}
function fmtKcFull(n: number) { return Math.round(n).toLocaleString('cs-CZ') + ' Kč' }
function fmtPct(n: number) { return n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' }

// ── SliderField ───────────────────────────────────────────────────────────────
function SliderField({ label, value, min, max, step, suffix, sliderMax, onChange, formatDisplay, note }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string
  sliderMax?: number; onChange: (v: number) => void; formatDisplay?: (v: number) => string; note?: string
}) {
  const [text, setText]       = useState(String(value))
  const [focused, setFocused] = useState(false)
  const sMax = sliderMax ?? max

  function commit(raw: string) {
    const parsed = parseFloat(raw.replace(',', '.').replace(/\s/g, ''))
    if (!isNaN(parsed)) { const c = Math.min(Math.max(parsed, min), max); onChange(c); setText(String(c)) }
    else setText(String(value))
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
      </div>
      <div className="relative">
        <input type="text" inputMode="decimal"
          value={focused ? text : (formatDisplay ? formatDisplay(value) : String(value))}
          onFocus={() => { setFocused(true); setText(String(value)) }}
          onBlur={() => { setFocused(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
      </div>
      <input type="range" min={min} max={sMax} step={step}
        value={Math.min(Math.max(value, min), sMax)}
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
  const t = useTranslations('calculators.pension')
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
export function PensionCalculator() {
  const t = useTranslations('calculators.pension')
  const [presetIdx, setPresetIdx] = useState(2)           // Dynamický
  const [own, setOwn]             = useState(1_700)
  const [employer, setEmployer]   = useState(340)
  const [years, setYears]         = useState(30)
  const [showEtf, setShowEtf]     = useState(true)
  const [showSp500, setShowSp500] = useState(false)

  // Vlastní parametry (aktivní jen pro preset 3)
  const [customGross,   setCustomGross]   = useState(7.0)
  const [customTer,     setCustomTer]     = useState(0.5)
  const [customPerfFee, setCustomPerfFee] = useState(0)

  const preset = PRESETS[presetIdx]
  const grossReturn = presetIdx === 3 ? customGross   : preset.grossReturn
  const ter         = presetIdx === 3 ? customTer     : preset.ter
  const perfFee     = presetIdx === 3 ? customPerfFee : preset.perfFee

  const stateMonthly = Math.min(own * STATE_CONTRIB_RATE, STATE_CONTRIB_MAX)
  const totalMonthly = own + employer + stateMonthly

  const ownYearly    = own * 12
  const deductible   = Math.min(Math.max(0, ownYearly - TAX_DEDUCT_THRESHOLD_MONTHLY * 12), TAX_DEDUCT_MAX_YEARLY)
  const taxSavingYearly = deductible * TAX_RATE

  const netRate = netAnnualRate(grossReturn, ter, perfFee) * 100

  const data = useMemo(
    () => calcPension(own, employer, grossReturn, ter, perfFee, years, showEtf),
    [own, employer, grossReturn, ter, perfFee, years, showEtf]
  )

  const last = data[data.length - 1]
  const tickInterval = years <= 10 ? 0 : years <= 20 ? 4 : 9

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-6xl">

      {/* ═══ Levý panel ═══ */}
      <div className="flex-none lg:w-80 space-y-4">

        {/* Preset výběr */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-3">{t('fundTypeTitle')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => setPresetIdx(i)}
                className={`rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${
                  presetIdx === i ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                }`}
              >
                <div>{p.label}</div>
                {i < 3 && <div className="text-[10px] text-muted-foreground mt-0.5">{p.grossReturn} % hrubě</div>}
              </button>
            ))}
          </div>

          {/* Info o vybraném presetu */}
          <div className="mt-3 rounded-md bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('infoGrossReturn')}</span>
              <span className="font-medium">{fmtPct(grossReturn)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('infoManagementFee')}</span>
              <span className="font-medium text-red-400">− {fmtPct(ter)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('infoPerfFeeLabel')}</span>
              <span className="font-medium text-red-400">{perfFee > 0 ? `${perfFee} % ze zisku` : '—'}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 mt-1">
              <span className="text-muted-foreground">{t('infoNetReturn')}</span>
              <span className="font-semibold text-green-500">≈ {fmtPct(netRate)}</span>
            </div>
          </div>

          {/* Vlastní parametry */}
          {presetIdx === 3 && (
            <div className="mt-4 space-y-4">
              <SliderField label={t('labelGrossReturn')} suffix="%" value={customGross}
                min={0} max={20} step={0.5} sliderMax={15} onChange={setCustomGross}
                formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} />
              <SliderField label={t('labelTer')} suffix="%" value={customTer}
                min={0} max={3} step={0.1} onChange={setCustomTer}
                formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} />
              <SliderField label={t('labelPerfFee')} suffix="% ze zisku" value={customPerfFee}
                min={0} max={30} step={1} onChange={setCustomPerfFee}
                formatDisplay={(v) => String(Math.round(v))} />
            </div>
          )}
        </div>

        {/* Příspěvky */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">{t('sectionContribs')}</h2>

          <SliderField label={t('labelOwnContrib')} suffix="Kč"
            value={own} min={100} max={10_000} step={100} sliderMax={5_000}
            onChange={setOwn} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')}
            note={own < STATE_CONTRIB_MIN_FOR_MAX ? `+${Math.round(own * 0.2)} Kč stát` : '+340 Kč stát (max)'} />

          <SliderField label={t('labelEmployerContrib')} suffix="Kč"
            value={employer} min={0} max={5_000} step={100} sliderMax={2_000}
            onChange={setEmployer} formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')}
            note={employer * 12 > EMPLOYER_TAX_FREE_LIMIT ? '⚠ nad 50k/rok' : 'daňově volné'} />

          {/* Souhrn měsíčně */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('yourContrib')}</span>
              <span className="font-medium">{fmtKcFull(own)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('employer')}</span>
<span className="font-medium">{fmtKcFull(employer)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('stateContrib')}</span>
              <span className="font-medium text-green-500">+{fmtKcFull(stateMonthly)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 mt-1">
              <span className="font-medium">{t('totalToFund')}</span>
              <span className="font-bold">{fmtKcFull(totalMonthly)}</span>
            </div>
            {taxSavingYearly > 0 && (
              <div className="flex justify-between text-green-500 pt-1">
                <span>{t('taxSavingYear')}</span>
                <span className="font-medium">+{fmtKcFull(taxSavingYearly)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Doba spoření */}
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <SliderField label={t('labelYears')} suffix="let"
            value={years} min={1} max={50} step={1}
            onChange={setYears} formatDisplay={(v) => String(Math.round(v))} />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={showEtf} onChange={(e) => setShowEtf(e.target.checked)}
              className="rounded accent-primary" />
            <span className="text-sm font-medium">{t('compareEtf')}</span>
          </label>
          {showEtf && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Stejný hrubý výnos ({fmtPct(grossReturn)}), TER {fmtPct(ETF_TER)}, bez výkonnostního poplatku. Bez státního příspěvku.
            </p>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={showSp500} onChange={(e) => setShowSp500(e.target.checked)}
              className="rounded accent-primary" />
            <span className="text-sm font-medium">{t('compareSp500')}</span>
          </label>
          {showSp500 && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              {SP500_GROSS} % p.a. — průměrný roční výnos S&amp;P 500 za posledních ~100 let (nominálně, v USD). TER {fmtPct(SP500_TER)}.
            </p>
          )}
        </div>

        {/* Výsledek */}
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('afterYears', { n: years })}</h3>

          <div>
            <p className="text-[10px] text-muted-foreground">{t('dpsTotalLabel')}</p>
            <p className="text-2xl font-bold text-primary">{fmtKc(last.dpsValue)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">{t('ownDeposits')}</p>
              <p className="font-semibold">{fmtKc(last.dpsInvested)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('stateTotal')}</p>
              <p className="font-semibold text-blue-500">+{fmtKc(last.dpsStateTotal)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('employer')}</p>
              <p className="font-semibold text-blue-500">+{fmtKc(last.dpsEmployer)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('taxSaving')}</p>
              <p className="font-semibold text-green-500">+{fmtKc(last.dpsTaxSaving)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('fundReturns')}</p>
              <p className="font-semibold text-green-500">+{fmtKc(last.dpsInterest)}</p>
            </div>
          </div>

          {showEtf && (
            <>
              <div className="h-px bg-border" />
              <div>
                <p className="text-[10px] text-muted-foreground">{t('etfAltLabel', { pct: fmtPct(grossReturn) })}</p>
                <p className="text-xl font-bold text-orange-400">{fmtKc(last.etfValue)}</p>
              </div>
              <div className={`text-sm font-bold ${last.dpsValue >= last.etfValue ? 'text-green-500' : 'text-orange-400'}`}>
                {last.dpsValue >= last.etfValue ? t('dpsBetter', { amount: fmtKc(Math.abs(last.dpsValue - last.etfValue)) }) : t('dpsWorse', { amount: fmtKc(Math.abs(last.dpsValue - last.etfValue)) })}
              </div>
            </>
          )}
          {showSp500 && (
            <>
              <div className="h-px bg-border" />
              <div>
                <p className="text-[10px] text-muted-foreground">{t('sp500Label', { pct: SP500_GROSS })}</p>
                <p className="text-xl font-bold text-purple-500">{fmtKc(last.sp500Value)}</p>
              </div>
              <div className={`text-sm font-bold ${last.dpsValue >= last.sp500Value ? 'text-green-500' : 'text-purple-500'}`}>
                {last.dpsValue >= last.sp500Value ? t('dpsBetter', { amount: fmtKc(Math.abs(last.dpsValue - last.sp500Value)) }) : t('dpsWorse', { amount: fmtKc(Math.abs(last.dpsValue - last.sp500Value)) })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Pravý panel ═══ */}
      <div className="flex-1 space-y-4">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-4">{t('chartTitle')}</h2>
          <ResponsiveContainer width="100%" height={320}>
            {(showEtf || showSp500) ? (
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : `${Math.round(v/1_000)}k`} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="dpsInvested" name={t('chartOwnDeposits')} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="dpsValue" name={t('chartDps')} stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                {showEtf   && <Line type="monotone" dataKey="etfValue"   name={`ETF (${fmtPct(grossReturn)})`} stroke="#f97316" strokeWidth={2} dot={false} />}
                {showSp500 && <Line type="monotone" dataKey="sp500Value" name={`S&P 500 (${SP500_GROSS} %)`}   stroke="#a855f7" strokeWidth={2} dot={false} />}
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="gOwn"   x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gState" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gEmp"   x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gInt"   x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} r.`} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : `${Math.round(v/1_000)}k`} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="dpsInvested"   name={t('chartOwnDeposits')}    stroke="#60a5fa" strokeWidth={2} fill="url(#gOwn)"   stackId="1" />
                <Area type="monotone" dataKey="dpsEmployer"   name={t('chartEmployer')}        stroke="#a78bfa" strokeWidth={2} fill="url(#gEmp)"   stackId="1" />
                <Area type="monotone" dataKey="dpsStateTotal" name={t('chartStateContribs')}   stroke="#34d399" strokeWidth={2} fill="url(#gState)" stackId="1" />
                <Area type="monotone" dataKey="dpsInterest"   name={t('chartFundReturns')}     stroke="#22c55e" strokeWidth={2} fill="url(#gInt)"   stackId="1" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Tabulka */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">{t('tableTitle')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 pr-3 font-medium">{t('colYear')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium">{t('colInvested')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-green-500">{t('colStateEmployer')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-green-500">{t('colReturns')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium text-blue-500">{t('colDpsTotal')}</th>
                  {showEtf   && <th className="text-right py-1.5 pr-3 font-medium text-orange-400">ETF</th>}
                  {showSp500 && <th className="text-right py-1.5 font-medium text-purple-500">S&amp;P 500</th>}
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
                      <td className="py-1.5 pr-3 text-muted-foreground">{row.year}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtKcFull(row.dpsInvested)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-green-500">{fmtKcFull(row.dpsStateTotal + row.dpsEmployer)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-green-500">{fmtKcFull(row.dpsInterest)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-blue-500">{fmtKcFull(row.dpsValue)}</td>
                      {showEtf   && <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-orange-400">{fmtKcFull(row.etfValue)}</td>}
                      {showSp500 && <td className="py-1.5 text-right tabular-nums font-semibold text-purple-500">{fmtKcFull(row.sp500Value)}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
