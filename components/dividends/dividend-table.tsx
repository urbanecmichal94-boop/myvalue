'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import type { AssetWithValue, Currency } from '@/types'
import type { CurrencyCache, DividendEntry, DividendFrequency, DividendCacheEntry } from '@/lib/storage'
import { getDividendCache, saveDividendCacheEntry, isDividendCacheValid, getTransactions } from '@/lib/storage'
import type { DividendApiResponse } from '@/app/api/dividends/route'

// ─── Typy ─────────────────────────────────────────────────────────────────────

interface DividendTableProps {
  assets: AssetWithValue[]
  displayCurrency: Currency
  rates: CurrencyCache
}

// Měsíční souhrn v zobrazovací měně (pro total řádek)
type MonthlyDividends = Record<string, { amount: number; predicted: boolean }>
type YearlyDividends  = Record<number, Record<number, { amount: number; predicted: boolean } | null>>

// Řádek per-akcie
interface StockDividendRow {
  asset:        AssetWithValue
  ticker:       string
  currency:     string
  frequency:    DividendFrequency
  monthly:      Record<number, { amount: number; predicted: boolean } | null>
  yearTotal:    number
  anyPredicted: boolean
}

// Nadcházející dividenda
interface UpcomingDiv {
  ticker:         string
  assetName:      string
  exDate:         string
  amountPerShare: number
  totalAmount:    number
  currency:       string
  predicted:      boolean
}

const MONTHS       = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const CURRENT_YEAR = new Date().getFullYear()

// ─── Komponenta ───────────────────────────────────────────────────────────────

export function DividendTable({ assets, displayCurrency, rates }: DividendTableProps) {
  const t = useTranslations('dividendTable')

  const [stockRows,    setStockRows]    = useState<StockDividendRow[]>([])
  const [totalRow,     setTotalRow]     = useState<Record<number, { amount: number; predicted: boolean } | null>>({})
  const [yearlyTotals, setYearlyTotals] = useState<Record<number, { amount: number; predicted: boolean }> | null>(null)
  const [upcomingDivs, setUpcomingDivs] = useState<UpcomingDiv[]>([])
  const [yoc,          setYoc]          = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(false)
  const [forceRefresh, setForceRefresh] = useState(0)

  const stockAssets = assets.filter(
    (a) => a.priceSource === 'live' && a.ticker && a.totalQuantity > 0
      && (a.type === 'stock' || a.type === 'etf')
  )

  useEffect(() => {
    if (stockAssets.length === 0) { setLoading(false); return }

    async function fetchAll(skipCache = false) {
      setLoading(true)
      setError(false)
      try {
        const cache = getDividendCache()
        const allEntries: Array<{ asset: AssetWithValue; entry: DividendCacheEntry }> = []

        await Promise.all(stockAssets.map(async (asset) => {
          const ticker = asset.ticker!
          const cached = cache[ticker]
          let entry: DividendCacheEntry
          if (!skipCache && cached && isDividendCacheValid(cached)) {
            entry = cached
          } else {
            const res = await fetch(`/api/dividends?ticker=${encodeURIComponent(ticker)}`)
            if (!res.ok) return
            const data = await res.json() as DividendApiResponse
            if (!data.dividends) return
            entry = { ticker, dividends: data.dividends, frequency: data.frequency, updatedAt: new Date().toISOString() }
            saveDividendCacheEntry(entry)
          }
          allEntries.push({ asset, entry })
        }))

        const today = new Date().toISOString().split('T')[0]

        // Per-stock řádky (v originální měně)
        const rows = buildStockRows(allEntries, today)
        const filtered = rows.filter(r =>
          r.yearTotal > 0 || Object.values(r.monthly).some(m => m !== null)
        )

        // Total řádek (v zobrazovací měně)
        const monthly    = computeMonthlyDividends(assets, allEntries, displayCurrency, rates)
        const yearly     = buildYearlyDividends(monthly)
        const totals     = computeYearlyTotals(yearly)
        const totalMonths = yearly[CURRENT_YEAR] ?? {}

        // Nadcházející dividendy
        const upcoming = buildUpcomingDivs(allEntries, today)

        // YoC
        const yocVal = computeYoC(allEntries, displayCurrency, rates)

        setStockRows(filtered)
        setTotalRow(totalMonths)
        setYearlyTotals(totals)
        setUpcomingDivs(upcoming)
        setYoc(yocVal)
      } catch (e) {
        console.error('DividendTable error:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchAll(forceRefresh > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => a.id + a.totalQuantity).join(','), displayCurrency, forceRefresh])

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>
  if (error)   return <p className="text-sm text-destructive py-6 text-center">{t('error')}</p>
  if (stockAssets.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{t('noOnlineAssets')}</p>
  if (stockRows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">{t('noData')}</p>

  const currSymbol    = displayCurrency === 'CZK' ? 'Kč' : displayCurrency
  const totalYearData = yearlyTotals?.[CURRENT_YEAR]

  return (
    <div className="space-y-4">

      {/* YoC + tlačítko obnovit */}
      <div className="px-3 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {yoc !== null && yoc > 0 && (
            <>
              <span className="text-sm font-medium">{t('yoc')}:</span>
              <span className="text-sm font-bold text-blue-600">{yoc.toFixed(2)} %</span>
              <span className="text-xs text-muted-foreground">{t('yocTooltip')}</span>
            </>
          )}
        </div>
        <button
          onClick={() => setForceRefresh(n => n + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      {/* Kalendář dividend */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap min-w-[90px]">
                {t('ticker')}
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-xs">
                  {monthName(m)}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {t('yearTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Řádky per akcie */}
            {stockRows.map((row) => (
              <tr key={row.ticker} className="border-b hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2 font-mono font-semibold text-xs">{row.ticker}</td>
                {MONTHS.map((m) => {
                  const cell = row.monthly[m] ?? null
                  return (
                    <td key={m} className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                      {cell && cell.amount > 0 ? (
                        <span className={cell.predicted ? 'text-muted-foreground italic' : 'text-blue-600 dark:text-blue-400'}>
                          {formatOriginal(cell.amount, row.currency)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">-</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap font-semibold">
                  {row.yearTotal > 0 ? (
                    <span className={row.anyPredicted ? 'text-muted-foreground italic' : 'text-blue-600 dark:text-blue-400'}>
                      {formatOriginal(row.yearTotal, row.currency)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Total řádek v zobrazovací měně */}
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {t('totalRow')} ({currSymbol})
              </td>
              {MONTHS.map((m) => {
                const cell = totalRow[m] ?? null
                return (
                  <td key={m} className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                    {cell && cell.amount > 0 ? (
                      <span className={cell.predicted ? 'text-muted-foreground italic' : ''}>
                        {formatAmount(cell.amount, currSymbol)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">-</span>
                    )}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                {totalYearData && totalYearData.amount > 0 ? (
                  <span className={totalYearData.predicted ? 'text-muted-foreground italic' : ''}>
                    {formatAmount(totalYearData.amount, currSymbol)}
                  </span>
                ) : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="px-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="text-blue-600">■</span> {t('exDate')}
        </span>
        <span className="flex items-center gap-1">
          <span className="italic">■</span> {t('predicted')}
        </span>
      </div>

      {/* Nadcházející dividendy */}
      {upcomingDivs.length > 0 && (
        <div className="pt-1 border-t">
          <h3 className="text-sm font-semibold mb-2 px-1 mt-3">{t('upcomingTitle')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-semibold text-xs whitespace-nowrap">{t('upcomingExDate')}</th>
                  <th className="px-3 py-2 text-left font-semibold text-xs whitespace-nowrap">{t('upcomingStock')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-xs whitespace-nowrap">{t('upcomingPerShare')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-xs whitespace-nowrap">{t('upcomingTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {upcomingDivs.map((d, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-xs tabular-nums">{d.exDate}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono font-semibold">{d.ticker}</span>
                      {d.assetName && d.assetName !== d.ticker && (
                        <span className="text-muted-foreground ml-1.5 text-[11px]">{d.assetName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      <span className={d.predicted ? 'text-muted-foreground italic' : 'text-blue-600 dark:text-blue-400'}>
                        {formatOriginal(d.amountPerShare, d.currency)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">
                      <span className={d.predicted ? 'text-muted-foreground italic' : 'text-blue-600 dark:text-blue-400'}>
                        {formatOriginal(d.totalAmount, d.currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stavba per-stock řádků (originální měna) ─────────────────────────────────

function buildStockRows(
  entries: Array<{ asset: AssetWithValue; entry: DividendCacheEntry }>,
  today: string,
): StockDividendRow[] {
  const startOfYear = `${CURRENT_YEAR}-01-01`
  const endOfYear   = `${CURRENT_YEAR}-12-31`

  return entries.map(({ asset, entry }) => {
    const monthly: Record<number, { amount: number; predicted: boolean } | null> = {}
    let yearTotal    = 0
    let anyPredicted = false

    // Měna z posledního záznamu (nejspolehlivější)
    const currency = entry.dividends[entry.dividends.length - 1]?.currency ?? 'USD'

    // Skutečné dividendy v aktuálním roce (do dnes)
    for (const div of entry.dividends) {
      if (div.exDate < startOfYear || div.exDate > today) continue
      const m      = parseInt(div.exDate.slice(5, 7))
      const amount = div.amount * asset.totalQuantity
      if (!monthly[m]) monthly[m] = { amount: 0, predicted: false }
      monthly[m]!.amount += amount
      yearTotal += amount
    }

    // Predikce zbytku roku
    const predicted = predictFutureDividends(entry, today, endOfYear)
    for (const div of predicted) {
      const m      = parseInt(div.exDate.slice(5, 7))
      const amount = div.amount * asset.totalQuantity
      if (!monthly[m]) monthly[m] = { amount: 0, predicted: true }
      monthly[m]!.amount   += amount
      monthly[m]!.predicted = true
      yearTotal    += amount
      anyPredicted  = true
    }

    return {
      asset,
      ticker:       asset.ticker ?? asset.name,
      currency,
      frequency:    entry.frequency,
      monthly,
      yearTotal:    parseFloat(yearTotal.toFixed(4)),
      anyPredicted,
    }
  })
}

// ─── Nadcházející dividendy (do 6 měsíců) ────────────────────────────────────

function buildUpcomingDivs(
  entries: Array<{ asset: AssetWithValue; entry: DividendCacheEntry }>,
  today: string,
): UpcomingDiv[] {
  const horizon = addDays(today, 180)
  const result: UpcomingDiv[] = []

  for (const { asset, entry } of entries) {
    // Reálné budoucí dividendy z Yahoo (exDate > today)
    for (const div of entry.dividends) {
      if (div.exDate <= today || div.exDate > horizon) continue
      result.push({
        ticker:         asset.ticker ?? asset.name,
        assetName:      asset.name,
        exDate:         div.exDate,
        amountPerShare: div.amount,
        totalAmount:    parseFloat((div.amount * asset.totalQuantity).toFixed(4)),
        currency:       div.currency,
        predicted:      false,
      })
    }

    // Predikované budoucí dividendy
    const predicted = predictFutureDividends(entry, today, horizon)
    for (const div of predicted) {
      // Nepřidávat pokud Yahoo už má tento datum jako reálný
      if (entry.dividends.some(d => d.exDate === div.exDate && d.exDate > today)) continue
      result.push({
        ticker:         asset.ticker ?? asset.name,
        assetName:      asset.name,
        exDate:         div.exDate,
        amountPerShare: div.amount,
        totalAmount:    parseFloat((div.amount * asset.totalQuantity).toFixed(4)),
        currency:       div.currency,
        predicted:      true,
      })
    }
  }

  return result.sort((a, b) => a.exDate.localeCompare(b.exDate))
}

// ─── Výpočet total řádku (v zobrazovací měně) ────────────────────────────────

function computeMonthlyDividends(
  assets: AssetWithValue[],
  entries: Array<{ asset: AssetWithValue; entry: DividendCacheEntry }>,
  displayCurrency: Currency,
  rates: CurrencyCache,
): MonthlyDividends {
  const result: MonthlyDividends = {}
  const today       = new Date().toISOString().split('T')[0]
  const startOfYear = `${CURRENT_YEAR}-01-01`

  const assetsWithYahoo = new Set(entries.map(e => e.asset.id))

  // Skutečné dividendy z Yahoo
  for (const { asset, entry } of entries) {
    for (const div of entry.dividends) {
      if (div.exDate < startOfYear || div.exDate > today) continue
      const month  = div.exDate.slice(0, 7)
      const amount = div.amount * asset.totalQuantity * convertToDisplay(1, div.currency, displayCurrency, rates)
      if (!result[month]) result[month] = { amount: 0, predicted: false }
      result[month].amount += amount
    }
  }

  // Uživatelské dividendové transakce (bez Yahoo dat)
  for (const asset of assets) {
    if (assetsWithYahoo.has(asset.id)) continue
    const txs = getTransactions(asset.id)
    for (const tx of txs) {
      if (tx.type !== 'dividend') continue
      if (tx.date < startOfYear || tx.date > today) continue
      const month  = tx.date.slice(0, 7)
      const amount = convertToDisplay(tx.price, tx.currency, displayCurrency, rates)
      if (!result[month]) result[month] = { amount: 0, predicted: false }
      result[month].amount += amount
    }
  }

  // Predikce zbytku roku
  const endOfYear = `${CURRENT_YEAR}-12-31`
  for (const { asset, entry } of entries) {
    const predicted = predictFutureDividends(entry, today, endOfYear)
    for (const div of predicted) {
      const month = div.exDate.slice(0, 7)
      if (month < startOfYear.slice(0, 7)) continue
      const amount = div.amount * asset.totalQuantity * convertToDisplay(1, div.currency, displayCurrency, rates)
      if (!result[month]) result[month] = { amount: 0, predicted: true }
      result[month].amount   += amount
      result[month].predicted = true
    }
  }

  for (const key of Object.keys(result)) {
    result[key].amount = parseFloat(result[key].amount.toFixed(2))
  }

  return result
}

function buildYearlyDividends(monthly: MonthlyDividends): YearlyDividends {
  const result: YearlyDividends = {}
  for (const [monthKey, data] of Object.entries(monthly)) {
    const [yearStr, monthStr] = monthKey.split('-')
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr)
    if (year !== CURRENT_YEAR) continue
    if (!result[year]) result[year] = {}
    result[year][month] = data
  }
  if (!result[CURRENT_YEAR]) result[CURRENT_YEAR] = {}
  return result
}

function computeYearlyTotals(yearly: YearlyDividends): Record<number, { amount: number; predicted: boolean }> {
  const result: Record<number, { amount: number; predicted: boolean }> = {}
  for (const [yearStr, months] of Object.entries(yearly)) {
    const year = parseInt(yearStr)
    let total = 0, anyPredicted = false
    for (const cell of Object.values(months)) {
      if (!cell) continue
      total += cell.amount
      if (cell.predicted) anyPredicted = true
    }
    result[year] = { amount: parseFloat(total.toFixed(2)), predicted: anyPredicted }
  }
  return result
}

function computeYoC(
  entries: Array<{ asset: AssetWithValue; entry: DividendCacheEntry }>,
  displayCurrency: Currency,
  rates: CurrencyCache,
): number | null {
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
  const today  = new Date().toISOString().split('T')[0]
  let annualDividends = 0, totalInvested = 0, hasDividends = false

  for (const { asset, entry } of entries) {
    const ttm = entry.dividends
      .filter(d => d.exDate >= cutoff && d.exDate <= today)
      .reduce((sum, d) => sum + convertToDisplay(d.amount, d.currency, displayCurrency, rates) * asset.totalQuantity, 0)
    if (ttm === 0) continue
    hasDividends    = true
    annualDividends += ttm
    totalInvested   += asset.totalInvestedDisplay
  }

  if (!hasDividends || totalInvested === 0) return null
  return (annualDividends / totalInvested) * 100
}

// ─── Predikce budoucích dividend ─────────────────────────────────────────────

function predictFutureDividends(entry: DividendCacheEntry, fromDate: string, toDate: string): DividendEntry[] {
  if (entry.dividends.length === 0) return []
  const last = entry.dividends[entry.dividends.length - 1]
  const intervalDays = frequencyToDays(entry.frequency)
  if (!intervalDays) return []

  const predictions: DividendEntry[] = []
  let nextDate = addDays(last.exDate, intervalDays)
  while (nextDate <= toDate) {
    if (nextDate > fromDate) {
      predictions.push({ exDate: nextDate, amount: last.amount, currency: last.currency })
    }
    nextDate = addDays(nextDate, intervalDays)
  }
  return predictions
}

function frequencyToDays(freq: DividendFrequency): number | null {
  const map: Record<DividendFrequency, number | null> = {
    monthly: 30, quarterly: 91, 'semi-annual': 182, annual: 365, unknown: null,
  }
  return map[freq]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function convertToDisplay(amount: number, fromCurrency: string, displayCurrency: Currency, rates: CurrencyCache): number {
  if (fromCurrency === displayCurrency) return amount
  const toUsd = fromCurrency === 'USD' ? 1
    : fromCurrency === 'EUR' ? rates.eurUsd
    : fromCurrency === 'CZK' ? rates.eurUsd / rates.eurCzk
    : (rates.rates?.[fromCurrency] ? rates.eurUsd / rates.rates[fromCurrency] : 1)
  const amountUsd = amount * toUsd
  if (displayCurrency === 'USD') return amountUsd
  if (displayCurrency === 'CZK') return amountUsd * (rates.eurCzk / rates.eurUsd)
  if (displayCurrency === 'EUR') return amountUsd / rates.eurUsd
  return amountUsd
}

function currencySymbol(currency: string): string {
  const map: Record<string, string> = {
    USD: '$', EUR: '€', CZK: 'Kč', GBP: '£', CAD: 'CA$', HKD: 'HK$',
    AUD: 'A$', CHF: 'CHF', JPY: '¥', SEK: 'kr', NOK: 'kr', DKK: 'kr',
    GBp: 'p', SGD: 'S$', NZD: 'NZ$',
  }
  return map[currency] ?? currency
}

function formatOriginal(amount: number, currency: string): string {
  const sym      = currencySymbol(currency)
  const abs      = Math.abs(amount)
  const decimals = abs >= 10 ? 0 : 2
  const formatted = abs.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // Sufix pro CZK, kr, CHF, pence
  if (['Kč', 'kr', 'CHF', 'p'].includes(sym)) return `${formatted} ${sym}`
  return `${sym}${formatted}`
}

function formatAmount(amount: number, currSymbol: string): string {
  return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currSymbol}`
}

function monthName(month: number): string {
  return new Intl.DateTimeFormat('cs-CZ', { month: 'short' }).format(new Date(2026, month - 1, 1))
}
