import type {
  Asset,
  Transaction,
  Currency,
  AssetType,
  AssetWithValue,
  PortfolioSummary,
  SectionSummary,
  Section,
} from '@/types'
import { AUTO_ASSET_TYPES, TROY_OZ_TO_GRAMS } from '@/types'
import type { CurrencyCache, CurrencyRateHistory } from '@/lib/storage'

// ─── Barvy kategorií ─────────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<AssetType, string> = {
  stock:       '#3b82f6',
  etf:         '#6366f1',
  crypto:      '#f59e0b',
  commodity:   '#10b981',
  real_estate: '#ef4444',
  savings:     '#8b5cf6',
  pension:     '#ec4899',
  bond:        '#14b8a6',
  p2p:         '#f97316',
  custom:      '#6b7280',
}

// ─── Měnové přepočty ─────────────────────────────────────────────────────────

// Vrátí EUR-based sazbu pro libovolnou měnu (1 EUR = X dané měny)
function getRate(currency: string, cache: CurrencyCache): number {
  if (currency === 'EUR') return 1
  return cache.rates?.[currency] ?? (currency === 'USD' ? cache.eurUsd : currency === 'CZK' ? cache.eurCzk : 1)
}

// Vrátí historický EUR-based kurz pro daný měsíc (YYYY-MM).
// Pokud měsíc není k dispozici, fallback na nejbližší dostupný nebo na aktuální kurz.
export function getHistoricalRate(
  currency: string,
  toCurrency: string,
  yearMonth: string,            // YYYY-MM
  history: CurrencyRateHistory,
  currentRates: CurrencyCache,
): number {
  if (currency === toCurrency) return 1

  // Pokud přesný měsíc chybí, zkusit nejbližší starší dostupný měsíc
  const getRatesForMonth = (ym: string): Record<string, number> | undefined => history.months[ym]
  let rates: Record<string, number> | undefined = getRatesForMonth(yearMonth)
  if (!rates) {
    const available = Object.keys(history.months).sort()
    const older = available.filter((m) => m <= yearMonth)
    rates = older.length > 0 ? getRatesForMonth(older[older.length - 1]) : undefined
  }

  if (!rates) {
    // Žádná historická data → fallback na aktuální kurzy
    return convertCurrency(1, currency, toCurrency, currentRates)
  }

  const fromRate = currency === 'EUR' ? 1 : (rates[currency] ?? getRate(currency, currentRates))
  const toRate   = toCurrency === 'EUR' ? 1 : (rates[toCurrency] ?? getRate(toCurrency, currentRates))
  return toRate / fromRate
}

// Přepočítá libovolnou měnu na jinou přes EUR jako mezičlánek
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  cache: CurrencyCache
): number {
  if (from === to) return amount
  const amountInEur = amount / getRate(from, cache)
  return amountInEur * getRate(to, cache)
}

// Přepočítá cenu z měny burzy na USD (pro interní kalkulace)
export function priceToUsd(price: number, currency: string, cache: CurrencyCache): number {
  return convertCurrency(price, currency, 'USD', cache)
}

// ─── Výpočet hodnoty jednoho aktiva ─────────────────────────────────────────

export function calculateAssetValue(
  asset: Asset,
  transactions: Transaction[],
  priceUsd: number | null,              // aktuální cena v USD (null = nedostupná)
  rates: CurrencyCache,
  displayCurrency: Currency,
  dailyChangePct: number | null = null, // denní změna v % (null = nedostupná)
  priceLocal: number | null = null,     // originální cena v měně burzy (pro zobrazení)
  priceCurrency = 'USD',                // měna burzy
  rateHistory: CurrencyRateHistory | null = null,  // historické kurzy pro cost basis
): AssetWithValue {
  const isAuto = AUTO_ASSET_TYPES.includes(asset.type)
  const sorted = [...transactions]
    .filter((t) => t.asset_id === asset.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Automatická aktiva (akcie, ETF, krypto, komodita) ───────────────────
  if (isAuto) {
    let totalQuantity = 0
    let totalBuyQty = 0
    let totalBuyCostDisplay = 0
    let totalBuyCostExchange = 0   // cost v měně burzy
    let totalDividendsDisplay = 0
    let realizedGainDisplay = 0    // realizovaný zisk/ztráta z prodejů
    let totalEverInvestedDisplay = 0 // celkový vložený kapitál (včetně již prodaného)

    for (const tx of sorted) {
      if (tx.type === 'buy') {
        // Cost basis: použít historický kurz v měsíci nákupu (pokud máme historii)
        const txMonth = tx.date.slice(0, 7)
        const costDisplay = rateHistory
          ? tx.price * tx.quantity * getHistoricalRate(tx.currency, displayCurrency, txMonth, rateHistory, rates)
          : convertCurrency(tx.price * tx.quantity, tx.currency, displayCurrency, rates)
        const costExchange = rateHistory
          ? tx.price * tx.quantity * getHistoricalRate(tx.currency, priceCurrency, txMonth, rateHistory, rates)
          : convertCurrency(tx.price * tx.quantity, tx.currency, priceCurrency as Currency, rates)
        totalQuantity += tx.quantity
        totalBuyQty += tx.quantity
        totalBuyCostDisplay  += costDisplay
        totalBuyCostExchange += costExchange
        totalEverInvestedDisplay += costDisplay
      } else if (tx.type === 'sell') {
        totalQuantity -= tx.quantity
        if (totalBuyQty > 0) {
          const txMonth = tx.date.slice(0, 7)
          const avgCostPerShare    = totalBuyCostDisplay / totalBuyQty
          const avgCostExPerShare  = totalBuyCostExchange / totalBuyQty
          const costBasis          = avgCostPerShare * tx.quantity
          const saleProceeds       = rateHistory
            ? tx.price * tx.quantity * getHistoricalRate(tx.currency, displayCurrency, txMonth, rateHistory, rates)
            : convertCurrency(tx.price * tx.quantity, tx.currency, displayCurrency, rates)
          realizedGainDisplay     += saleProceeds - costBasis
          totalBuyCostDisplay     -= costBasis
          totalBuyCostExchange    -= avgCostExPerShare * tx.quantity
          totalBuyQty             -= tx.quantity
        }
      } else if (tx.type === 'dividend') {
        const txMonth = tx.date.slice(0, 7)
        totalDividendsDisplay += rateHistory
          ? tx.price * getHistoricalRate(tx.currency, displayCurrency, txMonth, rateHistory, rates)
          : convertCurrency(tx.price, tx.currency, displayCurrency, rates)
      }
    }

    const avgBuyPriceDisplay  = totalBuyQty > 0 ? totalBuyCostDisplay  / totalBuyQty : 0
    const avgBuyPriceExchange = totalBuyQty > 0 ? totalBuyCostExchange / totalBuyQty : 0

    // Pro komodity: API vrací USD/oz → pokud uživatel zadal gramy, převedeme
    let effectivePriceUsd = priceUsd ?? 0
    if (asset.type === 'commodity' && asset.commodity_unit === 'g' && priceUsd !== null) {
      effectivePriceUsd = priceUsd / TROY_OZ_TO_GRAMS
    }

    const currentPriceDisplay = convertCurrency(effectivePriceUsd, 'USD', displayCurrency, rates)
    const currentValueDisplay = totalQuantity > 0 ? totalQuantity * currentPriceDisplay : 0
    const totalInvestedDisplay = totalBuyCostDisplay  // cost basis zbývajících kusů
    // Výnos = nerealizovaný (zbývající akcie) + realizovaný (prodané akcie)
    const totalReturnDisplay = (currentValueDisplay - totalInvestedDisplay) + realizedGainDisplay
    const totalReturnPct = totalEverInvestedDisplay > 0
      ? ((totalReturnDisplay + totalDividendsDisplay) / totalEverInvestedDisplay) * 100
      : 0

    // Pro zobrazení: originální cena v měně burzy
    let currentPriceExchange = priceLocal ?? (priceUsd ?? 0)
    if (asset.type === 'commodity' && asset.commodity_unit === 'g') {
      currentPriceExchange = currentPriceExchange / TROY_OZ_TO_GRAMS
    }

    return {
      ...asset,
      transactions: sorted,
      totalQuantity,
      avgBuyPriceDisplay,
      avgBuyPriceExchange,
      currentPriceUsd: priceUsd ?? 0,
      currentPriceExchange,
      priceCurrency,
      currentPriceDisplay,
      currentValueDisplay,
      totalInvestedDisplay,
      totalReturnDisplay,
      totalReturnPct,
      totalDividendsDisplay,
      dailyChangePct,
      priceSource: priceUsd !== null ? 'live' : 'no_price',
    }
  }

  // ── Manuální aktiva (nemovitosti, úspory, P2P…) ─────────────────────────
  let currentValueDisplay = 0
  let totalInvestedDisplay = 0
  let totalDividendsDisplay = 0
  let lastUpdateDate: string | undefined

  for (const tx of sorted) {
    if (tx.type === 'update') {
      currentValueDisplay = convertCurrency(tx.price, tx.currency, displayCurrency, rates)
      lastUpdateDate = tx.date
    } else if (tx.type === 'buy') {
      totalInvestedDisplay += convertCurrency(tx.price * tx.quantity, tx.currency, displayCurrency, rates)
    } else if (tx.type === 'dividend') {
      totalDividendsDisplay += convertCurrency(tx.price, tx.currency, displayCurrency, rates)
    }
  }

  // Bez 'update': použijeme poslední 'buy' jako aktuální hodnotu
  if (!lastUpdateDate) {
    const lastBuy = [...sorted].reverse().find((t) => t.type === 'buy')
    if (lastBuy) {
      currentValueDisplay = convertCurrency(lastBuy.price * lastBuy.quantity, lastBuy.currency, displayCurrency, rates)
      lastUpdateDate = lastBuy.date
      totalInvestedDisplay = currentValueDisplay
    }
  }

  const totalReturnDisplay = currentValueDisplay - totalInvestedDisplay
  const totalReturnPct = totalInvestedDisplay > 0
    ? ((totalReturnDisplay + totalDividendsDisplay) / totalInvestedDisplay) * 100
    : 0

  const isStale = lastUpdateDate
    ? (Date.now() - new Date(lastUpdateDate).getTime()) / 86400000 > 180
    : false

  return {
    ...asset,
    transactions: sorted,
    totalQuantity: 1,
    avgBuyPriceDisplay: totalInvestedDisplay,
    avgBuyPriceExchange: 0,
    currentPriceUsd: 0,
    currentPriceExchange: 0,
    priceCurrency: 'USD',
    currentPriceDisplay: currentValueDisplay,
    currentValueDisplay,
    totalInvestedDisplay,
    totalReturnDisplay,
    totalReturnPct,
    totalDividendsDisplay,
    dailyChangePct: null,
    lastUpdateDate,
    isStale,
    priceSource: lastUpdateDate ? 'manual' : 'no_price',
  }
}

// ─── Souhrn celého portfolia ─────────────────────────────────────────────────

export function calculatePortfolioSummary(
  assetsWithValues: AssetWithValue[],
  displayCurrency: Currency
): PortfolioSummary {
  let totalValueDisplay = 0
  let totalInvestedDisplay = 0
  let totalReturnDisplay = 0
  let totalDividendsDisplay = 0
  const bySectionId: Record<string, number> = {}

  for (const a of assetsWithValues) {
    totalValueDisplay += a.currentValueDisplay
    totalInvestedDisplay += a.totalInvestedDisplay
    totalReturnDisplay += a.totalReturnDisplay
    totalDividendsDisplay += a.totalDividendsDisplay
    bySectionId[a.section_id] = (bySectionId[a.section_id] ?? 0) + a.currentValueDisplay
  }

  const totalReturnPct = totalInvestedDisplay > 0
    ? ((totalReturnDisplay + totalDividendsDisplay) / totalInvestedDisplay) * 100
    : 0

  return {
    totalValueDisplay,
    totalInvestedDisplay,
    totalReturnDisplay,
    totalReturnPct,
    totalDividendsDisplay,
    bySectionId,
    displayCurrency,
  }
}

// ─── Souhrn jedné sekce ───────────────────────────────────────────────────────

export function calculateSectionSummary(
  section: Section,
  assetsWithValues: AssetWithValue[]
): SectionSummary {
  const sectionAssets = assetsWithValues.filter((a) => a.section_id === section.id)

  let totalValueDisplay = 0
  let totalInvestedDisplay = 0
  let totalReturnDisplay = 0
  let totalDividendsDisplay = 0

  for (const a of sectionAssets) {
    totalValueDisplay += a.currentValueDisplay
    totalInvestedDisplay += a.totalInvestedDisplay
    totalReturnDisplay += a.totalReturnDisplay
    totalDividendsDisplay += a.totalDividendsDisplay
  }

  const totalReturnPct = totalInvestedDisplay > 0
    ? ((totalReturnDisplay + totalDividendsDisplay) / totalInvestedDisplay) * 100
    : 0

  return {
    section,
    totalValueDisplay,
    totalInvestedDisplay,
    totalReturnDisplay,
    totalReturnPct,
    totalDividendsDisplay,
    assetCount: sectionAssets.length,
  }
}
