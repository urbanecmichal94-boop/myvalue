import type { Asset, Transaction, Section, Currency } from '@/types'
import { AUTO_ASSET_TYPES, TROY_OZ_TO_GRAMS, COMMODITY_INFO, type CommodityId } from '@/types'
import type { CurrencyCache, TickerHistory, CurrencyRateHistory } from '@/lib/storage'
import { convertCurrency, getHistoricalRate } from '@/lib/calculations'

// ─── Mapping CoinGecko ID → Yahoo Finance ticker ──────────────────────────────

const CRYPTO_YAHOO: Record<string, string> = {
  bitcoin: 'BTC-USD', ethereum: 'ETH-USD', tether: 'USDT-USD',
  binancecoin: 'BNB-USD', ripple: 'XRP-USD', 'usd-coin': 'USDC-USD',
  solana: 'SOL-USD', cardano: 'ADA-USD', dogecoin: 'DOGE-USD',
  polkadot: 'DOT-USD', 'shiba-inu': 'SHIB-USD', 'avalanche-2': 'AVAX-USD',
  chainlink: 'LINK-USD', litecoin: 'LTC-USD', 'bitcoin-cash': 'BCH-USD',
  uniswap: 'UNI-USD', cosmos: 'ATOM-USD', 'wrapped-bitcoin': 'WBTC-USD',
}

// Vrátí ticker pro Yahoo Finance historical API (nebo null pokud nelze)
export function getHistoryYahooTicker(asset: Asset): string | null {
  if (!asset.ticker) return null
  if (asset.type === 'commodity') {
    return COMMODITY_INFO[asset.ticker as CommodityId]?.yahooTicker ?? null
  }
  if (asset.type === 'crypto') {
    return CRYPTO_YAHOO[asset.ticker] ?? (asset.ticker.toUpperCase() + '-USD')
  }
  return asset.ticker
}

// ─── Generování pole měsíců (YYYY-MM) ────────────────────────────────────────

// Generuje měsíce od fromYearMonth do PŘEDCHOZÍHO dokončeného měsíce (bez aktuálního)
export function generateMonths(fromYearMonth: string): string[] {
  const months: string[] = []
  const [y, m] = fromYearMonth.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const now = new Date()
  // Konec = první den PŘEDCHOZÍHO měsíce (aktuální měsíc přidáme se živými cenami)
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const cur = new Date(start)
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 7))
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

export function currentMonthLabel(): string {
  const now = new Date()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const yr = now.getFullYear()
  return `${mo}/${yr}`
}

export function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function getEarliestTransactionMonth(transactions: Transaction[]): string | null {
  if (transactions.length === 0) return null
  const earliest = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date)
  return earliest.slice(0, 7) // YYYY-MM
}

// ─── Výpočet měsíčních hodnot portfolia ──────────────────────────────────────

export interface MonthlyValue {
  month: string   // YYYY-MM
  label: string   // MM/YYYY
  total: number
  bySectionId: Record<string, number>
}

function endOfMonthDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

function getHistoryPrice(
  yahooTicker: string,
  month: string,
  history: Record<string, TickerHistory>,
  rates: CurrencyCache,
  displayCurrency: Currency,
  rateHistory: CurrencyRateHistory | null = null,
): number | null {
  const entry = history[yahooTicker]
  if (!entry) return null

  let price = entry.months[month]
  if (price === undefined) {
    // Použij nejbližší předchozí měsíc
    const prev = Object.keys(entry.months).filter((m) => m <= month).sort()
    if (prev.length === 0) return null
    price = entry.months[prev[prev.length - 1]]
  }
  if (!price) return null

  if (rateHistory) {
    return price * getHistoricalRate(entry.currency, displayCurrency, month, rateHistory, rates)
  }
  return convertCurrency(price, entry.currency, displayCurrency, rates)
}

export function calculateMonthlyValues(
  months: string[],
  sections: Section[],
  enabledSectionIds: Set<string>,
  assets: Asset[],
  transactions: Transaction[],
  history: Record<string, TickerHistory>,
  rates: CurrencyCache,
  displayCurrency: Currency,
  rateHistory: CurrencyRateHistory | null = null,
): MonthlyValue[] {
  return months.map((month) => {
    const endDate = endOfMonthDate(month)
    const bySectionId: Record<string, number> = {}
    let total = 0

    for (const section of sections) {
      if (!enabledSectionIds.has(section.id)) continue

      const sectionAssets = assets.filter((a) => a.section_id === section.id)
      let sectionValue = 0

      for (const asset of sectionAssets) {
        const assetTxs = transactions.filter((t) => t.asset_id === asset.id && t.date <= endDate)
        if (assetTxs.length === 0) continue

        if (AUTO_ASSET_TYPES.includes(asset.type)) {
          const yahooTicker = getHistoryYahooTicker(asset)
          if (!yahooTicker) continue

          let qty = 0
          for (const tx of assetTxs) {
            if (tx.type === 'buy') qty += tx.quantity
            else if (tx.type === 'sell') qty -= tx.quantity
          }
          qty = Math.max(0, qty)
          if (qty === 0) continue

          let priceDisplay = getHistoryPrice(yahooTicker, month, history, rates, displayCurrency, rateHistory)
          if (priceDisplay === null) continue

          // Komodity v gramech: API vrací USD/oz, převést na USD/g
          if (asset.type === 'commodity' && asset.commodity_unit === 'g') {
            priceDisplay = priceDisplay / TROY_OZ_TO_GRAMS
          }

          sectionValue += qty * priceDisplay
        } else {
          // Manuální aktivum: poslední update nebo poslední buy — použít historický kurz daného měsíce
          const sorted = [...assetTxs].sort((a, b) => a.date.localeCompare(b.date))
          let value = 0
          let hasUpdate = false
          for (const tx of sorted) {
            if (tx.type === 'update') {
              value = rateHistory
                ? tx.price * getHistoricalRate(tx.currency, displayCurrency, month, rateHistory, rates)
                : convertCurrency(tx.price, tx.currency, displayCurrency, rates)
              hasUpdate = true
            }
          }
          if (!hasUpdate) {
            const lastBuy = [...sorted].reverse().find((t) => t.type === 'buy')
            if (lastBuy) {
              value = rateHistory
                ? lastBuy.price * lastBuy.quantity * getHistoricalRate(lastBuy.currency, displayCurrency, month, rateHistory, rates)
                : convertCurrency(lastBuy.price * lastBuy.quantity, lastBuy.currency, displayCurrency, rates)
            }
          }
          sectionValue += value
        }
      }

      bySectionId[section.id] = sectionValue
      total += sectionValue
    }

    const [yr, mo] = month.split('-')
    return { month, label: `${mo}/${yr}`, total, bySectionId }
  })
}
