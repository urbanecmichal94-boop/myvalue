'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

// ── Konstanty 2026 ────────────────────────────────────────────────────────────

const DVZ_T1   = 1_466
const DVZ_T2   = 2_199
const DVZ_T3   = 4_397
const PPM_RATE = 0.70
const PPM_WEEKS = 28
const PPM_DAYS  = PPM_WEEKS * 7
const RP_POOL   = 350_000
const RP_MIN    = 7_600

const SOCIAL_RATE = 0.065
const HEALTH_RATE = 0.045
const SLEVA       = 2_570
const TAX_LIMIT   = 188_800

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKcFull(n: number) { return Math.round(n).toLocaleString('cs-CZ') + ' Kč' }
function fmtPct(n: number) { return n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' }

function reduceDVZ(dvz: number): number {
  let r = Math.min(dvz, DVZ_T1)
  if (dvz > DVZ_T1) r += Math.min(dvz - DVZ_T1, DVZ_T2 - DVZ_T1) * 0.60
  if (dvz > DVZ_T2) r += Math.min(dvz - DVZ_T2, DVZ_T3 - DVZ_T2) * 0.30
  return r
}

function calcNet(gross: number): number {
  const social = gross * SOCIAL_RATE
  const health = gross * HEALTH_RATE
  const taxRaw = gross <= TAX_LIMIT ? gross * 0.15 : TAX_LIMIT * 0.15 + (gross - TAX_LIMIT) * 0.23
  return Math.round(gross - social - health - Math.max(0, taxRaw - SLEVA))
}

// Pool investovaný postupně + výběr
function calcSavings(rpMonthly: number, rpMonths: number, rate: number, withdrawal: number) {
  const r = rate / 100 / 12
  let bal = 0
  let deposited = 0
  // Fáze ukládání — nikdy nepřekročíme RP_POOL
  for (let i = 0; i < rpMonths; i++) {
    const deposit = Math.min(rpMonthly, RP_POOL - deposited)
    bal = bal * (1 + r) + deposit
    deposited += deposit
  }
  const atEnd = bal
  // Fáze výběru
  let wdMonths = 0
  while (bal > 0 && wdMonths < 600) { bal = Math.max(0, bal * (1 + r) - withdrawal); wdMonths++ }
  return { atEnd: Math.round(atEnd), wdMonths }
}

// ── SliderField ───────────────────────────────────────────────────────────────

function SliderField({ label, value, min, max, step, suffix, sliderMax, onChange, formatDisplay, note }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string
  sliderMax?: number; onChange: (v: number) => void
  formatDisplay?: (v: number) => string; note?: string
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
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {note && <span className="text-[10px] text-muted-foreground italic">{note}</span>}
      </div>
      <div className="relative">
        <input type="text" inputMode="decimal"
          value={focused ? text : (formatDisplay ? formatDisplay(value) : String(value))}
          onFocus={() => { setFoc(true); setText(String(value)) }}
          onBlur={() => { setFoc(false); commit(text) }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-full rounded-md border bg-background px-3 py-1.5 pr-14 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
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

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function MaternityCalculator() {
  const t = useTranslations('calculators.maternity')
  const [gross,      setGross]      = useState(45_000)
  const [noPpm,      setNoPpm]      = useState(false)
  const [savRate,    setSavRate]    = useState(4.0)
  const [withdrawal, setWithdrawal] = useState(10_000)

  // PPM
  const dvz        = gross * 12 / 365
  const dvzRed     = reduceDVZ(dvz)
  const ppmMonthly = Math.round(dvzRed * PPM_RATE * 30)
  const ppmTotal   = Math.round(ppmMonthly * (PPM_DAYS / 30))
  const netMonthly = calcNet(gross)

  // RP — max čerpání (co nejrychleji)
  // bez PPM: max = 7 600 Kč/měs; s PPM: max = výše PPM
  const rpMaxMonthly = noPpm ? RP_MIN : Math.max(RP_MIN, Math.min(ppmMonthly, RP_POOL))
  const rpMaxMonths  = Math.ceil(RP_POOL / rpMaxMonthly)

  // RP — standardní čerpání (rovnoměrně přes 3 roky)
  const ppmEndMonth = Math.ceil(PPM_DAYS / 30)   // ~7
  const rpStd3yMonths  = 36 - ppmEndMonth
  const rpStd3yMonthly = Math.round(Math.max(RP_MIN, Math.min(ppmMonthly, RP_POOL / rpStd3yMonths)))

  // Spořící účet — pool investovaný postupně (jen max čerpání)
  const { atEnd: savEnd, wdMonths } = calcSavings(rpMaxMonthly, rpMaxMonths, savRate, withdrawal)

  const rd3OpCost = netMonthly * 36 - (ppmTotal + rpStd3yMonthly * rpStd3yMonths)

  return (
    <div className="space-y-4 max-w-4xl">

      {/* ═══ WIP banner ═══ */}
      <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/8 p-4 text-xs space-y-1">
        <p className="font-semibold text-yellow-500">⚠ {t('wip')}</p>
        <p className="text-muted-foreground">{t('wipDesc')}</p>
      </div>

      {/* ═══ Vstup ═══ */}
      <div className="rounded-lg border bg-card p-5">
        <SliderField
          label={t('labelGross')}
          value={gross} min={10_000} max={200_000} step={500} sliderMax={120_000}
          suffix="Kč" onChange={setGross}
          formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')}
        />
        <div className="flex items-center gap-2 mt-3">
          <input type="checkbox" id="noPpm" checked={noPpm} onChange={(e) => setNoPpm(e.target.checked)}
            className="w-4 h-4 accent-primary cursor-pointer" />
          <label htmlFor="noPpm" className="text-xs text-muted-foreground cursor-pointer select-none">
            {t('noPpmLabel')}
            {noPpm && <span className="text-amber-500 ml-1">{t('noPpmNote')}</span>}
          </label>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {t('employeeNote')}
        </p>
      </div>

      {/* ═══ PPM + DVZ ═══ */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-base mb-3">{t('ppmTitle')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground mb-0.5">{t('dvzGross')}</p>
            <p className="font-bold text-sm">{fmtKcFull(Math.round(dvz))}<span className="font-normal text-muted-foreground"> /den</span></p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground mb-0.5">{t('dvzReduced')}</p>
            <p className="font-bold text-sm">{fmtKcFull(Math.round(dvzRed))}<span className="font-normal text-muted-foreground"> /den</span></p>
          </div>
          <div className="rounded-md bg-violet-500/10 border border-violet-500/20 p-3 col-span-2 sm:col-span-1">
            <p className="text-muted-foreground mb-0.5">{t('ppmMonthlyLabel')}</p>
            <p className="font-bold text-lg text-violet-500">{fmtKcFull(ppmMonthly)}</p>
            <p className="text-muted-foreground">{t('ppmPctOfNet', { pct: fmtPct(ppmMonthly / netMonthly * 100) })}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground mb-0.5">{t('ppmTotalLabel')}</p>
            <p className="font-bold text-sm">{fmtKcFull(ppmTotal)}</p>
            <p className="text-muted-foreground">{t('ppm28weeks')}</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          {t('reductionNote')}
        </p>
      </div>

      {/* ═══ Rodičovský příspěvek ═══ */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-base mb-1">{t('rpTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-4">{t('rpDesc')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Standardní — 3 roky */}
          <div className="rounded-md border p-4 text-xs space-y-2">
            <p className="font-semibold text-sm">{t('rd3yearsTitle')}</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('rpMonthlyLabel')}</span>
                <span className="font-semibold">{fmtKcFull(rpStd3yMonthly)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('forDuration')}</span>
                <span className="font-semibold">{t('monthsFrom7to36', { months: rpStd3yMonths })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ppmRpTotal')}</span>
                <span className="font-semibold">{fmtKcFull(ppmTotal + rpStd3yMonthly * rpStd3yMonths)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border text-red-400">
                <span>{t('lostIncome')}</span>
                <span className="font-semibold">−{fmtKcFull(rd3OpCost)}</span>
              </div>
            </div>
          </div>

          {/* Maximální čerpání */}
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 text-xs space-y-2">
            <p className="font-semibold text-sm">{t('rpMaxTitle')}</p>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('rpMonthlyMax')}</span>
                <span className="font-semibold text-green-500">{fmtKcFull(rpMaxMonthly)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('poolIn')}</span>
                <span className="font-semibold text-green-500">{t('monthsFrom7', { months: rpMaxMonths })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ppmRpTotal')}</span>
                <span className="font-semibold">{fmtKcFull(ppmTotal + RP_POOL)}</span>
              </div>
            </div>

            {/* Spořící účet — kompaktní box */}
            <div className="mt-3 rounded-md bg-background border p-3 space-y-2">
              <p className="font-semibold text-foreground">{t('savingsTitle')}</p>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label={t('labelInterest')} value={savRate} min={0} max={10} step={0.1} suffix="% p.a."
                  onChange={setSavRate}
                  formatDisplay={(v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} />
                <SliderField label={t('labelWithdrawal')} value={withdrawal} min={1_000} max={30_000} step={500} sliderMax={20_000}
                  suffix="Kč" onChange={setWithdrawal}
                  formatDisplay={(v) => Math.round(v).toLocaleString('cs-CZ')} />
              </div>
              <div className="flex justify-between pt-1 border-t border-border text-xs">
                <span className="text-muted-foreground">{t('savedAfterRp')}</span>
                <span className="font-bold text-green-500">{fmtKcFull(savEnd)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t('withdrawalDuration', { amount: fmtKcFull(withdrawal) })}</span>
                <span className="font-bold">{wdMonths >= 600 ? '∞' : t('months', { n: wdMonths })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Poznámky ═══ */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">{t('notesTitle')}</p>
        <p>• <strong>{t('note1')}</strong></p>
        <p>• <strong>OSVČ:</strong> {t('note2')}</p>
        <p>• {t('note3')}</p>
      </div>
    </div>
  )
}
