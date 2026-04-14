'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, RefreshCw, Download, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/lib/context/settings-context'
import { useSections } from '@/lib/context/sections-context'
import {
  getAssets,
  getTransactions,
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
  getSnapshots,
  addSnapshot,
  type CurrencyCache,
  type CurrencyRateHistory,
  type PriceCacheEntry,
  type PortfolioSnapshot,
} from '@/lib/storage'
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
import { SnapshotChart } from '@/components/charts/snapshot-chart'
import { DashboardPerformanceTable } from '@/components/performance/dashboard-performance-table'

export default function DashboardPage() {
  const { settings } = useSettings()
  const { sections } = useSections()
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const tEnum = useTranslations('enums')
  const [assetsWithValues, setAssetsWithValues] = useState<AssetWithValue[]>([])
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [rates, setRates] = useState<CurrencyCache | null>(null)
  const [rateHistory, setRateHistory] = useState<CurrencyRateHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async (forceRefresh = false) => {
    const assets = getAssets()

    if (assets.length === 0) {
      setAssetsWithValues([])
      setLoading(false)
      return
    }

    // ── Kurzy měn ─────────────────────────────────────────────────────────
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

    // ── Historické kurzy měn (pro cost basis) ─────────────────────────────
    let rateHistory: CurrencyRateHistory | null = null
    const cachedRateHistory = getCurrencyRateHistory()
    if (cachedRateHistory && isCurrencyRateHistoryValid(cachedRateHistory) && !forceRefresh) {
      rateHistory = cachedRateHistory
    } else {
      try {
        const allTxs = getTransactions()
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
    const result: AssetWithValue[] = assets.map((asset) => {
      const assetTxs = getTransactions(asset.id)
      const cachedEntry: PriceCacheEntry | undefined = asset.ticker ? newPriceCache[asset.ticker] : undefined
      const priceUsd = cachedEntry?.priceUsd ?? null
      const priceLocal = cachedEntry?.priceLocal ?? null
      const priceCurrency = cachedEntry?.priceCurrency ?? 'USD'
      return calculateAssetValue(asset, assetTxs, priceUsd, currentRates, settings.displayCurrency, null, priceLocal, priceCurrency, rateHistory)
    })

    setAssetsWithValues(result)
    setRates(currentRates)
    setRateHistory(rateHistory)
    setLoading(false)
    setRefreshing(false)
    setSnapshots(getSnapshots())
  }, [settings.displayCurrency])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [loadData])

  // Auto-save snapshot jednou denně po načtení hodnot
  useEffect(() => {
    if (loading) return
    const summary = calculatePortfolioSummary(assetsWithValues, settings.displayCurrency)
    if (summary.totalValueDisplay <= 0) return
    const today = new Date().toISOString().split('T')[0]
    addSnapshot({ date: today, value: summary.totalValueDisplay, currency: settings.displayCurrency })
    setSnapshots(getSnapshots())
  }, [loading, assetsWithValues, settings.displayCurrency])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData(true).then(() => toast.success(t('pricesUpdated')))
  }

  const handleExport = () => {
    const assets = getAssets()
    const transactions = getTransactions()
    if (transactions.length === 0) { toast.warning(t('noDataToExport')); return }
    const csv = transactionsToCsv(assets, transactions)
    downloadCsv(csv, csvFilename('portfolio'))
    toast.success(t('portfolioExported'))
  }

  const summary = calculatePortfolioSummary(assetsWithValues, settings.displayCurrency)
  const returnPositive = summary.totalReturnDisplay >= 0

  const dailyChangeDisplay = assetsWithValues.reduce((s, a) => {
    if (a.dailyChangePct == null) return s
    return s + a.currentValueDisplay * (a.dailyChangePct / 100)
  }, 0)
  const hasDailyChange = assetsWithValues.some((a) => a.dailyChangePct != null)
  const dailyChangePct = summary.totalValueDisplay > 0 && hasDailyChange
    ? (dailyChangeDisplay / summary.totalValueDisplay) * 100
    : null
  const dailyPositive = dailyChangeDisplay >= 0

  const sectionSummaries: SectionSummary[] = sections.map((section) =>
    calculateSectionSummary(section, assetsWithValues)
  )

  // ── Prázdný stav ─────────────────────────────────────────────────────────
  if (!loading && sections.length === 0) {
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('updatePrices')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || assetsWithValues.length === 0}>
            <Download className="mr-2 h-4 w-4" />{tCommon('exportCsv')}
          </Button>
        </div>
      </div>

      {/* Celkové shrnutí */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">{t('totalValue')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <p className="text-3xl font-bold">{formatCurrency(summary.totalValueDisplay, settings.displayCurrency)}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">{t('totalReturn')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <div className="flex items-center gap-2">
                {returnPositive
                  ? <TrendingUp className="h-5 w-5 text-green-500" />
                  : <TrendingDown className="h-5 w-5 text-red-500" />}
                <div>
                  <span className={`text-xl font-semibold ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {returnPositive ? '+' : ''}{formatCurrency(summary.totalReturnDisplay, settings.displayCurrency)}
                  </span>
                  <p className={`text-xs ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {returnPositive ? '+' : ''}{summary.totalReturnPct.toFixed(2)} %
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">{t('dailyChange')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-32" />
            ) : !hasDailyChange ? (
              <p className="text-xl font-semibold text-muted-foreground">—</p>
            ) : (
              <div className="flex items-center gap-2">
                {dailyPositive
                  ? <TrendingUp className="h-5 w-5 text-green-500" />
                  : <TrendingDown className="h-5 w-5 text-red-500" />}
                <div>
                  <span className={`text-xl font-semibold ${dailyPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {dailyPositive ? '+' : ''}{formatCurrency(dailyChangeDisplay, settings.displayCurrency)}
                  </span>
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
      </div>

      {/* Graf */}
      {settings.showPortfolioChart && sections.length > 0 && !loading && (
        <SnapshotChart snapshots={snapshots} displayCurrency={settings.displayCurrency} />
      )}

      {/* Tabulka výkonnosti */}
      {settings.showPerformanceWidget && !loading && rates && (() => {
        const autoSections = sections.filter((s) =>
          ['stocks', 'crypto', 'commodity'].includes(s.template)
        )
        const selectedIds = settings.performanceSectionIds ?? []
        const activeSections = selectedIds.length === 0
          ? autoSections
          : autoSections.filter((s) => selectedIds.includes(s.id))

        const widgetAssets = assetsWithValues.filter((a) =>
          activeSections.some((s) => s.id === a.section_id)
        )

        // Potřebujeme znát template — vezmeme nejčastější nebo první
        // Pro dashboard použijeme smíšený typ — každé aktivum může mít jiný typ
        // Předáme template první sekce jako fallback, ale přidáme multi-type podporu
        const firstSection = activeSections[0]
        if (!firstSection || widgetAssets.length === 0) return null

        return (
          <div>
            <h2 className="text-lg font-semibold mb-3">{t('performanceWidget')}</h2>
            <div className="border rounded-lg bg-card overflow-hidden">
              <DashboardPerformanceTable
                sections={activeSections}
                assets={widgetAssets}
                displayCurrency={settings.displayCurrency}
                rates={rates}
              />
            </div>
          </div>
        )
      })()}

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
              <SectionCard key={ss.section.id} summary={ss} displayCurrency={settings.displayCurrency} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCard({ summary, displayCurrency }: { summary: SectionSummary; displayCurrency: Currency }) {
  const { section, totalValueDisplay, totalReturnDisplay, totalReturnPct, assetCount } = summary
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
                style={{ backgroundColor: TEMPLATE_COLORS[section.template] }}
              />
              <div>
                <p className="font-semibold leading-tight">{section.name}</p>
                <p className="text-xs text-muted-foreground">{tEnum(`templates.${section.template}`)}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          </div>

          <p className="text-2xl font-bold mb-1">
            {formatCurrency(totalValueDisplay, displayCurrency)}
          </p>

          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
              {returnPositive ? '+' : ''}{formatCurrency(totalReturnDisplay, displayCurrency)}
              {' '}
              <span className="text-xs">({returnPositive ? '+' : ''}{totalReturnPct.toFixed(1)} %)</span>
            </span>
            <Badge variant="secondary" className="text-xs">
              {assetCount} {assetCount === 1 ? t('assetCount_one') : assetCount < 5 ? t('assetCount_few') : t('assetCount_many')}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
