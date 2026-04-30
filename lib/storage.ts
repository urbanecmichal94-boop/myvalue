import type { Asset, Transaction, Currency, Section, AssetType, SectionTemplate } from '@/types'
import { ASSET_TYPE_TO_TEMPLATE, TEMPLATE_LABELS } from '@/types'

// ─── Klíče v localStorage ────────────────────────────────────────────────────
const KEYS = {
  assets:               'pt_assets',
  transactions:         'pt_transactions',
  settings:             'pt_settings',
  sections:             'pt_sections',
  priceCache:           'pt_price_cache',
  currencyCache:        'pt_currency_cache',
  columnConfig:         'pt_column_config',
  priceHistory:         'pt_price_history',
  chartSections:        'pt_chart_sections',
  snapshots:            'pt_snapshots',
  dividendCache:        'pt_dividend_cache',
  macroCache:           'pt_macro_cache',
  fundamentalsCache:    'pt_fundamentals_cache',
  currencyRateHistory:  'pt_currency_rate_history',
} as const

// ─── Typy ────────────────────────────────────────────────────────────────────
export interface Settings {
  displayCurrency: Currency
  showPortfolioChart: boolean
  showAllocationChart: boolean
  showReserveWidget: boolean
  showPerformanceWidget: boolean
  showWinnersLosers: boolean
  showMarketOverview: boolean
  includePropertiesInDashboard: boolean
  performanceSectionIds: string[]   // prázdné pole = všechny auto sekce
  totalValueSectionIds: string[]    // prázdné pole = všechny sekce
}

export interface PriceCacheEntry {
  ticker: string
  priceUsd: number        // cena přepočtená na USD (pro kalkulace)
  priceLocal?: number     // originální cena v měně burzy (pro zobrazení)
  priceCurrency?: string  // měna burzy (EUR, USD, GBp...)
  dailyChangePct?: number
  updatedAt: string
}

// ─── Konfigurace sloupců tabulky ─────────────────────────────────────────────
export interface ColumnState {
  id: string
  visible: boolean
}

const DEFAULT_COLUMN_CONFIG: ColumnState[] = [
  { id: 'name',             visible: false },
  { id: 'price',            visible: true  },
  { id: 'daily_change',     visible: true  },
  { id: 'total_return_pct', visible: true  },
  { id: 'quantity',         visible: true  },
  { id: 'value',            visible: true  },
  { id: 'avg_buy',          visible: false },
  { id: 'avg_buy_price',    visible: false },
  { id: 'abs_return',       visible: false },
  { id: 'dividends',        visible: false },
  { id: 'weight',           visible: false },
  { id: 'sector',           visible: false },
  { id: 'industry',         visible: false },
  { id: 'country',          visible: false },
  { id: 'yoc',             visible: false },
]

export interface CurrencyCache {
  eurCzk: number
  eurUsd: number
  rates: Record<string, number>  // EUR-based sazby pro všechny měny (1 EUR = X měna)
  updatedAt: string
}

// ─── Dividendová cache ────────────────────────────────────────────────────────
export type DividendFrequency = 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'unknown'

export interface DividendEntry {
  exDate: string        // YYYY-MM-DD
  amount: number        // částka v originální měně
  currency: string      // USD, CAD, EUR...
}

export interface DividendCacheEntry {
  ticker: string
  dividends: DividendEntry[]
  frequency: DividendFrequency
  updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

// ─── Nastavení ───────────────────────────────────────────────────────────────
export function getSettings(): Settings {
  const s = load<Partial<Settings>>(KEYS.settings, {})
  return { displayCurrency: 'CZK', showPortfolioChart: true, showAllocationChart: true, showReserveWidget: true, showPerformanceWidget: true, showWinnersLosers: false, showMarketOverview: false, includePropertiesInDashboard: true, performanceSectionIds: [], totalValueSectionIds: [], ...s }
}

export function saveSettings(settings: Settings): void {
  save(KEYS.settings, settings)
}

// ─── Sekce ───────────────────────────────────────────────────────────────────
export function getSections(): Section[] {
  return load<Section[]>(KEYS.sections, [])
}

export function saveSection(section: Section): void {
  const sections = getSections()
  const index = sections.findIndex((s) => s.id === section.id)
  if (index >= 0) {
    sections[index] = section
  } else {
    sections.push(section)
  }
  save(KEYS.sections, sections)
}

export function deleteSection(id: string): void {
  const sections = getSections().filter((s) => s.id !== id)
  save(KEYS.sections, sections)
}

// ─── Aktiva ──────────────────────────────────────────────────────────────────
export function getAssets(sectionId?: string): Asset[] {
  const all = load<Asset[]>(KEYS.assets, [])
  if (sectionId) return all.filter((a) => a.section_id === sectionId)
  return all
}

export function saveAsset(asset: Asset): void {
  const assets = getAssets()
  const index = assets.findIndex((a) => a.id === asset.id)
  if (index >= 0) {
    assets[index] = asset
  } else {
    assets.push(asset)
  }
  save(KEYS.assets, assets)
}

export function deleteAsset(id: string): void {
  const assets = getAssets().filter((a) => a.id !== id)
  save(KEYS.assets, assets)
  // Smazat také všechny transakce tohoto aktiva
  const transactions = getTransactions().filter((t) => t.asset_id !== id)
  save(KEYS.transactions, transactions)
}

// ─── Transakce ───────────────────────────────────────────────────────────────
export function getTransactions(assetId?: string): Transaction[] {
  const all = load<Transaction[]>(KEYS.transactions, [])
  if (assetId) return all.filter((t) => t.asset_id === assetId)
  return all
}

export function saveTransaction(tx: Transaction): void {
  const transactions = getTransactions()
  const index = transactions.findIndex((t) => t.id === tx.id)
  if (index >= 0) {
    transactions[index] = tx
  } else {
    transactions.push(tx)
  }
  save(KEYS.transactions, transactions)
}

export function deleteTransaction(id: string): void {
  const transactions = getTransactions().filter((t) => t.id !== id)
  save(KEYS.transactions, transactions)
}

// ─── Cache cen ───────────────────────────────────────────────────────────────
export function getPriceCache(): Record<string, PriceCacheEntry> {
  return load<Record<string, PriceCacheEntry>>(KEYS.priceCache, {})
}

export function savePriceCache(cache: Record<string, PriceCacheEntry>): void {
  save(KEYS.priceCache, cache)
}

export function isPriceCacheValid(entry: PriceCacheEntry, ttlMinutes = 15): boolean {
  const age = (Date.now() - new Date(entry.updatedAt).getTime()) / 1000 / 60
  return age < ttlMinutes
}

// ─── Cache měnových kurzů ────────────────────────────────────────────────────
export function getCurrencyCache(): CurrencyCache | null {
  return load<CurrencyCache | null>(KEYS.currencyCache, null)
}

export function saveCurrencyCache(cache: CurrencyCache): void {
  save(KEYS.currencyCache, cache)
}

export function isCurrencyCacheValid(cache: CurrencyCache, ttlHours = 12): boolean {
  const age = (Date.now() - new Date(cache.updatedAt).getTime()) / 1000 / 60 / 60
  return age < ttlHours
}

// ─── Cache fundamentálních dat ───────────────────────────────────────────────

import type { FundamentalsData } from '@/app/api/fundamentals/route'

export interface FundamentalsCacheEntry {
  ticker: string
  data: FundamentalsData
  updatedAt: string
}

export function getFundamentalsCache(): Record<string, FundamentalsCacheEntry> {
  return load<Record<string, FundamentalsCacheEntry>>(KEYS.fundamentalsCache, {})
}

export function saveFundamentalsCache(cache: Record<string, FundamentalsCacheEntry>): void {
  save(KEYS.fundamentalsCache, cache)
}

export function isFundamentalsCacheValid(entry: FundamentalsCacheEntry, ttlHours = 24): boolean {
  const age = (Date.now() - new Date(entry.updatedAt).getTime()) / 1000 / 60 / 60
  return age < ttlHours
}

// ─── Konfigurace sloupců ─────────────────────────────────────────────────────
export function getColumnConfig(): ColumnState[] {
  const saved = load<ColumnState[]>(KEYS.columnConfig, DEFAULT_COLUMN_CONFIG)
  // Přidat nové sloupce které ještě nejsou uloženy
  const missing = DEFAULT_COLUMN_CONFIG.filter((d) => !saved.find((s) => s.id === d.id))
  return missing.length > 0 ? [...saved, ...missing] : saved
}

export function saveColumnConfig(config: ColumnState[]): void {
  save(KEYS.columnConfig, config)
}

export function resetColumnConfig(): void {
  save(KEYS.columnConfig, DEFAULT_COLUMN_CONFIG)
}

// ─── Historické ceny ─────────────────────────────────────────────────────────

export interface TickerHistory {
  currency: string                  // měna burzy (EUR, USD, CAD...)
  months: Record<string, number>    // YYYY-MM → cena v měně burzy
  updatedAt: string
}

export function getPriceHistory(): Record<string, TickerHistory> {
  return load<Record<string, TickerHistory>>(KEYS.priceHistory, {})
}

export function savePriceHistory(history: Record<string, TickerHistory>): void {
  save(KEYS.priceHistory, history)
}

export function isPriceHistoryValid(entry: TickerHistory, ttlHours = 24): boolean {
  const age = (Date.now() - new Date(entry.updatedAt).getTime()) / 1000 / 60 / 60
  return age < ttlHours
}

// ─── Nastavení grafu — viditelné sekce ───────────────────────────────────────

export function getChartSectionFilter(): string[] | null {
  return load<string[] | null>(KEYS.chartSections, null)
}

export function saveChartSectionFilter(sectionIds: string[]): void {
  save(KEYS.chartSections, sectionIds)
}

// ─── Snapshots portfolia ─────────────────────────────────────────────────────

export interface PortfolioSnapshot {
  date: string    // YYYY-MM-DD
  value: number   // celková hodnota v zobrazovací měně
  currency: Currency
}

export function getSnapshots(): PortfolioSnapshot[] {
  return load<PortfolioSnapshot[]>(KEYS.snapshots, [])
}

export function addSnapshot(snapshot: PortfolioSnapshot): void {
  const all = getSnapshots()
  const idx = all.findIndex((s) => s.date === snapshot.date)
  if (idx >= 0) {
    all[idx] = snapshot  // aktualizovat dnešní snapshot
  } else {
    all.push(snapshot)
    all.sort((a, b) => a.date.localeCompare(b.date))
  }
  save(KEYS.snapshots, all)
}

// ─── UUID helper ─────────────────────────────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID()
}

// ─── Migrace starých dat (aktiva bez section_id) ─────────────────────────────
// Spustit jednou při načtení aplikace — přiřadí orphaned aktiva do sekcí dle typu
export function migrateOrphanedAssets(): void {
  if (typeof window === 'undefined') return

  // Načíst raw data — starší aktiva mohou mít section_id jako undefined
  const rawAssets = load<Array<Asset & { section_id?: string }>>(KEYS.assets, [])
  const orphaned = rawAssets.filter((a) => !a.section_id)
  if (orphaned.length === 0) return

  const sections = getSections()

  // Skupiny dle AssetType → template
  const templateGroups = new Map<SectionTemplate, Array<Asset & { section_id?: string }>>()
  for (const asset of orphaned) {
    const template = ASSET_TYPE_TO_TEMPLATE[asset.type as AssetType] ?? 'custom'
    const arr = templateGroups.get(template) ?? []
    arr.push(asset)
    templateGroups.set(template, arr)
  }

  for (const [template, assets] of templateGroups) {
    // Najít existující sekci s tímto templatem, nebo vytvořit novou
    let section = sections.find((s) => s.template === template)
    if (!section) {
      section = {
        id: generateId(),
        name: TEMPLATE_LABELS[template],
        template,
        created_at: new Date().toISOString(),
      }
      sections.push(section)
      saveSection(section)
    }
    // Přiřadit section_id
    for (const asset of assets) {
      saveAsset({ ...asset, section_id: section.id } as Asset)
    }
  }
}

// ─── Dividendová cache ────────────────────────────────────────────────────────

type DividendCache = Record<string, DividendCacheEntry>

export function getDividendCache(): DividendCache {
  return load<DividendCache>(KEYS.dividendCache, {})
}

export function saveDividendCacheEntry(entry: DividendCacheEntry): void {
  const cache = getDividendCache()
  cache[entry.ticker] = entry
  save(KEYS.dividendCache, cache)
}

export function isDividendCacheValid(entry: DividendCacheEntry): boolean {
  const updatedAt = new Date(entry.updatedAt).getTime()
  const now = Date.now()
  const daysSince = (now - updatedAt) / (1000 * 60 * 60 * 24)

  const ttlDays: Record<DividendFrequency, number> = {
    monthly:     25,
    quarterly:   80,
    'semi-annual': 170,
    annual:      350,
    unknown:     30,
  }

  return daysSince < ttlDays[entry.frequency]
}


// ─── Historické měnové kurzy ──────────────────────────────────────────────────
// Sdílená struktura — 1 EUR = X dané měny, per měsíc (YYYY-MM)

export interface CurrencyRateHistory {
  months: Record<string, Record<string, number>>  // YYYY-MM → { CZK: 25.1, USD: 1.08, ... }
  updatedAt: string
}

export function getCurrencyRateHistory(): CurrencyRateHistory | null {
  return load<CurrencyRateHistory | null>(KEYS.currencyRateHistory, null)
}

export function saveCurrencyRateHistory(history: CurrencyRateHistory): void {
  save(KEYS.currencyRateHistory, history)
}

export function isCurrencyRateHistoryValid(history: CurrencyRateHistory, ttlHours = 168): boolean {
  const age = (Date.now() - new Date(history.updatedAt).getTime()) / 1000 / 60 / 60
  return age < ttlHours
}

// ─── Makro cache ──────────────────────────────────────────────────────────────

export interface MacroCache {
  cnb?: {
    eurCzk: number
    usdCzk: number
    repoRate: number
    date: string
    updatedAt: string
  }
  markets?: {
    oilWti: number | null
    oilBrent: number | null
    bond10yUs: number | null
    date: string
    updatedAt: string
  }
}

export function getMacroCache(): MacroCache {
  return load<MacroCache>(KEYS.macroCache, {})
}

export function saveMacroCache(cache: MacroCache): void {
  save(KEYS.macroCache, cache)
}

// TTL: ČNB kurzy 6h, trhy 2h
export function isMacroCacheValid(updatedAt: string, ttlHours: number): boolean {
  const age = (Date.now() - new Date(updatedAt).getTime()) / 1000 / 60 / 60
  return age < ttlHours
}
