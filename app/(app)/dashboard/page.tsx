'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, RefreshCw, Download, ArrowRight, Settings, SlidersHorizontal, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { getAssets } from '@/lib/db/assets'
import { getTransactions } from '@/lib/db/transactions'
import { getCashSectionTotal } from '@/lib/db/cash'
import { getProperties } from '@/lib/db/properties'
import type { Property } from '@/types/property'
import { calcPropertyEquity } from '@/lib/property-utils'
import { ensurePropertySection } from '@/lib/db/sections'
import {
  calculateAssetValue,
  calculatePortfolioSummary,
  calculateSectionSummary,
  priceToUsd,
} from '@/lib/calculations'
import {
  AUTO_ASSET_TYPES,
  TEMPLATE_COLORS,
  TEMPLATE_LABELS,
  type AssetWithValue,
  type Currency,
  type SectionSummary,
} from '@/types'
import { formatCurrency } from '@/lib/format'
import { transactionsToCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { AllocationChart } from '@/components/charts/allocation-chart'
import { PortfolioStackedChart } from '@/components/charts/portfolio-stacked-chart'
import { getCashflowCategories, getCashflowItems, getCashflowHistory } from '@/lib/db/cashflow'
import { getCategoryMonthly } from '@/lib/cashflow-storage'
import { DashboardPerformanceTable } from '@/components/performance/dashboard-performance-table'
import { TradingViewMarketOverview } from '@/components/markets/tradingview-market-overview'

function reserveColor(months: number): string {
  const t = Math.min(Math.max(months, 0), 6) / 6
  const red    = [239, 68,  68]
  const yellow = [234, 179,  8]
  const green  = [ 34, 197, 94]
  const [from, to, u] = t <= 0.5
    ? [red, yellow, t / 0.5]
    : [yellow, green, (t - 0.5) / 0.5]
  return `rgb(${Math.round(from[0]+(to[0]-from[0])*u)},${Math.round(from[1]+(to[1]-from[1])*u)},${Math.round(from[2]+(to[2]-from[2])*u)})`
}

export default function DashboardPage() {
  const { settings, updateSettings } = useSettings()
  const { sections, refresh: refreshSections } = useSections()
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const tEnum = useTranslations('enums')
  const [assetsWithValues, setAssetsWithValues] = useState<AssetWithValue[]>([])
  const [rates, setRates] = useState<CurrencyCache | null>(null)
  const [rateHistory, setRateHistory] = useState<CurrencyRateHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cashTotal, setCashTotal] = useState(0)
  const [cashTotalsBySectionId, setCashTotalsBySectionId] = useState<Record<string, number>>({})
  const [monthlyExpenses, setMonthlyExpenses] = useState<number | null>(null)
  const [return12mPct, setReturn12mPct] = useState<number | null>(null)
  const [wlPeriod, setWlPeriod] = useState<'1d' | '1m' | '6m' | '12m' | 'total'>('12m')
  const [propertyEquity, setPropertyEquity] = useState(0)
  const [propertiesList, setPropertiesList] = useState<Property[]>([])

  const loadData = useCallback(async (forceRefresh = false) => {
    // ── Kurzy měn — vždy načíst (i pro cash sekce bez aktiv) ──────────────
    let currentRates: CurrencyCache
    const cachedRates = getCurrencyCache()
    if (cachedRates && isCurrencyCacheValid(cachedRates) && !forceRefresh) {
      currentRates = cachedRates
    } else {
      try {
        const res = await fetch('/api/currencies')
        const data = await res.json()
        currentRates = { eurCzk: data.eurCzk, eurUsd: data.eurUsd, rates: data.rates ?? {}, updatedAt: new Date().toISOString() }
        saveCurrencyCache(currentRates)
      } catch {
        currentRates = cachedRates ?? { eurCzk: 25.0, eurUsd: 1.08, rates: {}, updatedAt: new Date().toISOString() }
        toast.warning(t('currenciesFailed'))
      }
    }
    setRates(currentRates)

    const assets = await getAssets()

    // Nemovitosti — equity (hodnota − hypotéka) + zajistit property sekci
    try {
      const properties = await getProperties()
      const equity = properties.reduce((sum, p) => sum + calcPropertyEquity(p), 0)
      setPropertyEquity(equity)
      setPropertiesList(properties)
      if (properties.length > 0) {
        ensurePropertySection().then(() => refreshSections()).catch(() => {})
      }
    } catch {
      setPropertyEquity(0)
      setPropertiesList([])
    }

    if (assets.length === 0) {
      setAssetsWithValues([])
      setLoading(false)
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
        const data = await res.json() as { prices: Record<string, number>; dailyChanges?: Record<string, number>; currencies?: Record<string, string> }
        for (const [ticker, price] of Object.entries(data.prices)) {
          const currency = data.currencies?.[ticker] ?? 'USD'
          newPriceCache[ticker] = {
            ticker,
            priceUsd: priceToUsd(price, currency, currentRates),
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
    const result: AssetWithValue[] = assets.map((asset) => {
      const assetTxs = allTxsForCalc.filter((tx) => tx.asset_id === asset.id)
      const cachedEntry: PriceCacheEntry | undefined = asset.ticker ? newPriceCache[asset.ticker] : undefined
      const priceUsd = cachedEntry?.priceUsd ?? null
      const priceLocal = cachedEntry?.priceLocal ?? null
      const priceCurrency = cachedEntry?.priceCurrency ?? 'USD'
      return calculateAssetValue(asset, assetTxs, priceUsd, currentRates, settings.displayCurrency, null, priceLocal, priceCurrency, rateHistory)
    })

    setAssetsWithValues(result)
    setRateHistory(rateHistory)
    setLoading(false)
    setRefreshing(false)
  }, [settings.displayCurrency])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  // Načíst zůstatky cash/úspory sekcí (celkem i per-sekci)
  useEffect(() => {
    if (!rates) return
    const savingsSections = sections.filter((s) => s.template === 'savings')
    if (savingsSections.length === 0) { setCashTotal(0); setCashTotalsBySectionId({}); return }
    Promise.all(savingsSections.map((s) => getCashSectionTotal(s.id, rates, settings.displayCurrency).then((v) => ({ id: s.id, v }))))
      .then((results) => {
        const byId: Record<string, number> = {}
        let total = 0
        for (const { id, v } of results) { byId[id] = v; total += v }
        setCashTotalsBySectionId(byId)
        setCashTotal(total)
      })
      .catch(console.error)
  }, [rates, sections, settings.displayCurrency])

  // Načíst měsíční výdaje z cashflow (pro výpočet rezervy)
  useEffect(() => {
    if (!rates) return
    Promise.all([getCashflowCategories(), getCashflowItems(), getCashflowHistory()])
      .then(([cats, itms, hist]) => {
        const expenseTop = cats.filter((c) => c.parent_id === null && c.type === 'expense')
        const total = expenseTop.reduce((s, c) => s + getCategoryMonthly(c.id, cats, itms, hist, rates, settings.displayCurrency), 0)
        setMonthlyExpenses(total > 0 ? total : null)
      })
      .catch(console.error)
  }, [rates, settings.displayCurrency])

  // 12M výnos přes všechna live aktiva
  useEffect(() => {
    if (loading || !rates || assetsWithValues.length === 0) return
    const totalIds = settings.totalValueSectionIds ?? []
    const assets = totalIds.length === 0 ? assetsWithValues : assetsWithValues.filter((a) => totalIds.includes(a.section_id))
    const priceCache = getPriceCache()
    const liveAssets = assets.filter((a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0)
    if (liveAssets.length === 0) { setReturn12mPct(null); return }

    const byType: Record<string, string[]> = {}
    for (const asset of liveAssets) {
      const section = sections.find((s) => s.id === asset.section_id)
      const type = section ? ({ stocks: 'stock', crypto: 'crypto', commodity: 'commodity' } as Record<string, string>)[section.template] : undefined
      if (!type) continue
      if (!byType[type]) byType[type] = []
      if (!byType[type].includes(asset.ticker!)) byType[type].push(asset.ticker!)
    }

    const now = new Date()
    const from13m = new Date(now.getFullYear(), now.getMonth() - 13, 1).toISOString().split('T')[0]
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
    const d12m = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const date12mAgo = `${d12m.getFullYear()}-${String(d12m.getMonth() + 1).padStart(2, '0')}`

    Promise.all(
      Object.entries(byType).map(([type, tickers]) =>
        fetch(`/api/history?tickers=${encodeURIComponent(tickers.join(','))}&from=${from13m}&to=${tomorrow}&type=${type}`)
          .then((r) => r.json() as Promise<{ history: Record<string, Record<string, number>> }>)
          .then((d) => d.history ?? {})
          .catch(() => ({} as Record<string, Record<string, number>>))
      )
    ).then((results) => {
      const mergedHistory = Object.assign({}, ...results)
      let valueNow = 0, value12m = 0
      for (const asset of liveAssets) {
        if (!asset.ticker) continue
        const price12m = mergedHistory[asset.ticker]?.[date12mAgo]
        if (!price12m || price12m <= 0) continue
        const cached = priceCache[asset.ticker]
        if (!cached?.priceUsd) continue
        const price12mUsd = priceToUsd(price12m, asset.priceCurrency ?? 'USD', rates)
        value12m += price12mUsd * asset.totalQuantity
        valueNow += cached.priceUsd * asset.totalQuantity
      }
      setReturn12mPct(value12m > 0 ? (valueNow - value12m) / value12m * 100 : null)
    }).catch(() => setReturn12mPct(null))
  }, [loading, assetsWithValues.map((a) => a.id).join(','), settings.totalValueSectionIds?.join(','), settings.displayCurrency])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    setRefreshing(true)
    loadData(true).then(() => toast.success(t('pricesUpdated')))
  }

  const handleExport = async () => {
    const [assets, transactions] = await Promise.all([getAssets(), getTransactions()])
    if (transactions.length === 0) { toast.warning(t('noDataToExport')); return }
    const csv = transactionsToCsv(assets, transactions)
    downloadCsv(csv, csvFilename('portfolio'))
    toast.success(t('portfolioExported'))
  }

  const totalIds = settings.totalValueSectionIds ?? []
  const propertySectionId = sections.find((s) => s.template === 'property')?.id
  const filteredSections = totalIds.length === 0 ? sections : sections.filter((s) => totalIds.includes(s.id))
  const filteredAssets = totalIds.length === 0
    ? assetsWithValues
    : assetsWithValues.filter((a) => totalIds.includes(a.section_id))
  const filteredCashTotal = totalIds.length === 0
    ? cashTotal
    : sections.filter((s) => s.template === 'savings' && totalIds.includes(s.id))
        .reduce((sum, s) => sum + (cashTotalsBySectionId[s.id] ?? 0), 0)
  const propertyIncluded = totalIds.length === 0 || (propertySectionId ? totalIds.includes(propertySectionId) : false)
  const filteredProperties = propertyIncluded ? propertiesList : []

  const summary = calculatePortfolioSummary(filteredAssets, settings.displayCurrency)
  const totalNetWorth = summary.totalValueDisplay + filteredCashTotal
    + (propertyIncluded && settings.includePropertiesInDashboard ? propertyEquity : 0)
  const returnPositive = summary.totalReturnDisplay >= 0

  const dailyChangeDisplay = filteredAssets.reduce((s, a) => {
    if (a.dailyChangePct == null) return s
    return s + a.currentValueDisplay * (a.dailyChangePct / 100)
  }, 0)
  const hasDailyChange = filteredAssets.some((a) => a.dailyChangePct != null)
  const dailyChangePct = totalNetWorth > 0 && hasDailyChange
    ? (dailyChangeDisplay / totalNetWorth) * 100
    : null
  const dailyPositive = dailyChangeDisplay >= 0

  const [sectionFilterOpen, setSectionFilterOpen] = useState(false)
  const sectionFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sectionFilterRef.current && !sectionFilterRef.current.contains(e.target as Node)) {
        setSectionFilterOpen(false)
      }
    }
    if (sectionFilterOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sectionFilterOpen])

  const nonPropertySections = sections.filter((s) => s.template !== 'property')
  const sectionValueOverrides: Record<string, number> = propertySectionId && settings.includePropertiesInDashboard
    ? { [propertySectionId]: propertyEquity }
    : {}

  const sectionSummaries: SectionSummary[] = nonPropertySections.map((section) =>
    calculateSectionSummary(section, assetsWithValues)
  )

  // ── Prázdný stav ─────────────────────────────────────────────────────────
  if (!loading && nonPropertySections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{t('welcome')}</h2>
          <p className="text-muted-foreground">{t('welcomeSubtext')}</p>
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {t.rich('welcomeInstruction', {
            add: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Hlavička */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-2 h-4 w-4" />{t('settingsBtn')}
        </Button>
      </div>

      {/* Celkové shrnutí */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Celková hodnota */}
        <Card className="overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal flex items-center justify-between">
              <span>{t('totalValue')}</span>
              <div className="relative" ref={sectionFilterRef}>
                <button
                  onClick={() => setSectionFilterOpen((o) => !o)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${sectionFilterOpen ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  {totalIds.length > 0 && totalIds.length < sections.length && (
                    <span className="text-primary font-medium">{totalIds.length}/{sections.length}</span>
                  )}
                </button>
                {sectionFilterOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-card border rounded-lg shadow-lg py-1.5 min-w-[180px]">
                    <button
                      onClick={() => updateSettings({ totalValueSectionIds: [] })}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-b mb-1 pb-2"
                    >
                      <Check className="h-3 w-3 shrink-0" />
                      <span>{t('selectAll')}</span>
                    </button>
                    {sections.map((s) => {
                      const selected = totalIds.length === 0 ? true : totalIds.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            const current = totalIds.length === 0
                              ? sections.map((x) => x.id)
                              : [...totalIds]
                            const next = current.includes(s.id)
                              ? current.filter((id) => id !== s.id)
                              : [...current, s.id]
                            updateSettings({ totalValueSectionIds: next.length === sections.length ? [] : next })
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color ?? TEMPLATE_COLORS[s.template] }} />
                          <span className={`flex-1 text-left truncate ${selected ? '' : 'text-muted-foreground'}`}>{s.name}</span>
                          {selected
                            ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                            : <span className="h-3.5 w-3.5 shrink-0" />
                          }
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-36" />
            ) : (
              <p className="text-2xl font-bold">{formatCurrency(totalNetWorth, settings.displayCurrency)}</p>
            )}
          </CardContent>
        </Card>

        {/* Celkový výnos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">{t('totalReturn')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {returnPositive
                    ? <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
                    : <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />}
                  <div>
                    <p className={`text-lg font-semibold leading-tight ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {returnPositive ? '+' : ''}{formatCurrency(summary.totalReturnDisplay, settings.displayCurrency)}
                    </p>
                    <p className={`text-xs ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {returnPositive ? '+' : ''}{summary.totalReturnPct.toFixed(2)} %
                    </p>
                  </div>
                </div>
                {return12mPct !== null && (
                  <div className="border-t pt-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('return12m')}</span>
                    <span className={`text-xs font-semibold tabular-nums ${return12mPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {return12mPct >= 0 ? '+' : ''}{return12mPct.toFixed(2)} %
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Denní změna */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">{t('dailyChange')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : !hasDailyChange ? (
              <p className="text-lg font-semibold text-muted-foreground">—</p>
            ) : (
              <div className="flex items-center gap-2">
                {dailyPositive
                  ? <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />}
                <div>
                  <p className={`text-lg font-semibold leading-tight ${dailyPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {dailyPositive ? '+' : ''}{formatCurrency(dailyChangeDisplay, settings.displayCurrency)}
                  </p>
                  {dailyChangePct !== null && (
                    <p className={`text-xs ${dailyPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {dailyPositive ? '+' : ''}{dailyChangePct.toFixed(2)} %
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Měsíční rezerva */}
        {settings.showReserveWidget && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">{t('reserveWidget')}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-7 w-20" />
              ) : monthlyExpenses !== null && filteredCashTotal > 0 ? (() => {
                const months = filteredCashTotal / monthlyExpenses
                const color = reserveColor(months)
                return (
                  <div>
                    <p className="text-lg font-semibold leading-tight font-mono" style={{ color }}>
                      {months >= 100 ? '99+' : months.toFixed(1)} {t('reserveMonthsShort')}
                    </p>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min((months / 6) * 95, 100)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })() : (
                <p className="text-lg font-semibold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Grafy */}
      {!loading && totalNetWorth > 0 && (
        <div className={settings.showAllocationChart ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
          <PortfolioStackedChart
            assets={filteredAssets}
            sections={filteredSections}
            rates={rates!}
            displayCurrency={settings.displayCurrency}
            properties={filteredProperties}
          />
          {settings.showAllocationChart && (
            <AllocationChart
              sections={filteredSections}
              assets={filteredAssets}
              cashTotalsBySectionId={cashTotalsBySectionId}
              displayCurrency={settings.displayCurrency}
              totalNetWorth={totalNetWorth}
              sectionValueOverrides={sectionValueOverrides}
            />
          )}
        </div>
      )}

      {/* Nejlepší a nejhorší aktiva */}
      {settings.showWinnersLosers && !loading && (() => {
        const priceHist = getPriceHistory()
        const periods = [
          { key: '1d',    label: '1D' },
          { key: '1m',    label: '1M' },
          { key: '6m',    label: '6M' },
          { key: '12m',   label: '12M' },
          { key: 'total', label: t('periodTotal') },
        ] as const

        function getReturnPct(a: typeof filteredAssets[0]): number | null {
          if (wlPeriod === 'total') return a.totalReturnPct
          if (wlPeriod === '1d') return a.dailyChangePct ?? null
          const monthsBack = wlPeriod === '1m' ? 1 : wlPeriod === '6m' ? 6 : 12
          if (!a.ticker) return null
          const hist = priceHist[a.ticker]
          if (!hist) return null
          const d = new Date()
          d.setMonth(d.getMonth() - monthsBack)
          const pastKey = d.toISOString().slice(0, 7)
          const pastPrice = hist.months[pastKey]
          if (!pastPrice || a.currentPriceExchange === 0) return null
          return ((a.currentPriceExchange - pastPrice) / pastPrice) * 100
        }

        const fmt = (pct: number) =>
          (pct >= 0 ? '+' : '') + pct.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'

        const eligible = filteredAssets.filter((a) => a.totalInvestedDisplay > 0 && a.priceSource !== 'no_price')
        if (eligible.length === 0) return null

        const withReturn = eligible
          .map((a) => ({ a, pct: getReturnPct(a) }))
          .filter((x): x is { a: typeof filteredAssets[0]; pct: number } => x.pct !== null)
          .sort((x, y) => y.pct - x.pct)

        const noData = withReturn.length === 0
        const winners = withReturn.slice(0, 3)
        const losers  = withReturn.slice(-3).reverse()

        return (
          <div className="border rounded-lg bg-card px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('winnersLosersWidget')}</p>
              <div className="flex gap-1">
                {periods.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setWlPeriod(key)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${wlPeriod === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {noData ? (
              <p className="text-sm text-muted-foreground py-2">{t('winnersNoData')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t('winnersLabel')}</p>
                  <div className="divide-y">
                    {winners.map(({ a, pct }) => (
                      <div key={a.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm truncate max-w-[60%]">{a.name}</span>
                        <span className="text-sm font-medium tabular-nums text-green-500">{fmt(pct)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{t('losersLabel')}</p>
                  <div className="divide-y">
                    {losers.map(({ a, pct }) => (
                      <div key={a.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm truncate max-w-[60%]">{a.name}</span>
                        <span className={`text-sm font-medium tabular-nums ${pct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmt(pct)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tabulka výkonnosti */}
      {settings.showPerformanceWidget && !loading && rates && (() => {
        const autoSections = sections.filter((s) =>
          ['stocks', 'crypto', 'commodity'].includes(s.template) &&
          (totalIds.length === 0 || totalIds.includes(s.id))
        )
        const widgetAssets = filteredAssets.filter((a) =>
          autoSections.some((s) => s.id === a.section_id)
        )
        if (autoSections.length === 0 || widgetAssets.length === 0) return null

        return (
          <div>
            <h2 className="text-lg font-semibold mb-3">{t('performanceWidget')}</h2>
            <div className="border rounded-lg bg-card overflow-hidden">
              <DashboardPerformanceTable
                sections={autoSections}
                assets={widgetAssets}
                displayCurrency={settings.displayCurrency}
                rates={rates}
              />
            </div>
          </div>
        )
      })()}

      {/* TradingView Market Overview */}
      {settings.showMarketOverview && <TradingViewMarketOverview />}

      {/* Dialog nastavení dashboardu */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settingsBtn')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">

            {/* Akce */}
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => { setSettingsOpen(false); handleRefresh() }} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {t('updatePrices')}
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => { setSettingsOpen(false); handleExport() }} disabled={loading || assetsWithValues.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {tCommon('exportCsv')}
              </Button>
            </div>

            <div className="border-t" />

            {/* Widgety */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('allocationWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.showAllocationChart}
                  onClick={() => updateSettings({ showAllocationChart: !settings.showAllocationChart })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showAllocationChart ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.showAllocationChart ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('reserveWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.showReserveWidget}
                  onClick={() => updateSettings({ showReserveWidget: !settings.showReserveWidget })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showReserveWidget ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.showReserveWidget ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('marketOverviewWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.showMarketOverview}
                  onClick={() => updateSettings({ showMarketOverview: !settings.showMarketOverview })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showMarketOverview ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.showMarketOverview ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('winnersLosersWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.showWinnersLosers}
                  onClick={() => updateSettings({ showWinnersLosers: !settings.showWinnersLosers })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showWinnersLosers ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.showWinnersLosers ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('performanceWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.showPerformanceWidget}
                  onClick={() => updateSettings({ showPerformanceWidget: !settings.showPerformanceWidget })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.showPerformanceWidget ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.showPerformanceWidget ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('includePropertiesWidget')}</p>
                <button
                  role="switch"
                  aria-checked={settings.includePropertiesInDashboard}
                  onClick={() => updateSettings({ includePropertiesInDashboard: !settings.includePropertiesInDashboard })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.includePropertiesInDashboard ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.includePropertiesInDashboard ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>


          </div>
        </DialogContent>
      </Dialog>

      {/* Sekce */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t('mySections')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectionSummaries.map((ss) => (
              <SectionCard key={ss.section.id} summary={ss} displayCurrency={settings.displayCurrency} cashValue={cashTotalsBySectionId[ss.section.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCard({ summary, displayCurrency, cashValue }: { summary: SectionSummary; displayCurrency: Currency; cashValue?: number }) {
  const { section, totalValueDisplay, totalReturnDisplay, totalReturnPct, assetCount } = summary
  const isSavings = section.template === 'savings'
  const displayValue = isSavings ? (cashValue ?? 0) : totalValueDisplay
  const returnPositive = totalReturnDisplay >= 0
  const t = useTranslations('dashboard')
  const tEnum = useTranslations('enums')

  return (
    <Link href={`/sections/${section.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: section.color ?? TEMPLATE_COLORS[section.template] }}
              />
              <div>
                <p className="font-semibold leading-tight">{section.name}</p>
                <p className="text-xs text-muted-foreground">{tEnum(`templates.${section.template}`)}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          </div>

          <p className="text-2xl font-bold mb-1">
            {formatCurrency(displayValue, displayCurrency)}
          </p>

          <div className="flex items-center justify-between">
            {isSavings ? (
              <span className="text-sm text-muted-foreground">{tEnum(`templates.${section.template}`)}</span>
            ) : (
              <span className={`text-sm font-medium ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                {returnPositive ? '+' : ''}{formatCurrency(totalReturnDisplay, displayCurrency)}
                {' '}
                <span className="text-xs">({returnPositive ? '+' : ''}{totalReturnPct.toFixed(1)} %)</span>
              </span>
            )}
            {!isSavings && (
              <Badge variant="secondary" className="text-xs">
                {assetCount} {assetCount === 1 ? t('assetCount_one') : assetCount < 5 ? t('assetCount_few') : t('assetCount_many')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
