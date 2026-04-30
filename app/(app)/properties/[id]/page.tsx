'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft, Pencil, Trash2, AlertTriangle, TrendingUp, TrendingDown, Plus, X, Check
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { getProperties, saveProperty, deleteProperty } from '@/lib/db/properties'
import { generateId } from '@/lib/storage'
import { PROPERTY_TYPE_LABELS, type Property, type PropertyValuation, type RentalRecord } from '@/types/property'
import { PropertyForm } from '@/components/properties/property-form'
import { makeFmtKc, makeFmtKcFull } from '@/lib/fmt-kc'
function fmtPct(n: number, dec = 1) {
  return (n >= 0 ? '+' : '') + n.toLocaleString('cs-CZ', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %'
}

function calcMonthlyPayment(principal: number, rate: number, years: number) {
  const r = rate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr)
  const n = new Date()
  return (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth())
}

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400_000)
}

function buildAmortization(
  principal: number, rate: number, termYears: number, startDate: string,
  drawdownStartDate?: string, drawdownCompleteDate?: string,
) {
  const r = rate / 100 / 12
  const n = termYears * 12
  const M = r === 0 ? principal / n : principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)

  // Anuita začíná od dočerpání (nebo od podpisu, pokud není zadáno)
  const amortStart  = drawdownCompleteDate ?? startDate
  const elapsedAmort = Math.min(Math.max(0, monthsSince(amortStart)), n)

  // Měsíce předčerpání — jen úroky, jistina se nesplácí
  const preDrawdownMonths = drawdownStartDate && drawdownCompleteDate
    ? Math.max(0, monthsSince(drawdownStartDate) - monthsSince(drawdownCompleteDate))
    : 0
  const preDrawdownInterest = preDrawdownMonths * principal * r

  const startYear = new Date(amortStart).getFullYear()

  let balance      = principal
  let cumInterest  = preDrawdownInterest  // zahrnout předčerpání
  let cumPrincipal = 0

  const points: { year: number; balance: number; cumInterest: number; cumPrincipal: number }[] = []
  points.push({ year: startYear, balance: Math.round(principal), cumInterest: Math.round(preDrawdownInterest), cumPrincipal: 0 })

  for (let y = 1; y <= termYears; y++) {
    for (let m = 0; m < 12; m++) {
      const interest = balance * r
      const princ    = Math.min(M - interest, balance)
      cumInterest   += interest
      cumPrincipal  += princ
      balance        = Math.max(0, balance - princ)
    }
    points.push({
      year:         startYear + y,
      balance:      Math.round(balance),
      cumInterest:  Math.round(cumInterest),
      cumPrincipal: Math.round(cumPrincipal),
    })
  }

  const nowYear = startYear + elapsedAmort / 12

  // Aktuální zůstatek
  let curBal    = principal
  let curCumInt = preDrawdownInterest
  for (let m = 0; m < elapsedAmort; m++) {
    const interest = curBal * r
    curCumInt += interest
    curBal = Math.max(0, curBal - Math.min(M - interest, curBal))
  }

  return {
    points, M,
    currentBalance:       Math.round(curBal),
    currentCumInterest:   Math.round(curCumInt),
    preDrawdownInterest:  Math.round(preDrawdownInterest),
    preDrawdownMonths,
    nowYear,
    elapsed: elapsedAmort,
  }
}

// ── Detail ────────────────────────────────────────────────────────────────────

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const t = useTranslations('properties')
  const fmtKc    = makeFmtKc(`${t('form.notesCzk')} M`, `tis. ${t('form.notesCzk')}`, t('form.notesCzk'))
  const fmtKcFull = makeFmtKcFull(t('form.notesCzk'))

  const [property, setProperty] = useState<Property | null>(null)
  const [editing,  setEditing]  = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Přidání ocenění
  const [newValDate,  setNewValDate]  = useState(new Date().toISOString().slice(0, 10))
  const [newValValue, setNewValValue] = useState('')
  const [newValNote,  setNewValNote]  = useState('')

  // Edit ocenění
  const [editValId,    setEditValId]    = useState<string | null>(null)
  const [editValDate,  setEditValDate]  = useState('')
  const [editValValue, setEditValValue] = useState('')
  const [editValNote,  setEditValNote]  = useState('')

  // Přidání záznamu pronájmu
  const today = new Date().toISOString().slice(0, 10)
  const [newRentDate,   setNewRentDate]   = useState(today)
  const [newRentAmt,    setNewRentAmt]    = useState('')
  const [newRentOcc,    setNewRentOcc]    = useState('95')
  const [newRentOpex,   setNewRentOpex]   = useState('')
  const [newRentNote,   setNewRentNote]   = useState('')

  // Edit záznamu pronájmu
  const [editRentId,   setEditRentId]   = useState<string | null>(null)
  const [editRentDate, setEditRentDate] = useState('')
  const [editRentAmt,  setEditRentAmt]  = useState('')
  const [editRentOcc,  setEditRentOcc]  = useState('')
  const [editRentOpex, setEditRentOpex] = useState('')
  const [editRentNote, setEditRentNote] = useState('')

  useEffect(() => {
    getProperties()
      .then((list) => {
        const p = list.find((x) => x.id === id)
        if (p) setProperty(p)
        else router.replace('/properties')
      })
      .catch(console.error)
  }, [id, router])

  if (!property) return null

  // ── Výpočty ────────────────────────────────────────────────────────────────

  const totalInvested = property.purchasePrice + property.purchaseCosts
  const gain          = property.currentValue - totalInvested
  const gainPct       = totalInvested > 0 ? gain / totalInvested * 100 : 0

  // Věk nemovitosti v rocích (pro p.a. výpočet) — zobrazovat jen při >3 měsících
  const purchaseMs    = (Date.now() - new Date(property.purchaseDate).getTime()) / 1000 / 60 / 60 / 24 / 365.25
  const gainPctPA     = purchaseMs >= 0.25 && totalInvested > 0
    ? (Math.pow(property.currentValue / totalInvested, 1 / purchaseMs) - 1) * 100
    : null

  // Hypotéka
  const mort = property.mortgage
  const amort = mort ? buildAmortization(mort.principal, mort.interestRate, mort.termYears, mort.startDate, mort.drawdownStartDate, mort.drawdownCompleteDate) : null
  const loanBalance = amort?.currentBalance ?? 0
  const equity      = property.currentValue - loanBalance
  const fixDays     = mort?.fixationEndDate ? daysUntil(mort.fixationEndDate) : null

  // Cashflow — z posledního záznamu pronájmu (nebo deprecated flat polí)
  const sortedRental = property.rentalHistory?.length
    ? [...property.rentalHistory].sort((a, b) => a.startDate.localeCompare(b.startDate))
    : []
  const lastRent = sortedRental.at(-1)
  const curRentAmt  = lastRent?.rentMonthly  ?? property.rentMonthly  ?? 0
  const curOccPct   = lastRent?.occupancyPct ?? property.occupancyPct ?? 100
  const curOpex     = lastRent?.opexMonthly  ?? property.opexMonthly  ?? 0

  const effectiveRent = property.isRental ? curRentAmt * curOccPct / 100 : 0
  const cashflow      = property.isRental ? effectiveRent - curOpex - (amort?.M ?? 0) : 0
  const grossYield    = curRentAmt ? (curRentAmt * 12) / property.currentValue * 100 : 0
  const yieldOnCost   = curRentAmt && totalInvested > 0 ? (curRentAmt * 12) / totalInvested * 100 : 0

  // Ekonomický výsledek — od koupě do dnes
  const totalInterestPaid = amort?.currentCumInterest ?? 0

  // cumNetRent — period-weighted přes záznamy pronájmu
  function calcCumNetRent(): number {
    if (!property || !property.isRental) return 0
    if (!sortedRental.length) {
      // fallback na deprecated pole
      const months = Math.max(0, monthsSince(property!.purchaseDate))
      return (effectiveRent - curOpex) * months
    }
    const nowStr = new Date().toISOString().slice(0, 10)
    let total = 0
    for (let i = 0; i < sortedRental.length; i++) {
      const rec  = sortedRental[i]
      const from = new Date(rec.startDate)
      const toStr = sortedRental[i + 1]?.startDate ?? nowStr
      const to   = new Date(toStr)
      const months = Math.max(0,
        (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
      const net = rec.rentMonthly * rec.occupancyPct / 100 - rec.opexMonthly
      total += net * months
    }
    return total
  }
  const cumNetRent = calcCumNetRent()
  // Skutečný výsledek = kapitálový zisk − zaplacené úroky + čistý nájem
  const realGain    = gain - totalInterestPaid + cumNetRent
  const realGainPct = totalInvested > 0 ? realGain / totalInvested * 100 : 0

  // ── Uložení ocenění ───────────────────────────────────────────────────────

  function addValuation() {
    const val = parseFloat(newValValue.replace(/\s/g, '').replace(',', '.'))
    if (!val || val <= 0 || !property) return
    const v: PropertyValuation = { id: generateId(), date: newValDate, value: val, note: newValNote || undefined }
    const newHistory = [...property.valuationHistory, v].sort((a, b) => a.date.localeCompare(b.date))
    const last = newHistory[newHistory.length - 1]  // nejnovější dle data
    const updated: Property = {
      ...property,
      currentValue: last.value,
      lastValuedAt: last.date,
      valuationHistory: newHistory,
      updatedAt: new Date().toISOString(),
    }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
    setNewValValue('')
    setNewValNote('')
  }

  // ── Smazání ocenění ───────────────────────────────────────────────────────

  function deleteValuation(valId: string) {
    if (!property) return
    const newHistory = property.valuationHistory.filter((v) => v.id !== valId)
    const last       = newHistory[newHistory.length - 1]
    const updated: Property = {
      ...property,
      valuationHistory: newHistory,
      currentValue: last?.value ?? property.currentValue,
      lastValuedAt: last?.date  ?? property.lastValuedAt,
      updatedAt: new Date().toISOString(),
    }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
  }

  // ── Edit ocenění ──────────────────────────────────────────────────────────

  function startEditVal(v: PropertyValuation) {
    setEditValId(v.id)
    setEditValDate(v.date)
    setEditValValue(String(v.value))
    setEditValNote(v.note ?? '')
  }

  function saveEditVal() {
    if (!property || !editValId) return
    const val = parseFloat(editValValue.replace(/\s/g, '').replace(',', '.'))
    if (!val || val <= 0) return
    const newHistory = property.valuationHistory
      .map((v) => v.id === editValId ? { ...v, date: editValDate, value: val, note: editValNote || undefined } : v)
      .sort((a, b) => a.date.localeCompare(b.date))
    const last = newHistory[newHistory.length - 1]
    const updated: Property = {
      ...property,
      valuationHistory: newHistory,
      currentValue: last.value,
      lastValuedAt: last.date,
      updatedAt: new Date().toISOString(),
    }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
    setEditValId(null)
  }

  // ── Přidání záznamu pronájmu ─────────────────────────────────────────────

  function addRentalRecord() {
    const amt = parseFloat(newRentAmt.replace(/\s/g, '').replace(',', '.'))
    if (!amt || amt <= 0 || !property) return
    const rec: RentalRecord = {
      id: generateId(),
      startDate:    newRentDate,
      rentMonthly:  amt,
      occupancyPct: parseFloat(newRentOcc) || 95,
      opexMonthly:  parseFloat(newRentOpex.replace(/\s/g, '').replace(',', '.')) || 0,
      note: newRentNote || undefined,
    }
    const newHistory = [...(property.rentalHistory ?? []), rec]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    const updated: Property = { ...property, rentalHistory: newHistory, updatedAt: new Date().toISOString() }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
    setNewRentAmt('')
    setNewRentOpex('')
    setNewRentNote('')
  }

  // ── Smazání záznamu pronájmu ──────────────────────────────────────────────

  function deleteRentalRecord(rid: string) {
    if (!property) return
    const newHistory = (property.rentalHistory ?? []).filter((r) => r.id !== rid)
    const updated: Property = { ...property, rentalHistory: newHistory, updatedAt: new Date().toISOString() }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
  }

  // ── Edit záznamu pronájmu ─────────────────────────────────────────────────

  function startEditRent(r: RentalRecord) {
    setEditRentId(r.id)
    setEditRentDate(r.startDate)
    setEditRentAmt(String(r.rentMonthly))
    setEditRentOcc(String(r.occupancyPct))
    setEditRentOpex(String(r.opexMonthly))
    setEditRentNote(r.note ?? '')
  }

  function saveEditRent() {
    if (!property || !editRentId) return
    const amt = parseFloat(editRentAmt.replace(/\s/g, '').replace(',', '.'))
    if (!amt || amt <= 0) return
    const newHistory = (property.rentalHistory ?? [])
      .map((r) => r.id === editRentId
        ? { ...r, startDate: editRentDate, rentMonthly: amt,
            occupancyPct: parseFloat(editRentOcc) || 95,
            opexMonthly: parseFloat(editRentOpex.replace(/\s/g, '').replace(',', '.')) || 0,
            note: editRentNote || undefined }
        : r)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    const updated: Property = { ...property, rentalHistory: newHistory, updatedAt: new Date().toISOString() }
    saveProperty(updated).catch(console.error)
    setProperty(updated)
    setEditRentId(null)
  }

  // ── Smazání ───────────────────────────────────────────────────────────────

  function handleDelete() {
    deleteProperty(id).catch(console.error)
    router.push('/properties')
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <button onClick={() => setEditing(false)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> {t('detail.backToDetail')}
          </button>
          <h1 className="text-2xl font-bold">{t('detail.editTitle')}</h1>
        </div>
        <PropertyForm
          initialData={property}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tickInterval = mort ? (mort.termYears <= 15 ? 1 : mort.termYears <= 25 ? 4 : 9) : 0

  return (
    <div className="p-6 max-w-5xl space-y-5">

      {/* Navigace */}
      <div className="flex items-center justify-between">
        <Link href="/properties"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t('detail.back')}
        </Link>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            <Pencil className="w-3.5 h-3.5" /> {t('detail.edit')}
          </button>
          <button onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 rounded-md border border-red-400/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> {t('detail.delete')}
          </button>
        </div>
      </div>

      {/* Smazání confirm */}
      {showDeleteConfirm && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-4 flex items-center justify-between gap-4">
          <p className="text-sm">{t('detail.confirmDelete', { name: property.name })}</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">{t('detail.cancelDelete')}</button>
            <button onClick={handleDelete}
              className="rounded-md bg-red-500 text-white px-3 py-1.5 text-sm hover:bg-red-600">{t('detail.confirmDeleteBtn')}</button>
          </div>
        </div>
      )}

      {/* ── Hlavička ── */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">{property.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {PROPERTY_TYPE_LABELS[property.type]}
              {property.address && ` · ${property.address}`}
              {` · koupeno ${property.purchaseDate}`}
            </p>
          </div>
          {fixDays !== null && fixDays <= 180 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('detail.fixationEndLabel', { date: property.mortgage?.fixationEndDate })} — {t('detail.fixationDaysLeft', { days: fixDays })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground">{t('detail.currentValue')}</p>
            <p className="font-bold text-lg mt-0.5">{fmtKc(property.currentValue)}</p>
            <p className="text-muted-foreground text-[10px]">{t('detail.valuedAt', { date: property.lastValuedAt })}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground">{t('detail.equityLabel')}</p>
            <p className="font-bold text-lg mt-0.5 text-indigo-500">{fmtKc(equity)}</p>
            {loanBalance > 0 && <p className="text-muted-foreground text-[10px]">{t('detail.debtLabel', { amount: fmtKc(loanBalance) })}</p>}
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-muted-foreground">{t('detail.totalInvested')}</p>
            <p className="font-bold text-lg mt-0.5">{fmtKc(totalInvested)}</p>
            {property.purchaseCosts > 0 && (
              <p className="text-muted-foreground text-[10px]">{t('detail.purchaseCostsNote', { amount: fmtKcFull(property.purchaseCosts) })}</p>
            )}
          </div>
          <div className={`rounded-md p-3 ${gain >= 0 ? 'bg-green-500/10' : 'bg-red-400/10'}`}>
            <p className="text-muted-foreground">{t('detail.capitalGain')}</p>
            <p className={`font-bold text-lg mt-0.5 ${gain >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmtKc(gain)}</p>
            <p className={`text-[10px] ${gain >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {fmtPct(gainPct)}{gainPctPA !== null && ` · ${fmtPct(gainPctPA)} p.a.`}
            </p>
          </div>
          {totalInterestPaid > 0 && (
            <div className="rounded-md bg-orange-400/10 border border-orange-400/20 p-3">
              <p className="text-muted-foreground">{t('detail.interestPaid')}</p>
              <p className="font-bold text-lg mt-0.5 text-orange-400">−{fmtKc(totalInterestPaid)}</p>
              <p className="text-muted-foreground text-[10px]">{t('detail.interestPaidSince')}</p>
            </div>
          )}
          <div className={`rounded-md border p-3 ${realGain >= 0 ? 'border-green-500/30 bg-green-500/8' : 'border-red-400/30 bg-red-400/8'}`}>
            <p className="text-muted-foreground">
              {t('detail.realResult')}
              {totalInterestPaid > 0 && <span className="text-orange-400"> {t('detail.minusInterest')}</span>}
              {cumNetRent > 0 && <span className="text-green-500"> {t('detail.plusRent')}</span>}
            </p>
            <p className={`font-bold text-lg mt-0.5 ${realGain >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {realGain >= 0 ? '+' : ''}{fmtKc(realGain)}
            </p>
            <p className={`text-[10px] ${realGain >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmtPct(realGainPct)}</p>
          </div>
        </div>
      </div>

      {/* ── Hypotéka ── */}
      {mort && amort && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">{t('detail.mortgageTitle')}</h2>

          {/* Fáze čerpání */}
          {(mort.drawdownStartDate || mort.drawdownCompleteDate) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs rounded-md bg-amber-500/8 border border-amber-500/20 p-3">
              <div>
                <p className="text-muted-foreground">{t('detail.signDate')}</p>
                <p className="font-semibold">{mort.startDate}</p>
              </div>
              {mort.drawdownStartDate && (
                <div>
                  <p className="text-muted-foreground">{t('detail.firstDrawdown')}</p>
                  <p className="font-semibold text-amber-500">{mort.drawdownStartDate}</p>
                </div>
              )}
              {mort.drawdownCompleteDate && (
                <div>
                  <p className="text-muted-foreground">{t('detail.drawdownComplete')}</p>
                  <p className="font-semibold text-amber-500">{mort.drawdownCompleteDate}</p>
                  {amort && amort.preDrawdownMonths > 0 && (
                    <p className="text-muted-foreground text-[10px] mt-0.5">
                      {t('detail.preDrawdownNote', { months: amort.preDrawdownMonths, amount: fmtKc(amort.preDrawdownInterest) })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3">
              <p className="text-muted-foreground">{t('detail.monthlyPayment')}</p>
              <p className="font-bold text-lg text-blue-500">{fmtKcFull(amort.M)}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">{t('detail.remainingDebt')}</p>
              <p className="font-bold text-lg">{fmtKc(loanBalance)}</p>
              <p className="text-muted-foreground text-[10px]">
                {t('detail.yearsRemaining', { n: Math.max(0, mort.termYears - Math.floor(amort.elapsed / 12)) })}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">{t('detail.paidSoFar')}</p>
              <p className="font-bold text-lg">{fmtKc(mort.principal - loanBalance)}</p>
              <p className="text-muted-foreground text-[10px]">{t('detail.principal')}</p>
            </div>
            <div className="rounded-md bg-orange-500/10 border border-orange-400/20 p-3">
              <p className="text-muted-foreground">{t('detail.interestPaidTotal')}</p>
              <p className="font-bold text-lg text-orange-400">{fmtKc(amort.currentCumInterest)}</p>
            </div>
            {(() => {
              const ltv = loanBalance > 0 ? loanBalance / property.currentValue * 100 : 0
              const ltvColor = ltv < 60 ? 'text-green-500' : ltv < 80 ? 'text-amber-500' : 'text-red-400'
              const ltvBg    = ltv < 60 ? 'bg-green-500/10 border-green-500/20' : ltv < 80 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-400/10 border-red-400/20'
              return (
                <div className={`rounded-md border p-3 ${ltvBg}`}>
                  <p className="text-muted-foreground">{t('detail.ltvLabel')}</p>
                  <p className={`font-bold text-lg ${ltvColor}`}>
                    {ltv.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t('detail.debtValue')}</p>
                </div>
              )
            })()}
          </div>

          {/* Amortizační graf */}
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              {t('detail.amortChartNote', { rate: mort.interestRate, years: mort.termYears })}
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={amort.points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={tickInterval} />
                <YAxis tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : v >= 1_000 ? `${Math.round(v/1_000)}k` : String(v)}
                  width={65} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [fmtKcFull(Number(v)), String(name)]}
                  contentStyle={{ fontSize: 11 }}
                  labelFormatter={(l) => t('detail.chartTooltipYear', { year: l })}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <ReferenceLine x={Math.round(amort.nowYear)} stroke="#6b7280" strokeDasharray="3 3"
                  label={{ value: t('detail.chartLabelToday'), fontSize: 10, fill: '#6b7280' }} />
                {mort.fixationEndDate && (
                  <ReferenceLine
                    x={new Date(mort.fixationEndDate).getFullYear()}
                    stroke="#f59e0b" strokeDasharray="2 2"
                    label={{ value: t('detail.chartLabelFixation'), fontSize: 9, fill: '#f59e0b' }}
                  />
                )}
                <Line type="monotone" dataKey="balance"      name={t('detail.chartLineBalance')}      stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="cumInterest"  name={t('detail.chartLineCumInterest')}  stroke="#f97316" strokeWidth={2}   dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="cumPrincipal" name={t('detail.chartLineCumPrincipal')} stroke="#22c55e" strokeWidth={2}   dot={false} strokeDasharray="2 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {fixDays !== null && (
            <div className={`rounded-md p-3 text-xs ${fixDays <= 180 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/50'}`}>
              <p className="font-medium">{t('detail.fixationEndLabel', { date: mort.fixationEndDate ?? '' })}</p>
              <p className="text-muted-foreground mt-0.5">
                {fixDays > 0 ? t('detail.fixationDaysLeft', { days: fixDays }) : t('detail.fixationDaysAgo', { days: Math.abs(fixDays) })} — {t('detail.fixationRefinanceNote')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Cashflow + Historie pronájmu ── */}
      {property.isRental && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-base">{t('detail.rentalTitle')}</h2>

          {/* Aktuální cashflow */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">{t('detail.grossRent')}</p>
              <p className="font-bold text-lg">{fmtKcFull(curRentAmt)}<span className="text-xs font-normal text-muted-foreground">{t('detail.perMonth')}</span></p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">{t('detail.afterOccupancy', { pct: curOccPct })}</p>
              <p className="font-bold text-lg">{fmtKcFull(effectiveRent)}</p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">{t('detail.costsAndPayment')}</p>
              <p className="font-bold text-lg text-red-400">{fmtKcFull(curOpex + (amort?.M ?? 0))}</p>
            </div>
            <div className={`rounded-md p-3 border ${cashflow >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-400/10 border-red-400/20'}`}>
              <p className="text-muted-foreground">{t('detail.netCashflow')}</p>
              <p className={`font-bold text-lg ${cashflow >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {cashflow >= 0 ? '+' : ''}{fmtKcFull(cashflow)}
              </p>
            </div>
          </div>
          {curRentAmt > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('detail.grossYieldLabel')} <strong>{grossYield.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</strong>
              {' · '}
              {t('detail.yieldOnCostLabel')} <strong>{yieldOnCost.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</strong>
              {lastRent?.startDate && <span className="ml-2">· {t('detail.conditionsFrom', { date: lastRent.startDate })}</span>}
            </p>
          )}

          {/* Graf vývoje cashflow */}
          {sortedRental.length >= 2 && (() => {
            const nowStr = new Date().toISOString().slice(0, 10)
            const cfPoints = sortedRental.map((r, i) => {
              const net = r.rentMonthly * r.occupancyPct / 100 - r.opexMonthly - (amort?.M ?? 0)
              const endDate = sortedRental[i + 1]?.startDate ?? nowStr
              return { date: r.startDate, cashflow: Math.round(net), endDate }
            })
            return (
              <div>
                <p className="text-xs text-muted-foreground mb-3">{t('detail.cfChartNote')}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={cfPoints} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={50} />
                    <Tooltip
                      formatter={(v: unknown) => [fmtKcFull(Number(v)), t('detail.cfTooltipName')] as [string, string]}
                      contentStyle={{ fontSize: 11 }}
                      labelFormatter={(l) => t('detail.cfTooltipLabel', { date: l })}
                    />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                    <Line type="stepAfter" dataKey="cashflow" name={t('detail.cfLineName')} stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })()}

          {/* Inline form — nový záznam pronájmu */}
          <div className="rounded-md bg-muted/30 border p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">{t('detail.addRentalTitle')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('detail.validFrom')}</label>
                <input type="date" value={newRentDate} onChange={(e) => setNewRentDate(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('detail.rentPerMonth')}</label>
                <input inputMode="numeric" value={newRentAmt} onChange={(e) => setNewRentAmt(e.target.value)}
                  placeholder={t('detail.placeholderRent')}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('detail.occupancyPct')}</label>
                <input inputMode="numeric" value={newRentOcc} onChange={(e) => setNewRentOcc(e.target.value)}
                  placeholder="95"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('detail.costsPerMonth')}</label>
                <input inputMode="numeric" value={newRentOpex} onChange={(e) => setNewRentOpex(e.target.value)}
                  placeholder={t('detail.placeholderCosts')}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-end">
                <button onClick={addRentalRecord}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> {t('detail.addBtn')}
                </button>
              </div>
            </div>
          </div>

          {/* Tabulka záznamu pronájmu */}
          {sortedRental.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 pr-3 font-medium">{t('detail.tableValidFrom')}</th>
                    <th className="text-right py-1.5 pr-3 font-medium">{t('detail.tableRentPerMonth')}</th>
                    <th className="text-right py-1.5 pr-3 font-medium">{t('detail.tableOccupancy')}</th>
                    <th className="text-right py-1.5 pr-3 font-medium">{t('detail.tableCosts')}</th>
                    <th className="text-right py-1.5 pr-3 font-medium">{t('detail.tableNetCF')}</th>
                    <th className="py-1.5 w-14" />
                  </tr>
                </thead>
                <tbody>
                  {[...sortedRental].reverse().map((r) => {
                    const net = r.rentMonthly * r.occupancyPct / 100 - r.opexMonthly - (amort?.M ?? 0)
                    const isEd = editRentId === r.id

                    if (isEd) {
                      return (
                        <tr key={r.id} className="border-b border-border/50 bg-muted/30">
                          <td className="py-1.5 pr-2">
                            <input type="date" value={editRentDate} onChange={(e) => setEditRentDate(e.target.value)}
                              className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input inputMode="numeric" value={editRentAmt} onChange={(e) => setEditRentAmt(e.target.value)}
                              className="w-full rounded border bg-background px-2 py-1 text-xs text-right tabular-nums outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input inputMode="numeric" value={editRentOcc} onChange={(e) => setEditRentOcc(e.target.value)}
                              className="w-28 rounded border bg-background px-2 py-1 text-xs text-right tabular-nums outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input inputMode="numeric" value={editRentOpex} onChange={(e) => setEditRentOpex(e.target.value)}
                              className="w-full rounded border bg-background px-2 py-1 text-xs text-right tabular-nums outline-none focus:ring-1 focus:ring-ring" />
                          </td>
                          <td />
                          <td className="py-1.5">
                            <div className="flex gap-1 justify-end">
                              <button onClick={saveEditRent}
                                className="p-1 rounded hover:bg-green-500/20 text-green-500 transition-colors">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditRentId(null)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-1.5 pr-3 text-muted-foreground">{r.startDate}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{fmtKcFull(r.rentMonthly)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{r.occupancyPct} %</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{fmtKcFull(r.opexMonthly)}</td>
                        <td className={`py-1.5 pr-3 text-right font-semibold tabular-nums ${net >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                          {net >= 0 ? '+' : ''}{fmtKcFull(net)}
                        </td>
                        <td className="py-1.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => startEditRent(r)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteRentalRecord(r.id)}
                              className="p-1 rounded hover:bg-red-400/10 text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Aktualizace hodnoty + Historie ── */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-base">{t('detail.valuationTitle')}</h2>

        {/* Graf ceny v čase */}
        {property.valuationHistory.length >= 2 && (
          <div>
            <p className="text-xs text-muted-foreground mb-3">{t('detail.valuationChartNote')}</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={[...property.valuationHistory].sort((a, b) => a.date.localeCompare(b.date)).map((v) => ({
                  date: v.date,
                  value: v.value,
                }))}
                margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
              >
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)} M` : `${Math.round(v/1_000)}k`}
                  width={65} domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(v: unknown) => [fmtKcFull(Number(v)), t('detail.valuationChartLine')]}
                  contentStyle={{ fontSize: 11 }}
                  labelFormatter={(l) => `Datum: ${l}`}
                />
                <Line type="monotone" dataKey="value" name={t('detail.valuationChartLine')} stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Inline form — nové ocenění */}
        <div className="rounded-md bg-muted/30 border p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t('detail.addValuationTitle')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('detail.valuationDate')}</label>
              <input type="date" value={newValDate} onChange={(e) => setNewValDate(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('detail.valuationValue')}</label>
              <input inputMode="numeric" value={newValValue} onChange={(e) => setNewValValue(e.target.value)}
                placeholder={t('detail.placeholderValuation')}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('detail.valuationNote')}</label>
              <input value={newValNote} onChange={(e) => setNewValNote(e.target.value)}
                placeholder={t('detail.placeholderValuationNote')}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-end">
              <button onClick={addValuation}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-3.5 h-3.5" /> {t('detail.valuationAddBtn')}
              </button>
            </div>
          </div>
        </div>

        {/* Tabulka s edit/delete */}
        {property.valuationHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 pr-3 font-medium">{t('detail.colDate')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium">{t('detail.colValue')}</th>
                  <th className="text-right py-1.5 pr-3 font-medium">{t('detail.colChange')}</th>
                  <th className="text-left py-1.5 pr-3 font-medium">{t('detail.colNote')}</th>
                  <th className="py-1.5 w-14" />
                </tr>
              </thead>
              <tbody>
                {[...property.valuationHistory].reverse().map((v, i, arr) => {
                  const prev   = arr[i + 1]
                  const change = prev ? v.value - prev.value : null
                  const isEdit = editValId === v.id

                  if (isEdit) {
                    return (
                      <tr key={v.id} className="border-b border-border/50 bg-muted/30">
                        <td className="py-1.5 pr-2">
                          <input type="date" value={editValDate} onChange={(e) => setEditValDate(e.target.value)}
                            className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input inputMode="numeric" value={editValValue} onChange={(e) => setEditValValue(e.target.value)}
                            className="w-full rounded border bg-background px-2 py-1 text-xs text-right tabular-nums outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td />
                        <td className="py-1.5 pr-2">
                          <input value={editValNote} onChange={(e) => setEditValNote(e.target.value)}
                            className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
                        </td>
                        <td className="py-1.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={saveEditVal}
                              className="p-1 rounded hover:bg-green-500/20 text-green-500 transition-colors">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditValId(null)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={v.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-1.5 pr-3 text-muted-foreground">{v.date}</td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{fmtKcFull(v.value)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {change !== null
                          ? <span className={change >= 0 ? 'text-green-500' : 'text-red-400'}>
                              {change >= 0 ? '+' : ''}{fmtKcFull(change)}
                            </span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{v.note ?? '—'}</td>
                      <td className="py-1.5">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEditVal(v)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteValuation(v.id)}
                            className="p-1 rounded hover:bg-red-400/10 text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Analýza vlastního bydlení ── */}
      {property.purpose === 'own' && property.estimatedRent != null && property.estimatedRent > 0 && (() => {
        const g = (property.rentIncreaseRate ?? 4) / 100
        const M = amort?.M ?? 0
        const termYears = mort?.termYears ?? 30
        const purchaseYear = new Date(property.purchaseDate).getFullYear()
        const now = new Date()
        const nowYearFrac = now.getFullYear() + now.getMonth() / 12
        const r0 = property.estimatedRent

        // Yearly data points: 0 → termYears
        const points = Array.from({ length: termYears + 1 }, (_, y) => {
          const cumRent = g === 0
            ? r0 * 12 * y
            : r0 * 12 * (Math.pow(1 + g, y) - 1) / g
          const cumOwn = property.purchaseCosts + M * 12 * y
          return {
            year: purchaseYear + y,
            cumulativeRent: Math.round(cumRent),
            cumulativeOwn:  Math.round(cumOwn),
          }
        })

        // Break-even: first year where cumRent > cumOwn
        const breakEvenYear = points.find((p) => p.cumulativeRent > p.cumulativeOwn)?.year ?? null

        // Current stats (interpolated)
        const yearsElapsed = nowYearFrac - purchaseYear
        const cumRentNow = yearsElapsed <= 0 ? 0
          : g === 0 ? r0 * 12 * yearsElapsed
          : r0 * 12 * (Math.pow(1 + g, yearsElapsed) - 1) / g
        const cumOwnNow  = property.purchaseCosts + M * 12 * yearsElapsed
        const diff       = cumRentNow - cumOwnNow

        // Current monthly rent (grown since purchase)
        const currentRentMonthly = Math.round(r0 * Math.pow(1 + g, Math.max(0, yearsElapsed)))

        return (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-base">{t('detail.ownAnalysisTitle')}</h2>
              <span className="text-xs text-muted-foreground">{t('detail.ownAnalysisHint')}</span>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-muted-foreground">{t('detail.ownStatsPaidOwn')}</p>
                <p className="font-bold text-base mt-0.5">{fmtKc(cumOwnNow)}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-muted-foreground">{t('detail.ownStatsPaidRent')}</p>
                <p className="font-bold text-base mt-0.5">{fmtKc(cumRentNow)}</p>
              </div>
              <div className={`rounded-md p-3 border ${diff >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-400/10 border-red-400/20'}`}>
                <p className="text-muted-foreground">{diff >= 0 ? t('detail.ownStatsSaving') : t('detail.ownStatsOverpay')}</p>
                <p className={`font-bold text-base mt-0.5 ${diff >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {diff >= 0 ? '+' : ''}{fmtKc(diff)}
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-muted-foreground">{t('detail.ownStatsCurrentRent')}</p>
                <p className="font-bold text-base mt-0.5">{fmtKcFull(currentRentMonthly)}<span className="text-muted-foreground font-normal">/měs</span></p>
                {breakEvenYear && <p className="text-[10px] text-muted-foreground mt-0.5">{t('detail.ownBreakEven', { year: breakEvenYear })}</p>}
              </div>
            </div>

            {/* Graf */}
            <div>
              <p className="text-xs text-muted-foreground mb-3">{t('detail.ownChartNote', { rate: property.rentIncreaseRate ?? 4 })}</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} interval={Math.ceil(termYears / 8)} />
                  <YAxis tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : `${Math.round(v / 1_000)}k`}
                    width={60} />
                  <Tooltip
                    formatter={(v: unknown, name: string) => [fmtKcFull(Number(v)), name] as [string, string]}
                    contentStyle={{ fontSize: 11 }}
                    labelFormatter={(l) => `${l}`}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <ReferenceLine x={Math.round(nowYearFrac)} stroke="#6b7280" strokeDasharray="3 3"
                    label={{ value: t('detail.chartLabelToday'), fontSize: 10, fill: '#6b7280' }} />
                  {breakEvenYear && (
                    <ReferenceLine x={breakEvenYear} stroke="#22c55e" strokeDasharray="4 4"
                      label={{ value: t('detail.ownBreakEvenLabel'), fontSize: 10, fill: '#22c55e', position: 'top' }} />
                  )}
                  <Line type="monotone" dataKey="cumulativeRent" name={t('detail.ownLineRent')} stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cumulativeOwn"  name={t('detail.ownLineOwn')}  stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* Poznámky */}
      {property.notes && (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold text-base mb-2">{t('detail.sectionNotes')}</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.notes}</p>
        </div>
      )}
    </div>
  )
}
