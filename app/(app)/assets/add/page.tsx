'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Search, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getAssets, saveAsset, saveTransaction, generateId } from '@/lib/storage'
import { useSections } from '@/lib/context/sections-context'
import {
  CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  TEMPLATE_COLORS,
  TEMPLATE_LABELS,
  TEMPLATE_IS_AUTO,
  TEMPLATE_ASSET_TYPE,
  TEMPLATE_SEARCH_TYPE,
  type Currency,
  type TransactionType,
  type CommodityUnit,
  type SectionTemplate,
} from '@/types'
import type { SearchResult } from '@/app/api/search/route'

type Step = 'section' | 'details' | 'transaction'

function AddAssetPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sections } = useSections()

  // Pokud přicházíme z konkrétní sekce, přeskočíme výběr sekce
  const preselectedSectionId = searchParams.get('section')
  const preselectedSection = sections.find((s) => s.id === preselectedSectionId) ?? null

  const [step, setStep] = useState<Step>(preselectedSection ? 'details' : 'section')
  const t = useTranslations('addAsset')
  const tCommon = useTranslations('common')
  const tEnum = useTranslations('enums')
  const [selectedSectionId, setSelectedSectionId] = useState<string>(preselectedSectionId ?? '')

  const currentSection = sections.find((s) => s.id === selectedSectionId) ?? null
  const isAuto = currentSection ? TEMPLATE_IS_AUTO[currentSection.template] : false
  const searchType = currentSection ? TEMPLATE_SEARCH_TYPE[currentSection.template] : undefined

  // Krok 2 — Detaily aktiva
  const [assetName, setAssetName] = useState('')
  const [ticker, setTicker] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [commodityUnit, setCommodityUnit] = useState<CommodityUnit>('g')
  const [commodityForm, setCommodityForm] = useState<'physical' | 'etf' | 'futures'>('physical')
  const [existingAssetId, setExistingAssetId] = useState<string | null>(null)
  const [currentPriceUsd, setCurrentPriceUsd] = useState<number | null>(null)
  const [currentPriceLoading, setCurrentPriceLoading] = useState(false)
  const [typeMismatch, setTypeMismatch] = useState(false)

  // Krok 3 — První transakce
  const [txType, setTxType] = useState<TransactionType>('buy')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txQuantity, setTxQuantity] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [priceMode, setPriceMode] = useState<'per_unit' | 'total'>('per_unit')
  const [txCurrency, setTxCurrency] = useState<Currency>('CZK')
  const [txNotes, setTxNotes] = useState('')

  const txTypes: TransactionType[] = isAuto ? ['buy', 'sell', 'dividend'] : ['update', 'buy', 'dividend']

  // ── Vyhledávání aktiv ────────────────────────────────────────────────────
  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${searchType ?? 'stock'}`)
      const data = await res.json() as { results: SearchResult[] }
      setSearchResults(data.results)
    } catch {
      toast.error(t('searchFailed'))
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleSelectResult(result: SearchResult) {
    setSelectedResult(result)
    setAssetName(result.name)
    setTicker(result.ticker)
    setSearchResults([])
    setSearchQuery(result.name)
    setCurrentPriceUsd(null)
    setTypeMismatch(false)

    // Zjistit jestli typ výsledku odpovídá šabloně sekce
    if (currentSection) {
      const expectedSearchType = TEMPLATE_SEARCH_TYPE[currentSection.template]
      if (expectedSearchType && result.type && result.type !== expectedSearchType) {
        setTypeMismatch(true)
      }
    }

    // Zjistit jestli toto aktivum již existuje (dle tickeru) v téže sekci
    const existing = getAssets(selectedSectionId).find((a) => a.ticker === result.ticker)
    setExistingAssetId(existing?.id ?? null)

    // Načíst aktuální cenu z API
    setCurrentPriceLoading(true)
    try {
      const type = result.type === 'crypto' ? 'crypto'
        : result.type === 'commodity' ? 'commodity'
        : 'stock'
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(result.ticker)}&type=${type}`)
      const data = await res.json() as { prices: Record<string, number> }
      setCurrentPriceUsd(data.prices[result.ticker] ?? null)
    } catch {
      // cena se nenačetla, nevadí
    } finally {
      setCurrentPriceLoading(false)
    }
  }

  // ── Uložení ──────────────────────────────────────────────────────────────
  function handleSave() {
    if (!currentSection || !selectedSectionId) return
    if (!assetName.trim()) { toast.error(t('enterName')); return }
    if (!txPrice || isNaN(Number(txPrice))) { toast.error(t('invalidPrice')); return }
    if (txType !== 'update' && txType !== 'dividend' && (!txQuantity || isNaN(Number(txQuantity)))) {
      toast.error(t('invalidQuantity'))
      return
    }

    const qty = Number(txQuantity)
    const rawPrice = Number(txPrice)
    const pricePerUnit = (priceMode === 'total' && qty > 0) ? rawPrice / qty : rawPrice

    const assetType = TEMPLATE_ASSET_TYPE[currentSection.template]
    const assetId = existingAssetId ?? generateId()

    if (!existingAssetId) {
      saveAsset({
        id: assetId,
        section_id: selectedSectionId,
        type: assetType,
        name: assetName.trim(),
        ticker: isAuto ? ticker || undefined : undefined,
        currency: txCurrency,
        commodity_unit: currentSection.template === 'commodity' ? commodityUnit : undefined,
        commodity_form: currentSection.template === 'commodity' ? commodityForm : undefined,
        created_at: new Date().toISOString(),
      })
    }

    saveTransaction({
      id: generateId(),
      asset_id: assetId,
      date: txDate,
      type: txType,
      quantity: txType === 'update' || txType === 'dividend' ? 1 : qty,
      price: txType === 'update' || txType === 'dividend' ? rawPrice : pricePerUnit,
      currency: txCurrency,
      notes: txNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    })

    toast.success(existingAssetId ? t('transactionAdded', { name: assetName }) : t('assetAdded', { name: assetName }))
    router.push(`/sections/${selectedSectionId}`)
  }

  const quantityLabel = currentSection?.template === 'commodity'
    ? (commodityUnit === 'g' ? t('quantityGrams') : t('quantityOz'))
    : t('quantityPcs')

  // ── Render ───────────────────────────────────────────────────────────────
  const steps: Step[] = preselectedSection ? ['details', 'transaction'] : ['section', 'details', 'transaction']
  const stepLabels: Record<Step, string> = { section: t('stepSection'), details: t('stepAsset'), transaction: t('stepTransaction') }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

      {/* Krokovník */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${step === s ? 'bg-primary text-primary-foreground' :
                steps.indexOf(step) > i
                  ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {i + 1}
            </span>
            <span className={step === s ? 'font-medium' : 'text-muted-foreground'}>
              {stepLabels[s]}
            </span>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">

          {/* ── Krok: Výběr sekce ─────────────────────────────────────── */}
          {step === 'section' && (
            <>
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-base">{t('selectSection')}</CardTitle>
              </CardHeader>

              {sections.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-muted-foreground text-sm">{t('noSections')}</p>
                  <p className="text-muted-foreground text-sm">{t('createSection')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setSelectedSectionId(section.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-md border text-sm font-medium text-left transition-colors
                        ${selectedSectionId === section.id ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: TEMPLATE_COLORS[section.template] }}
                      />
                      <div>
                        <p>{section.name}</p>
                        <p className="text-xs text-muted-foreground font-normal">{tEnum(`templates.${section.template}`)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                disabled={!selectedSectionId}
                onClick={() => setStep('details')}
              >
                {t('continue')} <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          {/* ── Krok: Detaily aktiva ──────────────────────────────────── */}
          {step === 'details' && currentSection && (
            <>
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {isAuto ? t('searchAsset') : t('assetName')}
                  <Badge variant="secondary" className="text-xs font-normal">
                    {currentSection.name}
                  </Badge>
                </CardTitle>
              </CardHeader>

              {isAuto ? (
                <div className="space-y-3">
                  <Label>{t('searchLabel')}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder={
                        searchType === 'crypto' ? t('searchPlaceholderCrypto') :
                        searchType === 'commodity' ? t('searchPlaceholderCommodity') :
                        t('searchPlaceholderStock')
                      }
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                    />
                  </div>
                  {searchLoading && <p className="text-sm text-muted-foreground">{t('searching')}</p>}
                  {searchResults.length > 0 && (
                    <div className="border rounded-md divide-y">
                      {searchResults.map((r) => (
                        <button
                          key={r.ticker}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                          onClick={() => handleSelectResult(r)}
                        >
                          <span>{r.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{r.ticker}</Badge>
                            {r.exchange && <span className="text-xs text-muted-foreground">{r.exchange}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedResult && (
                    <div className={`rounded-md p-3 text-sm ${existingAssetId ? 'bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' : 'bg-muted'}`}>
                      <p className="font-medium">{selectedResult.name}</p>
                      <p className="text-muted-foreground">
                        {selectedResult.ticker}{selectedResult.exchange ? ` · ${selectedResult.exchange}` : ''}
                      </p>
                      {currentPriceLoading && (
                        <p className="mt-1 text-xs text-muted-foreground">{t('loadingPrice')}</p>
                      )}
                      {!currentPriceLoading && currentPriceUsd !== null && (
                        <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                          {t('currentPrice', { price: currentPriceUsd.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) })}
                        </p>
                      )}
                      {existingAssetId && (
                        <p className="mt-1 text-blue-700 dark:text-blue-400 text-xs font-medium">
                          ✓ {t('alreadyInSection')}
                        </p>
                      )}
                      {typeMismatch && (
                        <div className="mt-1 flex items-center gap-1 text-yellow-700 dark:text-yellow-400 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {t('typeMismatch')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Volba jednotky pro komodity */}
                  {currentSection.template === 'commodity' && selectedResult && (
                    <div className="space-y-2">
                      <Label>{t('quantityUnit')}</Label>
                      <div className="flex gap-2">
                        {(['g', 'oz'] as CommodityUnit[]).map((unit) => (
                          <button
                            key={unit}
                            onClick={() => setCommodityUnit(unit)}
                            className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors
                              ${commodityUnit === unit ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                          >
                            {unit === 'g' ? t('grams') : t('troyOz')}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{t('troyOzInfo')}</p>
                    </div>
                  )}

                  {/* Forma držení komodity — ovlivňuje daňový test */}
                  {currentSection.template === 'commodity' && selectedResult && (
                    <div className="space-y-2">
                      <Label>{t('commodityForm')}</Label>
                      <div className="flex gap-2 flex-wrap">
                        {(['physical', 'etf', 'futures'] as const).map((form) => (
                          <button
                            key={form}
                            onClick={() => setCommodityForm(form)}
                            className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors
                              ${commodityForm === form ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                          >
                            {t(`commodityForm_${form}`)}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{t('commodityFormInfo')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="name">{tCommon('name')}</Label>
                  <Input
                    id="name"
                    placeholder={t('namePlaceholder')}
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-2">
                {!preselectedSection && (
                  <Button variant="outline" onClick={() => setStep('section')}>
                    <ChevronLeft className="mr-2 h-4 w-4" /> {t('back')}
                  </Button>
                )}
                <Button
                  className="flex-1"
                  disabled={isAuto ? !selectedResult : !assetName.trim()}
                  onClick={() => {
                    if (isAuto && currentPriceUsd !== null && txType === 'buy') {
                      setTxPrice(currentPriceUsd.toString())
                      setTxCurrency('USD')
                      setPriceMode('per_unit')
                    }
                    setStep('transaction')
                  }}
                >
                  {t('continue')} <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* ── Krok: Transakce ──────────────────────────────────────── */}
          {step === 'transaction' && (
            <>
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-base">
                  {t('firstTransaction')}
                  <Badge variant="secondary" className="ml-2 text-xs font-normal">{assetName}</Badge>
                </CardTitle>
              </CardHeader>

              {/* Typ transakce */}
              <div className="space-y-2">
                <Label>{t('transactionType')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {txTypes.map((txT) => (
                    <button
                      key={txT}
                      onClick={() => setTxType(txT)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                        ${txType === txT ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      {tEnum(`transactionTypes.${txT}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Datum */}
              <div className="space-y-2">
                <Label htmlFor="date">{tCommon('date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>

              {/* Množství */}
              {txType !== 'update' && txType !== 'dividend' && (
                <div className="space-y-2">
                  <Label htmlFor="qty">{quantityLabel}</Label>
                  <Input
                    id="qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={txQuantity}
                    onChange={(e) => setTxQuantity(e.target.value)}
                  />
                </div>
              )}

              {/* Přepínač způsobu zadání ceny (jen pro buy/sell u auto aktiv) */}
              {isAuto && (txType === 'buy' || txType === 'sell') && (
                <div className="space-y-2">
                  <Label>{t('priceMode')}</Label>
                  <div className="flex gap-2">
                    {(['per_unit', 'total'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setPriceMode(mode)}
                        className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                          ${priceMode === mode ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                      >
                        {mode === 'per_unit' ? t('pricePerUnit') : t('totalPrice')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cena + měna */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">
                    {txType === 'update' ? t('currentValue') :
                     txType === 'dividend' ? t('dividendAmount') :
                     priceMode === 'total' ? t('totalPrice') : t('pricePerUnit')}
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={txPrice}
                    onChange={(e) => setTxPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tCommon('currency')}</Label>
                  <Select value={txCurrency} onValueChange={(v) => setTxCurrency(v as Currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Náhled výpočtu */}
              {(txType === 'buy' || txType === 'sell') && txQuantity && txPrice && Number(txQuantity) > 0 && Number(txPrice) > 0 && (
                <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                  {priceMode === 'per_unit' ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('totalLabel')}</span>
                      <span className="font-medium">
                        {(Number(txQuantity) * Number(txPrice)).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {txCurrency}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('pricePerUnitLabel')}</span>
                        <span className="font-medium">
                          {(Number(txPrice) / Number(txQuantity)).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {txCurrency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('totalLabel')}</span>
                        <span className="font-medium">{Number(txPrice).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {txCurrency}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Poznámka */}
              <div className="space-y-2">
                <Label htmlFor="notes">{tCommon('notes')}</Label>
                <Textarea
                  id="notes"
                  placeholder={t('notesPlaceholder')}
                  rows={2}
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('details')}>
                  <ChevronLeft className="mr-2 h-4 w-4" /> {t('back')}
                </Button>
                <Button className="flex-1" onClick={handleSave}>
                  {t('saveAsset')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AddAssetPage() {
  return (
    <Suspense>
      <AddAssetPageInner />
    </Suspense>
  )
}
