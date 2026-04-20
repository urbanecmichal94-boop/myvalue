'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// ── Konstanty 2026 ────────────────────────────────────────────────────────────

const DVZ_T1 = 1_466
const DVZ_T2 = 2_199
const DVZ_T3 = 4_397
const PPM_RATE = 0.70
const PPM_WEEKS_SINGLE = 28
const PPM_WEEKS_TWINS  = 37
const SOCIAL_RATE = 0.065
const HEALTH_RATE = 0.045
const SLEVA       = 2_570
const TAX_LIMIT   = 188_800

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

// ── SliderInput ───────────────────────────────────────────────────────────────

function SliderInput({ label, value, min, max, step, suffix, sliderMax, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  suffix: string; sliderMax?: number; onChange: (v: number) => void
}) {
  const [text, setText]   = useState(String(value))
  const [focused, setFoc] = useState(false)
  const sMax = sliderMax ?? max

  function commit(raw: string) {
    const p = parseFloat(raw.replace(',', '.').replace(/\s/g, ''))
    if (!isNaN(p)) { const c = Math.min(Math.max(p, min), max); onChange(c); setText(String(c)) }
    else setText(String(value))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        <input
          type="text" inputMode="decimal"
          value={focused ? text : Math.round(value).toLocaleString('cs-CZ')}
          onFocus={() => { setFoc(true); setText(String(value)) }}
          onBlur={() => { setFoc(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-14 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={sMax} step={step}
        value={Math.min(Math.max(value, min), sMax)}
        onChange={(e) => { const v = parseInt(e.target.value); onChange(v); if (!focused) setText(String(v)) }}
        className="w-full mt-1.5 accent-primary"
      />
    </div>
  )
}

// ── InfoRow ───────────────────────────────────────────────────────────────────

function InfoCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-md p-3 ${highlight
      ? 'bg-violet-500/10 border border-violet-500/20'
      : 'bg-muted/50'}`}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-bold ${highlight ? 'text-2xl text-violet-500' : 'text-base'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function PpmCalculator() {
  const t = useTranslations('calculators.ppm')

  const [gross, setGross] = useState(45_000)
  const [twins, setTwins] = useState(false)

  const weeks  = twins ? PPM_WEEKS_TWINS : PPM_WEEKS_SINGLE
  const days   = weeks * 7
  const dvz    = gross * 12 / 365
  const dvzRed = reduceDVZ(dvz)
  const daily  = dvzRed * PPM_RATE
  const monthly = Math.round(daily * 30)
  const total   = Math.round(daily * days)
  const net     = calcNet(gross)
  const pctNet  = (monthly / net) * 100

  return (
    <div className="space-y-4 max-w-2xl">

      {/* ── Vstup ── */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <SliderInput
          label={t('labelGross')}
          value={gross} min={15_000} max={200_000} step={500} sliderMax={120_000}
          suffix="Kč" onChange={setGross}
        />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox" checked={twins}
            onChange={(e) => setTwins(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-muted-foreground">{t('twinsLabel')}</span>
        </label>

        <p className="text-[10px] text-muted-foreground">{t('employeeNote')}</p>
      </div>

      {/* ── Výsledky ── */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold mb-4">{t('resultsTitle', { weeks })}</h2>

        <div className="grid grid-cols-2 gap-3">
          {/* Měsíční PPM — hlavní číslo */}
          <div className="col-span-2 rounded-lg bg-violet-500/10 border border-violet-500/20 p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('ppmMonthly')}</p>
            <p className="text-3xl font-bold text-violet-500">{fmtKc(monthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmtPct(pctNet)} {t('ofNet')}</p>
          </div>

          <InfoCard label={t('ppmTotal')}   value={fmtKc(total)}
            sub={t('forWeeks', { weeks })} />
          <InfoCard label={t('duration')}   value={`${weeks} ${t('weeks')}`}
            sub={`≈ ${(days / 30).toFixed(1)} ${t('months')}`} />
          <InfoCard label={t('dvzGross')}   value={`${fmtKc(Math.round(dvz))} /den`} />
          <InfoCard label={t('dvzReduced')} value={`${fmtKc(Math.round(dvzRed))} /den`} />
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">{t('reductionNote')}</p>
      </div>

      {/* ── Poznámky ── */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">{t('notesTitle')}</p>
        <p>• {t('note1')}</p>
        <p>• {t('note2')}</p>
      </div>
    </div>
  )
}
