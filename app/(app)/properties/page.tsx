'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Building2, Home, MapPin, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getProperties } from '@/lib/property-storage'
import { PROPERTY_TYPE_LABELS, type Property } from '@/types/property'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtKc(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M'
  if (abs >= 1_000) return sign + Math.round(abs / 1_000).toLocaleString('cs-CZ') + ' tis.'
  return sign + Math.round(abs).toLocaleString('cs-CZ')
}

function fmtKcFull(n: number) { return Math.round(n).toLocaleString('cs-CZ') + ' Kč' }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' }

function calcMonthlyPayment(principal: number, rate: number, years: number) {
  const r = rate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function remainingBalance(principal: number, rate: number, M: number, months: number): number {
  const r = rate / 100 / 12
  if (r === 0) return Math.max(0, principal - M * months)
  return Math.max(0, principal * Math.pow(1 + r, months) - M * (Math.pow(1 + r, months) - 1) / r)
}

function monthsSince(dateStr: string): number {
  const start = new Date(dateStr)
  const now   = new Date()
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
}

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400_000)
}

// ── Karta nemovitosti ─────────────────────────────────────────────────────────

function PropertyCard({ p }: { p: Property }) {
  const t = useTranslations('properties')

  const totalInvested = p.purchasePrice + p.purchaseCosts
  const gain          = p.currentValue - totalInvested
  const gainPct       = totalInvested > 0 ? gain / totalInvested * 100 : 0
  const positive      = gain >= 0

  let loanBalance    = 0
  let monthlyPayment = 0
  if (p.mortgage) {
    const amortStart = p.mortgage.drawdownCompleteDate ?? p.mortgage.startDate
    const elapsedAmort = Math.min(Math.max(0, monthsSince(amortStart)), p.mortgage.termYears * 12)
    monthlyPayment = calcMonthlyPayment(p.mortgage.principal, p.mortgage.interestRate, p.mortgage.termYears)
    loanBalance    = remainingBalance(p.mortgage.principal, p.mortgage.interestRate, monthlyPayment, elapsedAmort)
  }
  const equity = p.currentValue - loanBalance

  const fixationWarning = p.mortgage?.fixationEndDate
    ? daysUntil(p.mortgage.fixationEndDate) <= 180
    : false
  const fixationDays = p.mortgage?.fixationEndDate ? daysUntil(p.mortgage.fixationEndDate) : null

  const lastRent     = p.rentalHistory?.length
    ? [...p.rentalHistory].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1)
    : undefined
  const curRentAmt   = lastRent?.rentMonthly  ?? p.rentMonthly  ?? 0
  const curOccPct    = lastRent?.occupancyPct ?? p.occupancyPct ?? 100
  const curOpex      = lastRent?.opexMonthly  ?? p.opexMonthly  ?? 0
  const effectiveRent = p.isRental ? curRentAmt * curOccPct / 100 : 0
  const cashflow      = p.isRental ? effectiveRent - curOpex - monthlyPayment : 0

  const ltv = loanBalance > 0 && p.currentValue > 0 ? loanBalance / p.currentValue * 100 : null
  const ltvColor = ltv === null ? '' : ltv < 60 ? 'text-green-500' : ltv < 80 ? 'text-amber-500' : 'text-red-400'

  return (
    <Link href={`/properties/${p.id}`}
      className="rounded-lg border bg-card p-5 flex flex-col gap-4 hover:bg-muted/30 transition-colors group">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-semibold text-base group-hover:text-primary transition-colors">{p.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
            {PROPERTY_TYPE_LABELS[p.type]}
            {p.address && (
              <><MapPin className="w-3 h-3 ml-1" />{p.address}</>
            )}
          </p>
        </div>
        {fixationWarning && fixationDays !== null && (
          <div className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {t('fixationWarning', { days: fixationDays })}
          </div>
        )}
      </div>

      {/* Metriky */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md bg-muted/50 p-2.5">
          <p className="text-muted-foreground">{t('metricCurrentValue')}</p>
          <p className="font-bold text-base">{fmtKc(p.currentValue)} Kč</p>
        </div>
        <div className="rounded-md bg-muted/50 p-2.5">
          <p className="text-muted-foreground">{t('metricEquity')}</p>
          <p className="font-bold text-base">{fmtKc(equity)} Kč</p>
          {ltv !== null && (
            <p className={`text-[10px] font-medium ${ltvColor}`}>
              LTV {ltv.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %
            </p>
          )}
        </div>
        <div className={`rounded-md p-2.5 ${positive ? 'bg-green-500/10' : 'bg-red-400/10'}`}>
          <p className="text-muted-foreground">{t('metricGainLoss')}</p>
          <p className={`font-bold text-base flex items-center gap-1 ${positive ? 'text-green-500' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {fmtKc(gain)} Kč
          </p>
          <p className={`text-[10px] ${positive ? 'text-green-500' : 'text-red-400'}`}>{fmtPct(gainPct)}</p>
        </div>
        {p.isRental ? (
          <div className={`rounded-md p-2.5 ${cashflow >= 0 ? 'bg-green-500/10' : 'bg-red-400/10'}`}>
            <p className="text-muted-foreground">{t('metricCashflow')}</p>
            <p className={`font-bold text-base ${cashflow >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {cashflow >= 0 ? '+' : ''}{fmtKc(cashflow)} Kč
            </p>
            <p className="text-[10px] text-muted-foreground">{t('metricMonthly')}</p>
          </div>
        ) : (
          <div className="rounded-md bg-muted/50 p-2.5">
            <p className="text-muted-foreground">{t('metricTotalInvested')}</p>
            <p className="font-bold text-base">{fmtKc(totalInvested)} Kč</p>
          </div>
        )}
      </div>
    </Link>
  )
}

// ── Stránka ───────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const t = useTranslations('properties')
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    setProperties(getProperties())
  }, [])

  const totalValue    = properties.reduce((s, p) => s + p.currentValue, 0)
  const totalInvested = properties.reduce((s, p) => s + p.purchasePrice + p.purchaseCosts, 0)
  const totalLoan     = properties.reduce((s, p) => {
    if (!p.mortgage) return s
    const amortStart = p.mortgage.drawdownCompleteDate ?? p.mortgage.startDate
    const el = Math.min(Math.max(0, monthsSince(amortStart)), p.mortgage.termYears * 12)
    const M  = calcMonthlyPayment(p.mortgage.principal, p.mortgage.interestRate, p.mortgage.termYears)
    return s + remainingBalance(p.mortgage.principal, p.mortgage.interestRate, M, el)
  }, 0)
  const totalEquity   = totalValue - totalLoan
  const totalCashflow = properties.reduce((s, p) => {
    if (!p.isRental) return s
    const lr = p.rentalHistory?.length
      ? [...p.rentalHistory].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1)
      : undefined
    const rent  = lr?.rentMonthly  ?? p.rentMonthly  ?? 0
    const occ   = lr?.occupancyPct ?? p.occupancyPct ?? 100
    const opex  = lr?.opexMonthly  ?? p.opexMonthly  ?? 0
    let mp = 0
    if (p.mortgage) {
      mp = calcMonthlyPayment(p.mortgage.principal, p.mortgage.interestRate, p.mortgage.termYears)
    }
    return s + rent * occ / 100 - opex - mp
  }, 0)

  void totalInvested

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" /> {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Link href="/properties/add"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> {t('addProperty')}
        </Link>
      </div>

      {/* Agregované metriky */}
      {properties.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: t('metricTotalValue'),    value: fmtKcFull(totalValue),    color: '' },
            { label: t('metricTotalEquity'),   value: fmtKcFull(totalEquity),   color: 'text-green-500' },
            { label: t('metricTotalDebt'),     value: fmtKcFull(totalLoan),     color: 'text-red-400' },
            {
              label: t('metricMonthlyCashflow'),
              value: (totalCashflow >= 0 ? '+' : '') + fmtKcFull(totalCashflow),
              color: totalCashflow >= 0 ? 'text-green-500' : 'text-red-400',
            },
            { label: t('metricCount'), value: String(properties.length), color: '' },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Seznam */}
      {properties.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">{t('noProperties')}</h3>
          <p className="text-muted-foreground text-sm mb-4">{t('noPropertiesDesc')}</p>
          <Link href="/properties/add"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> {t('addFirstProperty')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {properties.map((p) => <PropertyCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  )
}
