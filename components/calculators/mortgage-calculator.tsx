'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  return Math.round(n).toLocaleString('cs-CZ')
}

function fmtKc(n: number) {
  return fmtNum(n) + ' Kč'
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M Kč'
  if (n >= 1_000)     return Math.round(n / 1_000) + ' tis. Kč'
  return fmtKc(n)
}

function parseInput(str: string) {
  return parseFloat(String(str).replace(/\s/g, '').replace(',', '.')) || 0
}

function balanceAfter(P: number, r: number, M: number, k: number) {
  if (r === 0) return P - M * k
  return P * Math.pow(1 + r, k) - M * (Math.pow(1 + r, k) - 1) / r
}

function monthlyPayment(P: number, r: number, n: number) {
  if (r === 0) return P / n
  return P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 rounded-lg bg-white/10 p-3 text-center">
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-[10px] text-white/60 mt-0.5">{label}</div>
    </div>
  )
}

interface BreakdownProps {
  monthIndex: number
  P: number; r: number; M: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: Record<string, unknown>) => string
}

function Breakdown({ monthIndex, P, r, M, t }: BreakdownProps) {
  const bal     = Math.max(0, balanceAfter(P, r, M, monthIndex))
  const intAmt  = bal * r
  const prinAmt = M - intAmt
  const prinPct = ((prinAmt / M) * 100).toFixed(1)
  const intPct  = ((intAmt  / M) * 100).toFixed(1)

  return (
    <div className="rounded-xl bg-black/20 p-4 text-left mt-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 text-center mb-3">
        {t('firstPaymentBreakdown')}
      </div>
      <div className="h-2 rounded-full bg-white/15 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${prinPct}%`, background: 'linear-gradient(90deg, #a8edea, #fed6e3)' }}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[10px] text-white/60 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block bg-[#a8edea]" />
            {t('principal2')}
          </div>
          <div className="text-sm font-bold text-white mt-0.5">{fmtKc(prinAmt)}</div>
          <div className="text-[10px] text-white/50">{prinPct} {t('ofPayment')}</div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-[10px] text-white/60 flex items-center justify-end gap-1">
            {t('interest')}
            <span className="w-2 h-2 rounded-full inline-block bg-[#fed6e3]" />
          </div>
          <div className="text-sm font-bold text-white mt-0.5">{fmtKc(intAmt)}</div>
          <div className="text-[10px] text-white/50">{intPct} {t('ofPayment')}</div>
        </div>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export function MortgageCalculator() {
  const t = useTranslations('calculators.mortgage')

  const [principal, setPrincipal] = useState(3_000_000)
  const [principalText, setPrincipalText] = useState(fmtNum(3_000_000))
  const [rate, setRate]   = useState(4.5)
  const [years, setYears] = useState(30)
  const [timelineYear, setTimelineYear] = useState(1)

  const isValid = principal > 0 && rate > 0 && years > 0
  const r = rate / 100 / 12
  const n = years * 12
  const M = isValid ? monthlyPayment(principal, r, n) : 0

  // ── principal input with formatting ──
  const handlePrincipalFocus = useCallback(() => {
    setPrincipalText(String(principal))
  }, [principal])

  const handlePrincipalBlur = useCallback((raw: number) => {
    if (raw > 0) setPrincipalText(fmtNum(raw))
  }, [])

  const handlePrincipalChange = useCallback((val: string) => {
    setPrincipalText(val)
    const raw = parseInput(val)
    if (raw > 0) setPrincipal(raw)
  }, [])

  const principalSliderLabel = principal >= 1_000_000
    ? (principal / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'
    : Math.round(principal / 1_000) + ' tis.'

  // ── timeline calculations ──
  const tlMonthIndex    = timelineYear * 12
  const remaining       = Math.max(0, balanceAfter(principal, r, M, tlMonthIndex))
  const paidPrincipal   = principal - remaining
  const paidInterest    = M * tlMonthIndex - paidPrincipal
  const pctDone         = isValid ? ((paidPrincipal / principal) * 100).toFixed(1) : '0'

  // ── timeline breakdown ──
  const startMonth   = (timelineYear - 1) * 12
  const tlBal        = Math.max(0, balanceAfter(principal, r, M, startMonth))
  const tlIntAmt     = tlBal * r
  const tlPrinAmt    = M - tlIntAmt
  const tlPrinPct    = isValid ? ((tlPrinAmt / M) * 100).toFixed(1) : '0'
  const tlIntPct     = isValid ? ((tlIntAmt  / M) * 100).toFixed(1) : '0'

  // ── tick marks ──
  const step   = years <= 10 ? 1 : years <= 20 ? 5 : 10
  const ticks: number[] = []
  for (let y = step; y <= years; y += step) ticks.push(y)
  if (ticks[ticks.length - 1] !== years) ticks.push(years)

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ═══ Left panel ═══ */}
      <div
        className="flex-none lg:w-[460px] rounded-2xl p-8"
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏠</div>
          <h2 className="text-xl font-bold text-white">{t('title')}</h2>
        </div>

        {/* Principal */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-2">
            {t('principal')}
          </label>
          <div className="relative">
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-white/40 pointer-events-none">{t('suffixKc')}</span>
            <input
              type="text"
              inputMode="numeric"
              value={principalText}
              onFocus={handlePrincipalFocus}
              onBlur={() => handlePrincipalBlur(parseInput(principalText))}
              onChange={(e) => handlePrincipalChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/7 text-white text-lg font-medium px-4 py-3 pr-14 outline-none focus:border-blue-400 focus:bg-blue-400/8 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={100_000} max={20_000_000} step={50_000}
              value={Math.min(Math.max(principal, 100_000), 20_000_000)}
              onChange={(e) => { const v = parseInt(e.target.value); setPrincipal(v); setPrincipalText(fmtNum(v)) }}
              className="flex-1 accent-blue-400"
            />
            <span className="text-[12px] text-white/40 min-w-[52px] text-right">{principalSliderLabel}</span>
          </div>
        </div>

        {/* Rate */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-2">
            {t('rate')}
          </label>
          <div className="relative">
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-white/40 pointer-events-none">{t('suffixPa')}</span>
            <input
              type="number" min={0.1} max={20} step={0.1}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-white/10 bg-white/7 text-white text-lg font-medium px-4 py-3 pr-20 outline-none focus:border-blue-400 focus:bg-blue-400/8 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={0.1} max={15} step={0.1}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="flex-1 accent-blue-400"
            />
            <span className="text-[12px] text-white/40 min-w-[52px] text-right">
              {rate.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} %
            </span>
          </div>
        </div>

        {/* Years */}
        <div className="mb-5">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-2">
            {t('years')}
          </label>
          <div className="relative">
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-white/40 pointer-events-none">{t('suffixYears')}</span>
            <input
              type="number" min={1} max={40} step={1}
              value={years}
              onChange={(e) => { const v = parseInt(e.target.value) || 1; setYears(v); setTimelineYear(Math.min(timelineYear, v)) }}
              className="w-full rounded-xl border border-white/10 bg-white/7 text-white text-lg font-medium px-4 py-3 pr-14 outline-none focus:border-blue-400 focus:bg-blue-400/8 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range" min={1} max={40} step={1}
              value={years}
              onChange={(e) => { const v = parseInt(e.target.value); setYears(v); setTimelineYear(Math.min(timelineYear, v)) }}
              className="flex-1 accent-blue-400"
            />
            <span className="text-[12px] text-white/40 min-w-[52px] text-right">{years} r.</span>
          </div>
        </div>

        <div className="h-px bg-white/8 my-5" />

        {/* Result card */}
        {isValid ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'linear-gradient(135deg, #4f8ef7, #7b55f7)', boxShadow: '0 8px 32px rgba(79,142,247,.35)' }}
          >
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">{t('monthlyPayment')}</div>
            <div className="text-4xl font-extrabold text-white tracking-tight leading-none">{fmtNum(M)}</div>
            <div className="text-base text-white/75 mt-1">{t('perMonth')}</div>

            <div className="flex gap-3 mt-4">
              <StatBox value={fmtShort(M * n)}       label={t('totalPaid')}     />
              <StatBox value={fmtShort(M * n - principal)} label={t('totalInterest')} />
            </div>

            <Breakdown monthIndex={0} P={principal} r={r} M={M} t={t} />
          </div>
        ) : (
          <div className="rounded-xl border border-red-400/30 bg-red-400/15 p-4 text-center text-[#ff9f9f] text-sm">
            {t('invalidValues')}
          </div>
        )}
      </div>

      {/* ═══ Right panel — timeline ═══ */}
      {isValid && (
        <div
          className="flex-none lg:w-[500px] rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-[13px] font-bold uppercase tracking-wide text-white/60">
              {t('repaymentProgress')}
            </div>
            <div
              className="rounded-full px-4 py-1 text-sm font-bold text-[#7fb5ff]"
              style={{ background: 'rgba(79,142,247,.25)', border: '1px solid rgba(79,142,247,.4)' }}
            >
              {t('yearOf', { year: timelineYear, total: years })}
            </div>
          </div>

          {/* Slider */}
          <input
            type="range" min={1} max={years} step={1}
            value={timelineYear}
            onChange={(e) => setTimelineYear(parseInt(e.target.value))}
            className="w-full accent-purple-400"
          />
          <div className="flex justify-between mt-1">
            {ticks.map((y) => (
              <span key={y} className="text-[10px] text-white/40">{y} r.</span>
            ))}
          </div>

          {/* 3 stat boxes */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-base font-bold text-white leading-tight">{fmtShort(remaining)}</div>
              <div className="text-[10px] text-white/50 mt-1">{t('remaining')}</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(168,237,234,0.12)', border: '1px solid rgba(168,237,234,0.2)' }}>
              <div className="text-base font-bold text-white leading-tight">{fmtShort(paidPrincipal)}</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#a8edea]" />
                <span className="text-[10px] text-white/50">{t('paidPrincipal')}</span>
              </div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(254,214,227,0.12)', border: '1px solid rgba(254,214,227,0.2)' }}>
              <div className="text-base font-bold text-white leading-tight">{fmtShort(paidInterest)}</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#fed6e3]" />
                <span className="text-[10px] text-white/50">{t('paidInterest')}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="rounded-xl p-4 mt-4" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/50 text-center mb-3">
              {t('progressTitle')}
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pctDone}%`, background: 'linear-gradient(90deg, #a8edea 0%, #4f8ef7 100%)' }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/40">
              <span>{t('progressStart')}</span>
              <span className="font-semibold text-white/60">{t('progressPct', { pct: pctDone })}</span>
              <span>{t('progressEnd')}</span>
            </div>
          </div>

          {/* Timeline breakdown */}
          <div className="rounded-xl p-4 mt-4" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/50 text-center mb-3">
              {t('paymentAt', { year: timelineYear })}
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${tlPrinPct}%`, background: 'linear-gradient(90deg, #a8edea, #fed6e3)' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-white/60 flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-[#a8edea]" />
                  {t('principal2')}
                </div>
                <div className="text-base font-bold text-white">{fmtKc(tlPrinAmt)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{tlPrinPct} {t('ofPayment')}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-white/60 flex items-center justify-end gap-1.5 mb-1">
                  {t('interest')}
                  <span className="w-2 h-2 rounded-full shrink-0 bg-[#fed6e3]" />
                </div>
                <div className="text-base font-bold text-white">{fmtKc(tlIntAmt)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{tlIntPct} {t('ofPayment')}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
