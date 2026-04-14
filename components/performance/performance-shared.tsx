import type { AssetWithValue, Currency } from '@/types'
import type { CurrencyCache } from '@/lib/storage'

// ─── Typy ─────────────────────────────────────────────────────────────────────

export type MonthlyValues = Record<string, number>
export type YearlyReturns = Record<number, Record<number, number | null>>

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// ─── Výpočetní logika ─────────────────────────────────────────────────────────

export function computeMonthlyValuesFromHistory(
  assets: AssetWithValue[],
  history: Record<string, Record<string, number>>,
  rates: CurrencyCache,
  displayCurrency: Currency,
): MonthlyValues {
  const allMonths = new Set<string>()
  for (const data of Object.values(history)) {
    for (const month of Object.keys(data)) allMonths.add(month)
  }

  const result: MonthlyValues = {}

  for (const month of allMonths) {
    let total = 0
    for (const asset of assets) {
      if (!asset.ticker) continue
      const assetHistory = history[asset.ticker]
      if (!assetHistory) continue
      const price = assetHistory[month]
      if (!price) continue
      const priceInDisplay = convertToDisplay(price, asset.priceCurrency ?? 'USD', displayCurrency, rates)
      total += asset.totalQuantity * priceInDisplay
    }
    if (total > 0) result[month] = parseFloat(total.toFixed(8))
  }

  return result
}

export function computeReturns(monthlyValues: MonthlyValues): YearlyReturns {
  const sorted = Object.keys(monthlyValues).sort()
  if (sorted.length < 2) return {}

  const result: YearlyReturns = {}

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (!isNextMonth(prev, curr)) continue

    const prevVal = monthlyValues[prev]
    const currVal = monthlyValues[curr]
    if (!prevVal || prevVal === 0) continue

    const returnPct = ((currVal - prevVal) / prevVal) * 100
    const [yearStr, monthStr] = curr.split('-')
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr)

    if (!result[year]) result[year] = {}
    result[year][month] = parseFloat(returnPct.toFixed(2))
  }

  return result
}

function isNextMonth(prev: string, curr: string): boolean {
  const [py, pm] = prev.split('-').map(Number)
  const [cy, cm] = curr.split('-').map(Number)
  if (cy === py && cm === pm + 1) return true
  if (cy === py + 1 && cm === 1 && pm === 12) return true
  return false
}

function convertToDisplay(price: number, fromCurrency: string, displayCurrency: Currency, rates: CurrencyCache): number {
  if (fromCurrency === displayCurrency) return price
  const priceUsd = toUsdRate(fromCurrency, rates) * price
  if (displayCurrency === 'USD') return priceUsd
  if (displayCurrency === 'CZK') return priceUsd * (rates.eurCzk / rates.eurUsd)
  if (displayCurrency === 'EUR') return priceUsd / rates.eurUsd
  return priceUsd
}

function toUsdRate(currency: string, rates: CurrencyCache): number {
  if (currency === 'USD') return 1
  if (currency === 'EUR') return rates.eurUsd
  if (currency === 'CZK') return rates.eurUsd / rates.eurCzk
  const eurRate = rates.rates?.[currency]
  if (eurRate) return rates.eurUsd / eurRate
  return 1
}

export function monthName(month: number): string {
  return new Intl.DateTimeFormat('cs-CZ', { month: 'short' }).format(new Date(2026, month - 1, 1))
}

// ─── Sdílená UI komponenta ────────────────────────────────────────────────────

export function ReturnBadge({ value, bold = false }: { value: number; bold?: boolean }) {
  const pos = value >= 0
  const cls = `${pos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} ${bold ? 'font-bold' : ''}`
  return (
    <span className={cls}>
      {pos ? '+' : ''}{value.toFixed(2)} %
    </span>
  )
}
