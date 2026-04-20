'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// ── Konstanty 2026 ────────────────────────────────────────────────────────────

const DVZ_T1 = 1_466
const DVZ_T2 = 2_199
const DVZ_T3 = 4_397
const RP_POOL        = 350_000
const RP_MIN_MONTHLY = 7_600
const SOCIAL_RATE    = 0.065
const HEALTH_RATE    = 0.045
const SLEVA          = 2_570
const TAX_LIMIT      = 188_800

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKc(n: number) {
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}
function fmtPct(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'
}

function reduceDVZ(dvz: number): number {
  let r = Math.min(dvz, DVZ_T1)
  if (dvz > DVZ_T1) r += Math.min(dvz - DVZ_T1, DVZ_T2 - DVZ_T1) * 0.60
  if (dvz > DVZ_T2) r += Math.min(dvz - DVZ_T2, DVZ_T3 - DVZ_T2) * 0.30
  return r
}

function calcNet(gross: number): number {
  const social = gross * SOCIAL_RATE
  const health = gross * HEALTH_RATE
  const taxRaw = gross <= TAX_LIMIT
    ? gross * 0.15
    : TAX_LIMIT * 0.15 + (gross - TAX_LIMIT) * 0.23
  return Math.round(gross - social - health - Math.max(0, taxRaw - SLEVA))
}

// Spořák: RP vkládáme měsíčně po dobu fastMonths, balance se průběžně úročí
function calcSavingsBalance(monthlyDeposit: number, fastMonths: number, monthlyRate: number): number {
  let balance = 0
  for (let i = 0; i < fastMonths; i++) {
    balance = balance * (1 + monthlyRate) + monthlyDeposit
  }
  return balance
}

// Anuita: kolik lze vybírat měsíčně ze spořáku po dobu withdrawalMonths
// tak aby balance přesně vyšla na 0 (zůstatek stále úročí)
function calcAnnuityPmt(pv: number, monthlyRate: number, n: number): number {
  if (n <= 0) return 0
  if (monthlyRate === 0) return pv / n
  return pv * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n))
}

// ── SliderInput ───────────────────────────────────────────────────────────────

function SliderInput({ label, value, min, max, step, suffix, sliderMax, note, disabled, onChange, formatDisplay }: {
  label: string; value: number; min: number; max: number; step: number
  suffix: string; sliderMax?: number; note?: string; disabled?: boolean
  onChange: (v: number) => void
  formatDisplay?: (v: number) => string
}) {
  const [text, setText]   = useState(String(value))
  const [focused, setFoc] = useState(false)
  const sMax = sliderMax ?? max

  function commit(raw: string) {
    const p = parseFloat(raw.replace(',', '.').replace(/\s/g, ''))
    if (!isNaN(p)) { const c = Math.min(Math.max(p, min), max); onChange(c); setText(String(c)) }
    else setText(String(value))
  }

  const display = focused ? text : (formatDisplay ? formatDisplay(value) : Math.round(value).toLocaleString('cs-CZ'))

  return (
    <div className={disabled ? 'opacity-40 pointer-events-none select-none' : ''}>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {note && <span className="text-[10px] text-muted-foreground italic">{note}</span>}
      </div>
      <div className="relative">
        <input
          type="text" inputMode="decimal"
          value={display}
          onFocus={() => { setFoc(true); setText(String(value)) }}
          onBlur={() => { setFoc(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-16 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={sMax} step={step}
        value={Math.min(Math.max(value, min), sMax)}
        onChange={(e) => {
          const v = step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value)
          onChange(v); if (!focused) setText(String(v))
        }}
        className="w-full mt-1.5 accent-primary"
      />
    </div>
  )
}

// ── InfoCard ──────────────────────────────────────────────────────────────────

function InfoCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string
  color?: 'emerald' | 'blue' | 'default'
}) {
  const cls = color === 'emerald'
    ? 'bg-emerald-500/10 border border-emerald-500/20'
    : color === 'blue'
    ? 'bg-blue-500/10 border border-blue-500/20'
    : 'bg-muted/50'
  const valCls = color === 'emerald'
    ? 'text-2xl text-emerald-500'
    : color === 'blue'
    ? 'text-2xl text-blue-500'
    : 'text-base'
  return (
    <div className={`rounded-md p-3 ${cls}`}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-bold ${valCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function ParentalCalculator() {
  const t = useTranslations('calculators.parental')

  const [gross,    setGross]    = useState(45_000)
  const [months,   setMonths]   = useState(36)
  const [fastMode, setFastMode] = useState(false)
  const [savRate,  setSavRate]  = useState(4.0)
  const [wdMonths, setWdMonths] = useState(36)

  // DVZ a maximální měsíční výše dle příjmu
  const dvz           = gross * 12 / 365
  const dvzRed        = reduceDVZ(dvz)
  const dvzMonthlyMax = Math.max(Math.round(dvzRed * 0.70 * 30), RP_MIN_MONTHLY)

  // Minimální délka při max. čerpání
  const stateMinMonths = Math.ceil(RP_POOL / dvzMonthlyMax)
  const sliderMin      = Math.min(stateMinMonths, 48)

  // Aktivní délka RP
  const activeDuration  = fastMode ? stateMinMonths : Math.max(months, sliderMin)
  const monthly         = Math.min(Math.round(RP_POOL / activeDuration), dvzMonthlyMax)
  const effectiveMonths = Math.ceil(RP_POOL / monthly)
  const net             = calcNet(gross)
  const pctNet          = (monthly / net) * 100

  // ── Spořák výpočet ────────────────────────────────────────────────────────
  const monthlyRate  = savRate / 100 / 12
  const savBalance   = calcSavingsBalance(monthly, effectiveMonths, monthlyRate)
  const pmt          = calcAnnuityPmt(savBalance, monthlyRate, wdMonths)
  const totalFromSav = Math.round(pmt * wdMonths)
  const extra        = totalFromSav - RP_POOL   // čistý zisk z úroků

  function handleMonthsChange(v: number) {
    setMonths(Math.max(v, sliderMin))
  }

  return (
    <div className="space-y-4 max-w-2xl">

      {/* ── Vstup ── */}
      <div className="rounded-lg border bg-card p-5 space-y-5">
        <SliderInput
          label={t('labelGross')}
          value={gross} min={15_000} max={200_000} step={500} sliderMax={120_000}
          suffix="Kč" onChange={setGross}
        />

        <SliderInput
          label={t('labelDuration')}
          value={activeDuration}
          min={sliderMin} max={48} step={1}
          suffix={t('months')}
          note={fastMode ? t('fastModeActive') : t('defaultNote')}
          disabled={fastMode}
          onChange={handleMonthsChange}
          formatDisplay={(v) => `${v}`}
        />

        {/* Checkbox: co nejrychleji */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox" checked={fastMode}
            onChange={(e) => setFastMode(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm">{t('fastModeLabel')}</span>
        </label>

        <p className="text-[10px] text-muted-foreground">{t('employeeNote')}</p>
      </div>

      {/* ── Výsledky RP ── */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold mb-4">{t('resultsTitle')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('rpMonthly')}</p>
            <p className="text-3xl font-bold text-emerald-500">{fmtKc(monthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmtPct(pctNet)} {t('ofNet')}</p>
          </div>
          <InfoCard label={t('poolTotal')}   value={fmtKc(RP_POOL)}                    sub={t('poolNote')} />
          <InfoCard label={t('duration')}    value={`${effectiveMonths} ${t('months')}`} sub={`≈ ${(effectiveMonths / 12).toFixed(1)} ${t('years')}`} />
          <InfoCard label={t('dvzMax')}      value={fmtKc(dvzMonthlyMax)}              sub={t('dvzMaxNote')} />
          <InfoCard label={t('minDuration')} value={`${stateMinMonths} ${t('months')}`} sub={t('minDurationNote')} />
        </div>
      </div>

      {/* ── Spořicí účet (jen při fastMode) ── */}
      {fastMode && (
        <div className="rounded-lg border border-blue-500/30 bg-card p-5 space-y-5">
          <div>
            <h2 className="font-semibold">{t('savingsTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('savingsDesc', { months: effectiveMonths })}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SliderInput
              label={t('labelRate')}
              value={savRate} min={0} max={10} step={0.1} suffix="% p.a."
              onChange={setSavRate}
              formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            />
            <SliderInput
              label={t('labelWdMonths')}
              value={wdMonths} min={6} max={120} step={1} suffix={t('months')}
              onChange={setWdMonths}
              formatDisplay={(v) => `${v}`}
            />
          </div>

          {/* Výsledky spořáku */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard
              label={t('savBalance')}
              value={fmtKc(Math.round(savBalance))}
              sub={t('savBalanceNote', { months: effectiveMonths })}
            />
            <InfoCard
              label={t('savPmt')}
              value={fmtKc(Math.round(pmt))}
              sub={t('savPmtNote', { months: wdMonths })}
              color="blue"
            />
            <InfoCard
              label={t('savTotal')}
              value={fmtKc(totalFromSav)}
              sub={t('savTotalNote', { months: wdMonths })}
            />
            {/* Navíc díky úrokům — klíčové číslo */}
            <div className={`rounded-md p-3 ${extra >= 0
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'}`}>
              <p className="text-xs text-muted-foreground mb-0.5">{t('savExtra')}</p>
              <p className={`font-bold text-xl ${extra >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {extra >= 0 ? '+' : ''}{fmtKc(extra)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('savExtraNote')}</p>
            </div>
          </div>

          {/* Srovnání scénářů */}
          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-2">
            <p className="font-semibold text-sm">{t('comparisonTitle')}</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('compSlow', { months: wdMonths })}</span>
              <span className="font-semibold">{fmtKc(RP_POOL)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('compFast', { rpMonths: effectiveMonths, wdMonths })}</span>
              <span className="font-semibold text-blue-500">{fmtKc(totalFromSav)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>{t('compDiff')}</span>
              <span className={extra >= 0 ? 'text-green-500' : 'text-red-500'}>
                {extra >= 0 ? '+' : ''}{fmtKc(extra)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Poznámky ── */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">{t('notesTitle')}</p>
        <p>• {t('note1')}</p>
        <p>• {t('note2')}</p>
        <p>• {t('note3')}</p>
      </div>
    </div>
  )
}
