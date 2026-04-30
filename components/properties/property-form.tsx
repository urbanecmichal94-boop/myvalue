'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { generateId } from '@/lib/storage'
import { saveProperty } from '@/lib/db/properties'
import { PROPERTY_TYPE_OPTIONS, PROPERTY_PURPOSE_LABELS, type Property, type PropertyType, type PropertyPurpose, type RentalRecord } from '@/types/property'

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {note && <span className="text-[10px] text-muted-foreground italic">{note}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring'
const selectCls = inputCls

// ── Hlavní komponenta ─────────────────────────────────────────────────────────

interface Props {
  initialData?: Property
  onCancel?: () => void
}

export function PropertyForm({ initialData, onCancel }: Props) {
  const router = useRouter()
  const t = useTranslations('properties')
  const isEdit = !!initialData

  // Základní informace
  const [name,         setName]         = useState(initialData?.name         ?? '')
  const [type,         setType]         = useState<PropertyType>(initialData?.type ?? 'byt')
  const [address,      setAddress]      = useState(initialData?.address      ?? '')
  const [purchaseDate, setPurchaseDate] = useState(initialData?.purchaseDate ?? today())
  const [notes,        setNotes]        = useState(initialData?.notes        ?? '')

  // Hodnota
  const [purchasePrice, setPurchasePrice] = useState(String(initialData?.purchasePrice ?? ''))
  const [purchaseCosts, setPurchaseCosts] = useState(String(initialData?.purchaseCosts ?? ''))
  const [currentValue,  setCurrentValue]  = useState(String(initialData?.currentValue  ?? ''))
  const [lastValuedAt,  setLastValuedAt]  = useState(initialData?.lastValuedAt ?? today())

  // Hypotéka
  const [hasMortgage,           setHasMortgage]           = useState(!!initialData?.mortgage)
  const [mortPrincipal,         setMortPrincipal]         = useState(String(initialData?.mortgage?.principal    ?? ''))
  const [mortRate,              setMortRate]              = useState(String(initialData?.mortgage?.interestRate ?? '4'))
  const [mortStartDate,         setMortStartDate]         = useState(initialData?.mortgage?.startDate             ?? today())
  const [mortTermYears,         setMortTermYears]         = useState(String(initialData?.mortgage?.termYears      ?? '30'))
  const [mortDrawdownStart,     setMortDrawdownStart]     = useState(initialData?.mortgage?.drawdownStartDate    ?? '')
  const [mortDrawdownComplete,  setMortDrawdownComplete]  = useState(initialData?.mortgage?.drawdownCompleteDate ?? '')
  const [mortFixationEnd,       setMortFixationEnd]       = useState(initialData?.mortgage?.fixationEndDate      ?? '')

  // Účel nemovitosti
  const [purpose, setPurpose] = useState<PropertyPurpose>(initialData?.purpose ?? 'rental')

  // Vlastní bydlení
  const [estimatedRent,    setEstimatedRent]    = useState(String(initialData?.estimatedRent    ?? ''))
  const [rentIncreaseRate, setRentIncreaseRate] = useState(String(initialData?.rentIncreaseRate ?? '4'))

  // Pronájem — první/aktuální záznam (při editaci z posledního záznamu)
  const lastRental = initialData?.rentalHistory?.[initialData.rentalHistory.length - 1]
  const [rentMonthly,   setRentMonthly]   = useState(String(lastRental?.rentMonthly  ?? initialData?.rentMonthly  ?? ''))
  const [occupancyPct,  setOccupancyPct]  = useState(String(lastRental?.occupancyPct ?? initialData?.occupancyPct ?? '95'))
  const [opexMonthly,   setOpexMonthly]   = useState(String(lastRental?.opexMonthly  ?? initialData?.opexMonthly  ?? ''))
  const [rentalStartDate, setRentalStartDate] = useState(lastRental?.startDate ?? purchaseDate)

  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  function parseNum(s: string): number { return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0 }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t('form.errorName')); return }
    if (!purchasePrice || parseNum(purchasePrice) <= 0) { setError(t('form.errorPurchasePrice')); return }
    if (!currentValue  || parseNum(currentValue)  <= 0) { setError(t('form.errorCurrentValue')); return }
    if (hasMortgage && (!mortPrincipal || parseNum(mortPrincipal) <= 0)) {
      setError(t('form.errorMortgage')); return
    }

    const now = new Date().toISOString()
    const property: Property = {
      id:           initialData?.id ?? generateId(),
      name:         name.trim(),
      type,
      address:      address.trim() || undefined,
      purchaseDate,
      purchasePrice: parseNum(purchasePrice),
      purchaseCosts: parseNum(purchaseCosts),
      currentValue:  parseNum(currentValue),
      lastValuedAt,
      mortgage: hasMortgage ? {
        principal:             parseNum(mortPrincipal),
        interestRate:          parseNum(mortRate),
        startDate:             mortStartDate,
        termYears:             parseInt(mortTermYears) || 30,
        drawdownStartDate:     mortDrawdownStart    || undefined,
        drawdownCompleteDate:  mortDrawdownComplete || undefined,
        fixationEndDate:       mortFixationEnd      || undefined,
      } : undefined,
      purpose,
      isRental: purpose === 'rental',
      estimatedRent:    purpose === 'own' && estimatedRent ? parseNum(estimatedRent) : undefined,
      rentIncreaseRate: purpose === 'own' ? (parseNum(rentIncreaseRate) || 4) : undefined,
      rentalHistory: purpose === 'rental' ? (() => {
        // Při editaci: aktualizuj nebo přidej záznam pouze pokud se hodnoty změnily
        const existing = initialData?.rentalHistory ?? []
        const newRecord: RentalRecord = {
          id:           lastRental?.id ?? generateId(),
          startDate:    rentalStartDate,
          rentMonthly:  parseNum(rentMonthly),
          occupancyPct: parseNum(occupancyPct),
          opexMonthly:  parseNum(opexMonthly),
        }
        if (lastRental) {
          // Aktualizuj poslední záznam
          return [...existing.slice(0, -1), newRecord].sort((a, b) => a.startDate.localeCompare(b.startDate))
        }
        return [newRecord]
      })() : [],

      valuationHistory: initialData?.valuationHistory ?? [],
      notes: notes.trim() || undefined,
      createdAt: initialData?.createdAt ?? now,
      updatedAt: now,
    }

    setSaving(true)
    saveProperty(property).catch(console.error)
    router.push(`/properties/${property.id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Levý sloupec ── */}
        <div className="space-y-5">

          {/* Základní informace */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-base">{t('form.sectionBasic')}</h3>

            <Field label={t('form.nameRequired')}>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('form.namePlaceholderSimple')} required />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.type')}>
                <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
                  {PROPERTY_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('form.purchaseDate')}>
                <input type="date" className={inputCls} value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>
            </div>

            <Field label={t('form.address')}>
              <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder={t('form.addressPlaceholder')} />
            </Field>

            <Field label={t('form.notes')}>
              <textarea className={inputCls} rows={2} value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('form.notesFreeText')} />
            </Field>
          </div>

          {/* Hodnota */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-base">{t('form.sectionValue')}</h3>

            <Field label={t('form.purchasePriceRequired')} note={t('form.notesCzk')}>
              <input className={inputCls} inputMode="numeric" value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)} placeholder={t('form.purchasePricePlaceholder')} />
            </Field>

            <Field label={t('form.purchaseCosts')} note={t('form.purchaseCostsNote')}>
              <input className={inputCls} inputMode="numeric" value={purchaseCosts}
                onChange={(e) => setPurchaseCosts(e.target.value)} placeholder={t('form.purchaseCostsPlaceholder')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.currentValueRequired')} note={t('form.notesCzk')}>
                <input className={inputCls} inputMode="numeric" value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)} placeholder={t('form.currentValuePlaceholder')} />
              </Field>
              <Field label={t('form.valuationDate')}>
                <input type="date" className={inputCls} value={lastValuedAt}
                  onChange={(e) => setLastValuedAt(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* ── Pravý sloupec ── */}
        <div className="space-y-5">

          {/* Hypotéka */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="hasMortgage" checked={hasMortgage}
                onChange={(e) => setHasMortgage(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer" />
              <label htmlFor="hasMortgage" className="font-semibold text-base cursor-pointer select-none">
                {t('form.hasMortgage')}
              </label>
            </div>

            {hasMortgage && (
              <div className="space-y-3">
                <Field label={t('form.mortgagePrincipalRequired')} note={t('form.notesCzk')}>
                  <input className={inputCls} inputMode="numeric" value={mortPrincipal}
                    onChange={(e) => setMortPrincipal(e.target.value)} placeholder={t('form.mortgagePrincipalPlaceholder')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('form.mortgageRate')} note={t('form.notesPa')}>
                    <input className={inputCls} inputMode="decimal" value={mortRate}
                      onChange={(e) => setMortRate(e.target.value)} placeholder={t('form.mortgageRatePlaceholder')} />
                  </Field>
                  <Field label={t('form.mortgageTerm')} note={t('form.notesYears')}>
                    <input className={inputCls} inputMode="numeric" value={mortTermYears}
                      onChange={(e) => setMortTermYears(e.target.value)} placeholder={t('form.mortgageTermPlaceholder')} />
                  </Field>
                </div>
                <Field label={t('form.mortgageStart')}>
                  <input type="date" className={inputCls} value={mortStartDate}
                    onChange={(e) => setMortStartDate(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('form.drawdownStart')} note={t('form.notesDrawdownStart')}>
                    <input type="date" className={inputCls} value={mortDrawdownStart}
                      onChange={(e) => setMortDrawdownStart(e.target.value)} />
                  </Field>
                  <Field label={t('form.drawdownCompleteDate')} note={t('form.notesDrawdownComplete')}>
                    <input type="date" className={inputCls} value={mortDrawdownComplete}
                      onChange={(e) => setMortDrawdownComplete(e.target.value)} />
                  </Field>
                </div>
                <Field label={t('form.fixationEndDate')}>
                  <input type="date" className={inputCls} value={mortFixationEnd}
                    onChange={(e) => setMortFixationEnd(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {/* Účel nemovitosti */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-base">{t('form.purposeLabel')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PROPERTY_PURPOSE_LABELS) as [PropertyPurpose, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPurpose(val)}
                  className={`rounded-md border px-3 py-2.5 text-sm font-medium text-left transition-colors ${purpose === val ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Vlastní bydlení — porovnání s nájmem */}
            {purpose === 'own' && (
              <div className="space-y-3 pt-1 border-t">
                <p className="text-xs text-muted-foreground pt-2">{t('form.ownHomePurposeHint')}</p>
                <Field label={t('form.estimatedRent')} note={t('form.notesCzkMes')}>
                  <input className={inputCls} inputMode="numeric" value={estimatedRent}
                    onChange={(e) => setEstimatedRent(e.target.value)}
                    placeholder={t('form.estimatedRentPlaceholder')} />
                </Field>
                <Field label={t('form.rentIncreaseRate')} note={t('form.notesPercent')}>
                  <input className={inputCls} inputMode="decimal" value={rentIncreaseRate}
                    onChange={(e) => setRentIncreaseRate(e.target.value)} placeholder="4" />
                </Field>
              </div>
            )}

            {/* Investiční — pronájem */}
            {purpose === 'rental' && (
              <div className="space-y-3 pt-1 border-t">
                <Field label={t('form.rentalValidFrom')}>
                  <input type="date" className={inputCls} value={rentalStartDate}
                    onChange={(e) => setRentalStartDate(e.target.value)} />
                </Field>
                <Field label={t('form.rentGross')} note={t('form.notesCzkMes')}>
                  <input className={inputCls} inputMode="numeric" value={rentMonthly}
                    onChange={(e) => setRentMonthly(e.target.value)} placeholder={t('form.rentMonthlyPlaceholder')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('form.rentalOccupancy')} note={t('form.notesPercent')}>
                    <input className={inputCls} inputMode="numeric" value={occupancyPct}
                      onChange={(e) => setOccupancyPct(e.target.value)} placeholder={t('form.occupancyPctPlaceholder')} />
                  </Field>
                  <Field label={t('form.rentalOpex')} note={t('form.notesCzkMes')}>
                    <input className={inputCls} inputMode="numeric" value={opexMonthly}
                      onChange={(e) => setOpexMonthly(e.target.value)} placeholder={t('form.opexPlaceholder')} />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <button type="button"
          onClick={onCancel ?? (() => router.back())}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
          {t('form.cancel')}
        </button>
        <button type="submit" disabled={saving}
          className="rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
          {saving && (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {saving ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.addProperty')}
        </button>
      </div>
    </form>
  )
}
