'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// ── Konstanty CZ 2026 ──────────────────────────────────────────────────────────
const SOCIAL_EMPLOYEE   = 0.065   // 6,5 % zaměstnanec
const HEALTH_EMPLOYEE   = 0.045   // 4,5 % zaměstnanec
const SOCIAL_EMPLOYER   = 0.248   // 24,8 % zaměstnavatel
const HEALTH_EMPLOYER   = 0.09    // 9 % zaměstnavatel
const TAX_RATE_15       = 0.15    // 15 % daň
const TAX_RATE_23       = 0.23    // 23 % daň nad 4× průměrná mzda
const AVG_WAGE_2026     = 47_200  // průměrná mzda 2026 pro účely progresivní daně
const PROGRESSIVE_LIMIT = 4 * AVG_WAGE_2026  // 188 800 Kč/měsíc

const SLEVA_POPLATNIK   = 2_570   // sleva na poplatníka (měsíčně)
const SLEVA_STUDENT     = 335     // sleva na studenta (měsíčně)
const SLEVA_ZTP         = 1_345   // sleva ZTP/P (měsíčně)
const SLEVA_INVALIDITY_1 = 210    // 1. a 2. stupeň
const SLEVA_INVALIDITY_2 = 420    // 3. stupeň
const DANOVYBONUS_DITE_1 = 1_267  // 1. dítě
const DANOVYBONUS_DITE_2 = 1_860  // 2. dítě
const DANOVYBONUS_DITE_3 = 2_320  // 3. a další dítě

// ── Výpočet ───────────────────────────────────────────────────────────────────

interface SalaryInput {
  gross: number
  isStudent: boolean
  isZtp: boolean
  invalidityLevel: 0 | 1 | 2 | 3   // 0 = žádná, 1-2 = 1./2. stupeň, 3 = 3. stupeň
  children: number
}

interface SalaryResult {
  gross: number
  socialEmployee: number
  healthEmployee: number
  taxBase: number
  taxBeforeCredits: number
  taxCredits: number
  taxBonus: number
  taxFinal: number
  net: number
  superGross: number
  socialEmployer: number
  healthEmployer: number
  effectiveRate: number
}

function calcSalary(input: SalaryInput): SalaryResult {
  const { gross, isStudent, isZtp, invalidityLevel, children } = input

  const socialEmployee = Math.round(gross * SOCIAL_EMPLOYEE)
  const healthEmployee = Math.round(gross * HEALTH_EMPLOYEE)
  const socialEmployer = Math.round(gross * SOCIAL_EMPLOYER)
  const healthEmployer = Math.round(gross * HEALTH_EMPLOYER)
  const superGross      = gross + socialEmployer + healthEmployer

  // Základ daně (zaokrouhlit na 100 Kč dolů)
  const taxBase = Math.floor(gross / 100) * 100

  // Progresivní daň
  let taxBeforeCredits: number
  if (taxBase <= PROGRESSIVE_LIMIT) {
    taxBeforeCredits = Math.round(taxBase * TAX_RATE_15)
  } else {
    taxBeforeCredits = Math.round(
      PROGRESSIVE_LIMIT * TAX_RATE_15 + (taxBase - PROGRESSIVE_LIMIT) * TAX_RATE_23
    )
  }

  // Slevy na dani
  let taxCredits = SLEVA_POPLATNIK
  if (isStudent)          taxCredits += SLEVA_STUDENT
  if (isZtp)              taxCredits += SLEVA_ZTP
  if (invalidityLevel === 1 || invalidityLevel === 2) taxCredits += SLEVA_INVALIDITY_1
  if (invalidityLevel === 3)                           taxCredits += SLEVA_INVALIDITY_2

  // Daňové zvýhodnění na děti (může jít do mínusu = daňový bonus)
  let childBonus = 0
  for (let i = 1; i <= children; i++) {
    if (i === 1) childBonus += DANOVYBONUS_DITE_1
    else if (i === 2) childBonus += DANOVYBONUS_DITE_2
    else childBonus += DANOVYBONUS_DITE_3
  }

  const taxAfterCredits = taxBeforeCredits - taxCredits
  const taxFinal        = Math.max(0, taxAfterCredits - childBonus)
  const taxBonus        = taxAfterCredits < 0
    ? Math.abs(taxAfterCredits) + childBonus
    : taxAfterCredits < childBonus
      ? childBonus - taxAfterCredits
      : 0

  const net = gross - socialEmployee - healthEmployee - taxFinal + taxBonus
  const effectiveRate = gross > 0 ? ((gross - net) / gross) * 100 : 0

  return {
    gross,
    socialEmployee,
    healthEmployee,
    taxBase,
    taxBeforeCredits,
    taxCredits,
    taxBonus,
    taxFinal,
    net,
    superGross,
    socialEmployer,
    healthEmployer,
    effectiveRate,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKc(n: number) {
  return Math.round(n).toLocaleString('cs-CZ') + ' Kč'
}

function fmtPct(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'
}

// ── Percentilová data CZ (hrubá mzda, Q3/Q4 2025, zdroj ČSÚ + odhad) ─────────
// Decilové meze — hodnota = spodní hranice daného percentilu
const CZ_MEDIAN  = 38_500   // medián hrubé mzdy Q4 2025
const CZ_AVERAGE = 47_200   // průměrná hrubá mzda Q4 2025

const CZ_DECILES: [number, number][] = [
  [0,   0],
  [10,  20_200],
  [20,  24_800],
  [30,  28_900],
  [40,  33_100],
  [50,  38_500],
  [60,  43_800],
  [70,  50_200],
  [80,  59_500],
  [90,  75_000],
  [100, 200_000],
]

/** Vrátí percentil (0–100) pro danou hrubou mzdu — lineární interpolace mezi decily */
function getPercentile(gross: number): number {
  if (gross <= 0) return 0
  for (let i = 0; i < CZ_DECILES.length - 1; i++) {
    const [pLow, salLow]  = CZ_DECILES[i]
    const [pHigh, salHigh] = CZ_DECILES[i + 1]
    if (gross >= salLow && gross < salHigh) {
      const frac = (gross - salLow) / (salHigh - salLow)
      return pLow + frac * (pHigh - pLow)
    }
  }
  return 99.9
}

/** Bins pro sloupcový graf — každý bin = 5 000 Kč, výška = % populace v tom rozmezí */
function buildDistributionBins(userGross: number) {
  const bins = []
  const edges = [0, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000,
                 55000, 60000, 70000, 80000, 100000, 150000, 200000]

  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1]
    const pLo = getPercentile(lo), pHi = getPercentile(hi)
    const share = pHi - pLo
    const midLabel = lo >= 100_000
      ? `${lo / 1000}k+`
      : `${lo / 1000}k`
    bins.push({
      range: midLabel,
      share: parseFloat(share.toFixed(2)),
      isUser: userGross >= lo && userGross < hi,
    })
  }
  return bins
}

// ── Percentile sekce ──────────────────────────────────────────────────────────

function PercentileSection({ gross }: { gross: number }) {
  const t = useTranslations('calculators.salary')
  const percentile = getPercentile(gross)
  const below  = parseFloat(percentile.toFixed(1))
  const above  = parseFloat((100 - percentile - 1).toFixed(1))
  const same   = parseFloat((100 - below - above).toFixed(1))
  const bins   = buildDistributionBins(gross)

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('czComparisonTitle')}</h3>
        <span className="text-xs text-muted-foreground">{t('czSource')}</span>
      </div>

      {/* Tři řádky — méně / stejně / více */}
      <div className="space-y-2">
        {[
          { label: t('czLessLabel'), pct: below,  color: 'bg-amber-400'  },
          { label: t('czSameLabel'), pct: same,   color: 'bg-blue-400'   },
          { label: t('czMoreLabel'), pct: above,  color: 'bg-emerald-500' },
        ].map(({ label, pct, color }) => (
          <div key={label} className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
            <span className="text-sm flex-1">{label}</span>
            <span className="text-sm font-bold tabular-nums">{pct.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} %</span>
          </div>
        ))}
      </div>

      {/* Graf distribuce */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">{t('czDistribution')}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={bins} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="10%">
            <XAxis dataKey="range" tick={{ fontSize: 9 }} interval={1} />
            <YAxis tick={{ fontSize: 9 }} unit="%" />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(1)} %`, t('czEmployeeShare')]}
              contentStyle={{ fontSize: 11 }}
            />
            <Bar
              dataKey="share"
              shape={(props: unknown) => {
                const p = props as { x: number; y: number; width: number; height: number; isUser: boolean }
                return <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height)}
                  fill={p.isUser ? '#f59e0b' : '#3b82f6'} fillOpacity={p.isUser ? 1 : 0.45} rx={2} />
              }}
            />
            <ReferenceLine x={buildDistributionBins(CZ_AVERAGE).find(b => b.isUser)?.range}
              stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'prům.', fontSize: 9, fill: '#f59e0b' }} />
            <ReferenceLine x={buildDistributionBins(CZ_MEDIAN).find(b => b.isUser)?.range}
              stroke="#10b981" strokeDasharray="4 2" label={{ value: 'med.', fontSize: 9, fill: '#10b981' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Benchmarky */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">{t('czMedian')}</p>
          <p className="text-sm font-bold mt-0.5">{fmtKc(CZ_MEDIAN)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gross > CZ_MEDIAN ? t('czAboveMedian', { amount: fmtKc(gross - CZ_MEDIAN) }) : t('czBelowMedian', { amount: fmtKc(CZ_MEDIAN - gross) })}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">{t('czAverage')}</p>
          <p className="text-sm font-bold mt-0.5">{fmtKc(CZ_AVERAGE)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gross > CZ_AVERAGE ? t('czAboveAverage', { amount: fmtKc(gross - CZ_AVERAGE) }) : t('czBelowAverage', { amount: fmtKc(CZ_AVERAGE - gross) })}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-komponenty ────────────────────────────────────────────────────────────

function Row({ label, value, highlight, note }: {
  label: string; value: string; highlight?: 'green' | 'red' | 'muted'; note?: string
}) {
  const valueClass =
    highlight === 'green' ? 'text-green-500 font-bold' :
    highlight === 'red'   ? 'text-red-400' :
    highlight === 'muted' ? 'text-muted-foreground' :
    'text-foreground'

  return (
    <div className="flex justify-between items-baseline py-2 border-b border-border last:border-0">
      <div>
        <span className="text-sm">{label}</span>
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </div>
      <span className={`text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

export function SalaryCalculator() {
  const t = useTranslations('calculators.salary')
  const [grossText, setGrossText] = useState('50000')
  const [isStudent, setIsStudent] = useState(false)
  const [isZtp, setIsZtp] = useState(false)
  const [invalidityLevel, setInvalidityLevel] = useState<0 | 1 | 2 | 3>(0)
  const [children, setChildren] = useState(0)

  const gross = parseInt(grossText.replace(/\s/g, '')) || 0
  const result = gross > 0
    ? calcSalary({ gross, isStudent, isZtp, invalidityLevel, children })
    : null

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-5xl">

      {/* ═══ Levý panel — vstupy ═══ */}
      <div className="flex-none lg:w-80 space-y-5">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-4">{t('sectionParams')}</h2>

          {/* Hrubá mzda */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t('labelGross')}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={grossText}
                onChange={(e) => setGrossText(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">Kč</span>
            </div>
            <input
              type="range" min={10_000} max={200_000} step={1_000}
              value={Math.min(Math.max(gross || 10_000, 10_000), 200_000)}
              onChange={(e) => setGrossText(e.target.value)}
              className="w-full mt-2 accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
              <span>10 tis.</span><span>200 tis.</span>
            </div>
          </div>

          <div className="h-px bg-border mb-4" />

          {/* Slevy */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('sectionCredits')}</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)}
                className="rounded accent-primary" />
              <span className="text-sm">{t('creditStudent')}</span>
              <span className="ml-auto text-xs text-muted-foreground">+335 Kč</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isZtp} onChange={(e) => setIsZtp(e.target.checked)}
                className="rounded accent-primary" />
              <span className="text-sm">{t('creditZtp')}</span>
              <span className="ml-auto text-xs text-muted-foreground">+1 345 Kč</span>
            </label>

            <div>
              <p className="text-sm mb-1.5">{t('creditInvalidity')}</p>
              <div className="flex gap-2 flex-wrap">
                {([0, 1, 2, 3] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setInvalidityLevel(lvl)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      invalidityLevel === lvl
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {lvl === 0 ? t('invalidityNone') : t('invalidityLevel', { n: lvl })}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-px bg-border my-4" />

          {/* Děti */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t('sectionChildCredit')}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setChildren(Math.max(0, children - 1))}
                className="w-8 h-8 rounded-md border flex items-center justify-center text-lg hover:bg-muted transition-colors"
              >−</button>
              <span className="text-xl font-bold w-6 text-center">{children}</span>
              <button
                onClick={() => setChildren(Math.min(10, children + 1))}
                className="w-8 h-8 rounded-md border flex items-center justify-center text-lg hover:bg-muted transition-colors"
              >+</button>
              <span className="text-sm text-muted-foreground">
                {children === 0 ? t('noChildren') :
                 children === 1 ? t('children1') :
                 children <= 4 ? t('children2to4', { n: children }) :
                 t('children5plus', { n: children })}
              </span>
            </div>
            {children > 0 && (
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {children >= 1 && <div>1. dítě: 1 267 Kč/měs</div>}
                {children >= 2 && <div>2. dítě: 1 860 Kč/měs</div>}
                {children >= 3 && <div>3.+ dítě: 2 320 Kč/měs</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Pravý panel — výsledky ═══ */}
      <div className="flex-1 space-y-4">

        {/* Hlavní výsledek */}
        {result ? (
          <>
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">{t('netSalary')}</span>
                <span className="text-3xl font-bold text-green-500">{fmtKc(result.net)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('effectiveRate')}</span>
                <span className="text-sm font-medium">{fmtPct(result.effectiveRate)}</span>
              </div>

              {/* Vizuální rozklad */}
              <div className="mt-4">
                <div className="flex rounded-full overflow-hidden h-4 text-[10px] font-bold">
                  <div
                    className="bg-green-500 flex items-center justify-center text-white overflow-hidden"
                    style={{ width: `${(result.net / result.gross) * 100}%` }}
                    title={`${t('legendNet')} ${fmtPct((result.net / result.gross) * 100)}`}
                  />
                  <div
                    className="bg-blue-400 flex items-center justify-center text-white overflow-hidden"
                    style={{ width: `${((result.socialEmployee + result.healthEmployee) / result.gross) * 100}%` }}
                    title={t('pieInsurance')}
                  />
                  <div
                    className="bg-orange-400 flex items-center justify-center text-white overflow-hidden"
                    style={{ width: `${(result.taxFinal / result.gross) * 100}%` }}
                    title={t('pieIncomeTax')}
                  />
                </div>
                <div className="flex gap-4 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />{t('legendNet')}</div>
                  <div className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />{t('legendInsurance')}</div>
                  <div className="flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />{t('legendTax')}</div>
                </div>
              </div>
            </div>

            {/* Detailní rozklad */}
            <div className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">{t('breakdownTitle')}</h3>

              <Row label={t('rowGross')} value={fmtKc(result.gross)} />
              <Row label={t('rowSocial')}
                   note={`(${(SOCIAL_EMPLOYEE * 100).toFixed(1)} %)`}
                   value={`− ${fmtKc(result.socialEmployee)}`}
                   highlight="red" />
              <Row label={t('rowHealth')}
                   note={`(${(HEALTH_EMPLOYEE * 100).toFixed(1)} %)`}
                   value={`− ${fmtKc(result.healthEmployee)}`}
                   highlight="red" />

              <div className="h-px bg-border my-2" />

              <Row label={t('rowTaxBase')} value={fmtKc(result.taxBase)} highlight="muted" />
              <Row label={t('rowTaxAdvance')} value={fmtKc(result.taxBeforeCredits)} highlight="muted" />
              <Row label={t('rowTaxpayerCredit')} value={`− ${fmtKc(SLEVA_POPLATNIK)}`} highlight="muted" />
              {isStudent && <Row label={t('rowStudentCredit')} value={`− ${fmtKc(SLEVA_STUDENT)}`} highlight="muted" />}
              {isZtp     && <Row label={t('rowZtpCredit')}     value={`− ${fmtKc(SLEVA_ZTP)}`}     highlight="muted" />}
              {(invalidityLevel === 1 || invalidityLevel === 2) &&
                <Row label={t('rowInvalidityCredit', { n: invalidityLevel })} value={`− ${fmtKc(SLEVA_INVALIDITY_1)}`} highlight="muted" />}
              {invalidityLevel === 3 &&
                <Row label={t('rowInvalidityCredit', { n: 3 })} value={`− ${fmtKc(SLEVA_INVALIDITY_2)}`} highlight="muted" />}
              {children > 0 && (
                <Row label={t('childCreditRow', { n: children, label: children === 1 ? t('children1') : children <= 4 ? t('children2to4', { n: children }) : t('children5plus', { n: children }) })}
                     value={`− ${fmtKc(
                       children === 1 ? DANOVYBONUS_DITE_1 :
                       children === 2 ? DANOVYBONUS_DITE_1 + DANOVYBONUS_DITE_2 :
                       DANOVYBONUS_DITE_1 + DANOVYBONUS_DITE_2 + (children - 2) * DANOVYBONUS_DITE_3
                     )}`}
                     highlight="muted" />
              )}

              <div className="h-px bg-border my-2" />

              {result.taxBonus > 0 ? (
                <Row label={t('rowChildBonus')} value={`+ ${fmtKc(result.taxBonus)}`} highlight="green" />
              ) : (
                <Row label={t('rowIncomeTax')} value={`− ${fmtKc(result.taxFinal)}`} highlight="red" />
              )}

              <div className="h-px bg-border my-2" />

              <Row label={t('rowNet')} value={fmtKc(result.net)} highlight="green" />
            </div>

            {/* Náklady zaměstnavatele */}
            <div className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold mb-2">{t('employerCostsTitle')}</h3>
              <Row label={t('rowGross')} value={fmtKc(result.gross)} />
              <Row label={t('rowSocial')}
                   note={`(${(SOCIAL_EMPLOYER * 100).toFixed(1)} %)`}
                   value={`+ ${fmtKc(result.socialEmployer)}`}
                   highlight="red" />
              <Row label={t('rowHealth')}
                   note={`(${(HEALTH_EMPLOYER * 100).toFixed(1)} %)`}
                   value={`+ ${fmtKc(result.healthEmployer)}`}
                   highlight="red" />
              <div className="h-px bg-border my-2" />
              <Row label={t('rowSuperGross')} value={fmtKc(result.superGross)} />
            </div>

            <PercentileSection gross={result.gross} />
          </>
        ) : (
          <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground text-sm">
            {t('enterGross')}
          </div>
        )}
      </div>
    </div>
  )
}
