'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { ChevronLeft, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw, Download, Pencil, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/lib/context/settings-context'
import { useSections } from '@/lib/context/sections-context'
import {
  getPriceCache,
  savePriceCache,
  getCurrencyCache,
  saveCurrencyCache,
  isPriceCacheValid,
  isCurrencyCacheValid,
  getPriceHistory,
  savePriceHistory,
  getCurrencyRateHistory,
  saveCurrencyRateHistory,
  isCurrencyRateHistoryValid,
  type CurrencyCache,
  type CurrencyRateHistory,
  type PriceCacheEntry,
} from '@/lib/storage'
import { getAssets, saveAsset, deleteAsset } from '@/lib/db/assets'
import { getTransactions } from '@/lib/db/transactions'
import { calculateAssetValue, priceToUsd } from '@/lib/calculations'
import {
  AUTO_ASSET_TYPES,
  TEMPLATE_COLORS,
  TEMPLATE_LABELS,
  TEMPLATE_IS_AUTO,
  type AssetWithValue,
  type SectionTemplate,
} from '@/types'
import { formatCurrency } from '@/lib/format'
import { transactionsToCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { AssetTable } from '@/components/assets/asset-table'
import { PerformanceTable } from '@/components/performance/performance-table'
import { DividendTable } from '@/components/dividends/dividend-table'
import { TaxOverview } from '@/components/taxes/tax-overview'
import { CashSection } from '@/components/cash/cash-section'

const TEMPLATE_TO_HISTORY_TYPE: Partial<Record<SectionTemplate, string>> = {
  stocks:    'stock',
  crypto:    'crypto',
  commodity: 'commodity',
}

const SECTION_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#ef4444', '#f97316', '#f59e0b',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#6b7280', '#1f2937',
]

export default function SectionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { settings } = useSettings()
  const { sections, removeSection, saveSection } = useSections()
  const t = useTranslations('sections')
  const tCommon = useTranslations('common')
  const tEnum = useTranslations('enums')

  const section = sections.find((s) => s.id === id)

  const [assetsWithValues, setAssetsWithValues] = useState<AssetWithValue[]>([])
  const [rates, setRates] = useState<CurrencyCache | null>(null)
  const [return12mPct, setReturn12mPct] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'assets' | 'performance' | 'dividends' | 'taxes'>('assets')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const [firstPurchaseMonth, setFirstPurchaseMonth] = useState<string | undefined>(undefined)

  const loadData = useCallback(async (forceRefresh = false) => {
    // ── Kurzy měn — načíst vždy (potřebuje i cash sekce) ─────────────────
    let rates: CurrencyCache
    const cachedRates = getCurrencyCache()
    if (cachedRates && isCurrencyCacheValid(cachedRates) && !forceRefresh) {
      rates = cachedRates
    } else {
      try {
        const res = await fetch('/api/currencies')
        const data = await res.json()
        rates = { eurCzk: data.eurCzk, eurUsd: data.eurUsd, rates: data.rates ?? {}, updatedAt: new Date().toISOString() }
        saveCurrencyCache(rates)
      } catch {
        rates = cachedRates ?? { eurCzk: 25.0, eurUsd: 1.08, rates: {}, updatedAt: new Date().toISOString() }
      }
    }
    setRates(rates)

    const assets = await getAssets(id)
    if (assets.length === 0) {
      setAssetsWithValues([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    // ── Historické kurzy měn (pro cost basis) ─────────────────────────────
    let rateHistory: CurrencyRateHistory | null = null
    const cachedRateHistory = getCurrencyRateHistory()
    if (cachedRateHistory && isCurrencyRateHistoryValid(cachedRateHistory) && !forceRefresh) {
      rateHistory = cachedRateHistory
    } else {
      try {
        const allTxs = await getTransactions()
        if (allTxs.length > 0) {
          const earliest = allTxs.reduce((min, tx) => tx.date < min ? tx.date : min, allTxs[0].date)
          const fromDate = earliest.slice(0, 7) + '-01'
          const res = await fetch(`/api/currencies/history?from=${fromDate}`)
          const data = await res.json() as { months?: Record<string, Record<string, number>> }
          if (data.months) {
            rateHistory = { months: data.months, updatedAt: new Date().toISOString() }
            saveCurrencyRateHistory(rateHistory)
          }
        }
      } catch {
        rateHistory = cachedRateHistory
      }
    }

    // ── Ceny automatických aktiv ──────────────────────────────────────────
    const priceCache = getPriceCache()
    const autoAssets = assets.filter((a) => AUTO_ASSET_TYPES.includes(a.type))

    const toFetch: Record<string, string[]> = { stock: [], crypto: [], commodity: [] }
    for (const asset of autoAssets) {
      if (!asset.ticker) continue
      const cached = priceCache[asset.ticker]
      if (!cached || !isPriceCacheValid(cached) || forceRefresh) {
        const group = asset.type === 'etf' ? 'stock' : asset.type
        if (group in toFetch) toFetch[group].push(asset.ticker)
      }
    }

    const newPriceCache = { ...priceCache }
    for (const [type, tickers] of Object.entries(toFetch)) {
      if (tickers.length === 0) continue
      try {
        const res = await fetch(`/api/prices?tickers=${tickers.join(',')}&type=${type}`)
        const data = await res.json() as {
          prices: Record<string, number>
          dailyChanges?: Record<string, number>
          currencies?: Record<string, string>
        }
        for (const [ticker, price] of Object.entries(data.prices)) {
          const currency = data.currencies?.[ticker] ?? 'USD'
          const priceUsd = priceToUsd(price, currency, rates)
          newPriceCache[ticker] = {
            ticker,
            priceUsd,
            priceLocal: price,
            priceCurrency: currency,
            dailyChangePct: data.dailyChanges?.[ticker] ?? undefined,
            updatedAt: new Date().toISOString(),
          }
        }
      } catch {
        toast.warning(t('priceLoadFailed', { type }))
      }
    }
    savePriceCache(newPriceCache)

    // ── Uložit cenovou historii (aktuální měsíc) pro 12M výnos ───────────
    const currentMonth = new Date().toISOString().slice(0, 7)
    const history = getPriceHistory()
    let historyChanged = false
    for (const [ticker, entry] of Object.entries(newPriceCache)) {
      if (!entry.priceLocal || !entry.priceCurrency) continue
      const existing = history[ticker]
      if (!existing || existing.months[currentMonth] === undefined) {
        history[ticker] = {
          currency: entry.priceCurrency,
          months: { ...(existing?.months ?? {}), [currentMonth]: entry.priceLocal },
          updatedAt: new Date().toISOString(),
        }
        historyChanged = true
      }
    }
    if (historyChanged) savePriceHistory(history)

    // ── Spočítat hodnoty ──────────────────────────────────────────────────
    const allTxsForCalc = await getTransactions()

    // Nejstarší datum nákupu v této sekci
    const sectionAssetIds = new Set(assets.map((a) => a.id))
    const buyDates = allTxsForCalc
      .filter((tx) => sectionAssetIds.has(tx.asset_id) && tx.type === 'buy')
      .map((tx) => tx.date)
    if (buyDates.length > 0) {
      setFirstPurchaseMonth(buyDates.sort()[0].slice(0, 7))
    }

    const result: AssetWithValue[] = assets.map((asset) => {
      const txs = allTxsForCalc.filter((tx) => tx.asset_id === asset.id)
      const cachedEntry: PriceCacheEntry | undefined = asset.ticker ? newPriceCache[asset.ticker] : undefined
      const priceUsd = cachedEntry?.priceUsd ?? null
      const dailyChangePct = cachedEntry?.dailyChangePct ?? null
      const priceLocal = cachedEntry?.priceLocal ?? null
      const priceCurrency = cachedEntry?.priceCurrency ?? 'USD'
      return calculateAssetValue(asset, txs, priceUsd, rates, settings.displayCurrency, dailyChangePct, priceLocal, priceCurrency, rateHistory)
    })

    setAssetsWithValues(result)
    setLoading(false)
    setRefreshing(false)

    // ── 12M výnos z Yahoo Finance (stejný přístup jako PerformanceTable) ──
    const historyType = section ? TEMPLATE_TO_HISTORY_TYPE[section.template] : undefined
    const onlineAssets = result.filter((a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0)
    if (historyType && onlineAssets.length > 0) {
      try {
        const tickers  = onlineAssets.map((a) => a.ticker!).join(',')
        const now      = new Date()
        const from13m  = new Date(now.getFullYear(), now.getMonth() - 13, 1).toISOString().split('T')[0]
        const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
        const res      = await fetch(`/api/history?tickers=${tickers}&from=${from13m}&to=${tomorrow}&type=${historyType}`)
        const data     = await res.json() as { history: Record<string, Record<string, number>> }
        if (!data.history) throw new Error('No history data')
        const d12m = new Date(now.getFullYear(), now.getMonth() - 12, 1)
        const date12mAgo = `${d12m.getFullYear()}-${String(d12m.getMonth() + 1).padStart(2, '0')}`
        // Porovnáváme živou cenu (z newPriceCache) vs. cenu před 12 měsíci (z history)
        // → nevyžaduje data za aktuální měsíc z API
        let valueNow12m = 0, value12mAgo = 0
        for (const asset of onlineAssets) {
          if (!asset.ticker || asset.totalQuantity <= 0) continue
          const price12m = data.history[asset.ticker]?.[date12mAgo]
          if (!price12m || price12m <= 0) continue
          const priceNowUsd = newPriceCache[asset.ticker]?.priceUsd
          if (!priceNowUsd || priceNowUsd <= 0) continue
          const price12mUsd = priceToUsd(price12m, asset.priceCurrency ?? 'USD', rates)
          value12mAgo += price12mUsd * asset.totalQuantity
          valueNow12m += priceNowUsd * asset.totalQuantity
        }
        if (value12mAgo > 0) {
          setReturn12mPct((valueNow12m - value12mAgo) / value12mAgo * 100)
        } else {
          setReturn12mPct(null)
        }
      } catch {
        setReturn12mPct(null)
      }
    } else {
      setReturn12mPct(null)
    }
  }, [id, settings.displayCurrency, section])

  // Načíst metadata (sector/industry/country) jednorázově pro stock aktiva která je nemají
  const loadMeta = useCallback(async () => {
    const assets = await getAssets(id)
    const missing = assets.filter(
      (a) => (a.type === 'stock' || a.type === 'etf') && a.ticker && !a.sector
    )
    if (missing.length === 0) return

    const tickers = missing.map((a) => a.ticker!).join(',')
    try {
      const res = await fetch(`/api/meta?tickers=${tickers}`)
      const data = await res.json() as { meta: Record<string, { sector?: string; industry?: string; country?: string }> }
      for (const asset of missing) {
        const m = data.meta[asset.ticker!]
        if (!m) continue
        saveAsset({ ...asset, sector: m.sector, industry: m.industry, country: m.country }).catch(console.error)
      }
      setAssetsWithValues((prev) => prev.map((av) => {
        const m = data.meta[av.ticker ?? '']
        if (!m) return av
        return { ...av, ...m }
      }))
    } catch {
      // Tiché selhání — metadata nejsou kritická
    }
  }, [id])

  useEffect(() => {
    if (section) {
      setLoading(true)
      loadData().then(() => loadMeta())
    }
  }, [section, loadData, loadMeta])

  // Sekce nenalezena → přesměrovat
  useEffect(() => {
    if (!loading && sections.length > 0 && !section) {
      router.push('/dashboard')
    }
  }, [loading, sections, section, router])

  function handleRefresh() {
    setRefreshing(true)
    loadData(true).then(() => toast.success(t('pricesUpdated')))
  }

  async function handleExport() {
    const [assets, transactions] = await Promise.all([getAssets(id), getTransactions()])
    const sectionTxs = transactions.filter((tx) => assets.some((a) => a.id === tx.asset_id))
    if (sectionTxs.length === 0) { toast.warning(t('noDataToExport')); return }
    const csv = transactionsToCsv(assets, sectionTxs)
    downloadCsv(csv, csvFilename(section?.name ?? 'sekce'))
    toast.success(t('sectionExported'))
  }

  function startRename() {
    setRenameValue(section?.name ?? '')
    setRenaming(true)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  function confirmRename() {
    if (!section || !renameValue.trim()) { setRenaming(false); return }
    saveSection({ ...section, name: renameValue.trim() })
    setRenaming(false)
    toast.success(t('sectionRenamed'))
  }

  function cancelRename() {
    setRenaming(false)
  }

  useEffect(() => {
    if (!colorPickerOpen) return
    function handleOutside(e: MouseEvent) {
      if (!colorPickerRef.current?.contains(e.target as Node)) {
        setColorPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [colorPickerOpen])

  function handleColorChange(color: string) {
    if (!section) return
    saveSection({ ...section, color })
    setColorPickerOpen(false)
    toast.success(t('colorChanged'))
  }

  async function handleDeleteSection() {
    if (!section) return
    const assets = await getAssets(id)
    if (assets.length > 0) {
      toast.error(t('removeAssetsFirst'))
      return
    }
    if (!confirm(t('confirmDeleteSection', { name: section.name }))) return
    removeSection(id)
    toast.success(t('sectionDeleted'))
    router.push('/dashboard')
  }

  function handleDeleteAsset(assetId: string, assetName: string) {
    if (!confirm(t('confirmDeleteAsset', { name: assetName }))) return
    deleteAsset(assetId).catch(console.error)
    toast.success(t('assetDeleted'))
    loadData()
  }

  if (!section) {
    return <div className="p-6 text-muted-foreground">{t('loading')}</div>
  }

  const totalValue = assetsWithValues.reduce((s, a) => s + a.currentValueDisplay, 0)
  const totalReturn = assetsWithValues.reduce((s, a) => s + a.totalReturnDisplay, 0)
  const totalInvested = assetsWithValues.reduce((s, a) => s + a.totalInvestedDisplay, 0)
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
  const totalDividends = assetsWithValues.reduce((s, a) => s + a.totalDividendsDisplay, 0)
  const returnPositive = totalReturn >= 0
  const isAuto = TEMPLATE_IS_AUTO[section.template]

  // Denní změna: součet (hodnota × dailyChangePct/100) přes aktiva s live cenou
  const dailyChangeDisplay = assetsWithValues.reduce((s, a) => {
    if (a.dailyChangePct === null || a.dailyChangePct === undefined) return s
    return s + a.currentValueDisplay * (a.dailyChangePct / 100)
  }, 0)
  const hasDailyChange = assetsWithValues.some((a) => a.dailyChangePct !== null && a.dailyChangePct !== undefined)
  const dailyChangePct = totalValue > 0 && hasDailyChange
    ? (dailyChangeDisplay / totalValue) * 100
    : null
  const dailyPositive = dailyChangeDisplay >= 0

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Zpět + akce */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ChevronLeft className="mr-1 h-4 w-4" />Dashboard
        </Link>
        <div className="flex gap-2">
          {isAuto && section.template !== 'savings' && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {t('update')}
            </Button>
          )}
          {section.template !== 'savings' && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={assetsWithValues.length === 0}>
              <Download className="mr-2 h-4 w-4" />{tCommon('exportCsv')}
            </Button>
          )}
          {section.template !== 'savings' && (
            <Link href={`/assets/add?section=${id}`} className={buttonVariants({ size: 'sm' })}>
              <Plus className="mr-2 h-4 w-4" />{t('addAsset')}
            </Link>
          )}
        </div>
      </div>

      {/* Hlavička sekce */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div ref={colorPickerRef} className="relative shrink-0 mt-1">
            <button
              onClick={() => setColorPickerOpen((o) => !o)}
              className="w-4 h-4 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-ring transition-shadow focus:outline-none"
              style={{ backgroundColor: section.color ?? TEMPLATE_COLORS[section.template] }}
              title={t('changeColor')}
            />
            {colorPickerOpen && (
              <div className="absolute left-0 top-6 z-50 rounded-lg border bg-popover p-2.5 shadow-md">
                <div className="grid grid-cols-7 gap-1.5">
                  {SECTION_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      className="w-5 h-5 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-ring transition-shadow focus:outline-none"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  ref={renameInputRef}
                  className="text-2xl font-bold bg-transparent border-b-2 border-primary outline-none w-48"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancelRename() }}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={confirmRename}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelRename}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{section.name}</h1>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={startRename}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{tEnum(`templates.${section.template}`)}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={handleDeleteSection}
        >
          <Trash2 className="mr-2 h-4 w-4" />{t('deleteSection')}
        </Button>
      </div>

      {/* Cash/úspory sekce */}
      {section.template === 'savings' && rates && (
        <CashSection
          sectionId={id}
          displayCurrency={settings.displayCurrency}
          rates={rates}
          sectionColor={section.color ?? TEMPLATE_COLORS[section.template]}
        />
      )}
      {section.template === 'savings' && !rates && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 w-full rounded-md bg-muted animate-pulse" />)}
        </div>
      )}

      {/* Statistiky */}
      {section.template !== 'savings' && !loading && assetsWithValues.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="sm:col-span-2">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal">{t('totalValue')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-bold">{formatCurrency(totalValue, settings.displayCurrency)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal">{t('return')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-center gap-1">
                {returnPositive
                  ? <TrendingUp className="h-4 w-4 text-green-500" />
                  : <TrendingDown className="h-4 w-4 text-red-500" />}
                <div>
                  <p className={`text-lg font-bold ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {returnPositive ? '+' : ''}{formatCurrency(totalReturn, settings.displayCurrency)}
                  </p>
                  <p className={`text-xs ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {returnPositive ? '+' : ''}{totalReturnPct.toFixed(2)} %
                  </p>
                </div>
              </div>
              {return12mPct !== null && (
                <div className="mt-2 pt-2 border-t flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t('return12m')}</span>
                  <span className={`text-xs font-semibold tabular-nums ${return12mPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {return12mPct >= 0 ? '+' : ''}{return12mPct.toFixed(2)} %
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
          {hasDailyChange && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">{t('dailyChange')}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-1">
                  {dailyPositive
                    ? <TrendingUp className="h-4 w-4 text-green-500" />
                    : <TrendingDown className="h-4 w-4 text-red-500" />}
                  <div>
                    <p className={`text-lg font-bold ${dailyPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {dailyPositive ? '+' : ''}{formatCurrency(dailyChangeDisplay, settings.displayCurrency)}
                    </p>
                    {dailyChangePct !== null && (
                      <p className={`text-xs ${dailyPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {dailyPositive ? '+' : ''}{dailyChangePct.toFixed(2)} %
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {totalDividends > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">{t('dividends')}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-lg font-bold text-blue-600">
                  +{formatCurrency(totalDividends, settings.displayCurrency)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Záložky — jen pro ne-savings sekce */}
      {section.template !== 'savings' && <div>
        <div className="flex gap-1 border-b mb-4">
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === 'assets'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t('tabAssets')}
          </button>
          {isAuto && (
            <button
              onClick={() => setActiveTab('performance')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                ${activeTab === 'performance'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t('tabPerformance')}
            </button>
          )}
          {section.template === 'stocks' && (
            <button
              onClick={() => setActiveTab('dividends')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                ${activeTab === 'dividends'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t('tabDividends')}
            </button>
          )}
          <button
            onClick={() => setActiveTab('taxes')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === 'taxes'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t('tabTaxes')}
          </button>
        </div>

        {activeTab === 'assets' && (
          loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : assetsWithValues.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted-foreground">{t('empty')}</p>
              <Link href={`/assets/add?section=${id}`} className={buttonVariants()}>
                <Plus className="mr-2 h-4 w-4" />{t('addFirstAsset')}
              </Link>
            </div>
          ) : (
            <AssetTable assets={assetsWithValues} displayCurrency={settings.displayCurrency} totalSectionValue={totalValue} rates={rates} />
          )
        )}

        {activeTab === 'performance' && isAuto && rates && (
          <div className="border rounded-lg bg-card overflow-hidden">
            <PerformanceTable
              assets={assetsWithValues}
              template={section.template}
              displayCurrency={settings.displayCurrency}
              rates={rates}
              firstPurchaseMonth={firstPurchaseMonth}
            />
          </div>
        )}

        {activeTab === 'dividends' && section.template === 'stocks' && rates && (
          <div className="border rounded-lg bg-card overflow-hidden">
            <DividendTable
              assets={assetsWithValues}
              displayCurrency={settings.displayCurrency}
              rates={rates}
            />
          </div>
        )}

        {activeTab === 'taxes' && (
          <TaxOverview
            assets={assetsWithValues}
            displayCurrency={settings.displayCurrency}
          />
        )}
      </div>}
    </div>
  )
}
