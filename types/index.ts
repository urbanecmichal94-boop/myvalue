// ─── Základní typy ───────────────────────────────────────────────────────────

export type Currency = 'CZK' | 'EUR' | 'USD'

export type AssetType =
  | 'stock'       // Akcie / ETF (sjednoceno)
  | 'etf'         // ETF (zachováno pro zpětnou kompatibilitu)
  | 'crypto'      // Krypto
  | 'commodity'   // Komodity (zlato, stříbro, platina, palladium)
  | 'real_estate' // Nemovitosti
  | 'savings'     // Úspory / Hotovost
  | 'pension'     // Penzijní spoření
  | 'bond'        // Dluhopisy
  | 'p2p'         // P2P půjčky
  | 'custom'      // Vlastní

export type TransactionType =
  | 'buy'       // Nákup
  | 'sell'      // Prodej
  | 'dividend'  // Dividenda / výnos
  | 'update'    // Aktualizace hodnoty (pro manuální aktiva)

export type CommodityUnit = 'g' | 'oz' // gramy nebo trojské unce

export type CommodityId = 'XAU' | 'XAG' | 'XPT' | 'XPD'

// ─── Sekce (portfolia) ────────────────────────────────────────────────────────

export type SectionTemplate =
  | 'stocks'       // Akcie + ETF (auto ceny Yahoo Finance)
  | 'crypto'       // Krypto (auto ceny CoinGecko)
  | 'commodity'    // Komodity (auto ceny Yahoo futures)
  | 'real_estate'  // Nemovitosti (manuální)
  | 'savings'      // Úspory (manuální)
  | 'pension'      // Penzijko (manuální)
  | 'bond'         // Dluhopisy (manuální)
  | 'p2p'          // P2P (manuální)
  | 'custom'       // Vlastní (manuální)

export interface Section {
  id: string
  name: string
  template: SectionTemplate
  created_at: string
}

// Předvolby sekcí pro výběr při vytváření
export const SECTION_PRESETS: Array<{ name: string; template: SectionTemplate }> = [
  { name: 'Akcie',             template: 'stocks'      },
  { name: 'Růstové akcie',     template: 'stocks'      },
  { name: 'Dividendové akcie', template: 'stocks'      },
  { name: 'ETFs',              template: 'stocks'      },
  { name: 'Krypto',            template: 'crypto'      },
  { name: 'Komodity',          template: 'commodity'   },
  { name: 'Nemovitosti',       template: 'real_estate' },
  { name: 'Úspory',            template: 'savings'     },
  { name: 'Penzijko',          template: 'pension'     },
  { name: 'Dluhopisy',         template: 'bond'        },
  { name: 'P2P',               template: 'p2p'         },
]

export const TEMPLATE_LABELS: Record<SectionTemplate, string> = {
  stocks:      'Akcie/ETF',
  crypto:      'Krypto',
  commodity:   'Komodity',
  real_estate: 'Nemovitosti',
  savings:     'Úspory',
  pension:     'Penzijko',
  bond:        'Dluhopisy',
  p2p:         'P2P',
  custom:      'Vlastní',
}

export const TEMPLATE_COLORS: Record<SectionTemplate, string> = {
  stocks:      '#3b82f6',
  crypto:      '#f59e0b',
  commodity:   '#10b981',
  real_estate: '#ef4444',
  savings:     '#8b5cf6',
  pension:     '#ec4899',
  bond:        '#14b8a6',
  p2p:         '#f97316',
  custom:      '#6b7280',
}

// Zda sekce používá automatické ceny z API
export const TEMPLATE_IS_AUTO: Record<SectionTemplate, boolean> = {
  stocks:      true,
  crypto:      true,
  commodity:   true,
  real_estate: false,
  savings:     false,
  pension:     false,
  bond:        false,
  p2p:         false,
  custom:      false,
}

// Výchozí AssetType při přidávání do sekce
export const TEMPLATE_ASSET_TYPE: Record<SectionTemplate, AssetType> = {
  stocks:      'stock',
  crypto:      'crypto',
  commodity:   'commodity',
  real_estate: 'real_estate',
  savings:     'savings',
  pension:     'pension',
  bond:        'bond',
  p2p:         'p2p',
  custom:      'custom',
}

// Typ dotazu na search API dle šablony
export const TEMPLATE_SEARCH_TYPE: Partial<Record<SectionTemplate, string>> = {
  stocks:    'stock',
  crypto:    'crypto',
  commodity: 'commodity',
}

// Mapování AssetType → SectionTemplate (pro migraci)
export const ASSET_TYPE_TO_TEMPLATE: Record<AssetType, SectionTemplate> = {
  stock:       'stocks',
  etf:         'stocks',
  crypto:      'crypto',
  commodity:   'commodity',
  real_estate: 'real_estate',
  savings:     'savings',
  pension:     'pension',
  bond:        'bond',
  p2p:         'p2p',
  custom:      'custom',
}

// ─── Aktiva ──────────────────────────────────────────────────────────────────

export interface Asset {
  id: string
  section_id: string            // ID sekce ke které aktivum patří
  type: AssetType
  name: string
  ticker?: string               // Pro auto aktiva: AAPL, bitcoin, XAU...
  currency: Currency            // Výchozí měna aktiva
  commodity_unit?: CommodityUnit // Jen pro komodity: 'g' nebo 'oz'
  commodity_form?: 'physical' | 'etf' | 'futures' // Forma držení komodity (ovlivňuje daňový test)
  notes?: string
  created_at: string            // ISO datetime
  // Metadata (jen pro stock/etf, načtena jednorázově z Yahoo Finance)
  sector?: string               // "Technology"
  industry?: string             // "Consumer Electronics"
  country?: string              // "United States"
  tradingview_symbol?: string   // Vlastní TV symbol, např. "XETR:DTE" (přepíše automatiku)
}

// ─── Transakce ───────────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  asset_id: string
  date: string             // YYYY-MM-DD
  type: TransactionType
  quantity: number         // Množství kusů / gramů / uncí (pro update/dividend: 0)
  price: number            // Cena za kus (buy/sell) nebo celková hodnota (update/dividend)
  currency: Currency       // Měna transakce
  notes?: string
  created_at: string       // ISO datetime
}

// ─── Výsledek výpočtů ────────────────────────────────────────────────────────

export interface AssetWithValue extends Asset {
  transactions: Transaction[]
  totalQuantity: number           // Celkové množství v držení
  avgBuyPriceDisplay: number      // Průměrná nákupní cena v zobrazovací měně
  avgBuyPriceExchange: number     // Průměrná nákupní cena v měně burzy (CAD, EUR…)
  currentPriceUsd: number         // Aktuální cena v USD (z API, po přepočtu)
  currentPriceExchange: number    // Aktuální cena v měně burzy (pro zobrazení)
  priceCurrency: string           // Měna burzy (EUR, USD, GBp...)
  currentPriceDisplay: number     // Aktuální cena v zobrazovací měně
  currentValueDisplay: number     // Celková hodnota v zobrazovací měně
  totalInvestedDisplay: number    // Celkem investováno v zobrazovací měně
  totalReturnDisplay: number      // Celkový výnos v zobrazovací měně
  totalReturnPct: number          // Výnos v %
  totalDividendsDisplay: number   // Celkové dividendy v zobrazovací měně
  dailyChangePct: number | null   // Denní změna v % (z burzy)
  lastUpdateDate?: string         // Datum poslední aktualizace (manuální aktiva)
  isStale?: boolean               // Neaktualizováno > 6 měsíců
  priceSource: 'live' | 'manual' | 'no_price'
}

export interface SectionSummary {
  section: Section
  totalValueDisplay: number
  totalInvestedDisplay: number
  totalReturnDisplay: number
  totalReturnPct: number
  totalDividendsDisplay: number
  assetCount: number
}

export interface PortfolioSummary {
  totalValueDisplay: number
  totalInvestedDisplay: number
  totalReturnDisplay: number
  totalReturnPct: number
  totalDividendsDisplay: number
  bySectionId: Record<string, number>  // section_id → aktuální hodnota
  displayCurrency: Currency
}

// ─── Komodity — mapování ─────────────────────────────────────────────────────

export const COMMODITY_INFO: Record<CommodityId, { name: string; yahooTicker: string }> = {
  XAU: { name: 'Zlato',     yahooTicker: 'GC=F' },
  XAG: { name: 'Stříbro',   yahooTicker: 'SI=F' },
  XPT: { name: 'Platina',   yahooTicker: 'PL=F' },
  XPD: { name: 'Palladium', yahooTicker: 'PA=F' },
}

export const TROY_OZ_TO_GRAMS = 31.1035

// ─── Popisky ─────────────────────────────────────────────────────────────────

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock:       'Akcie / ETF',
  etf:         'ETF',
  crypto:      'Krypto',
  commodity:   'Komodity',
  real_estate: 'Nemovitosti',
  savings:     'Úspory',
  pension:     'Penzijko',
  bond:        'Dluhopisy',
  p2p:         'P2P půjčky',
  custom:      'Vlastní',
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  buy:      'Nákup',
  sell:     'Prodej',
  dividend: 'Dividenda',
  update:   'Aktualizace hodnoty',
}

export const AUTO_ASSET_TYPES: AssetType[] = ['stock', 'etf', 'crypto', 'commodity']
export const MANUAL_ASSET_TYPES: AssetType[] = ['real_estate', 'savings', 'pension', 'bond', 'p2p', 'custom']

export const CURRENCIES: Currency[] = ['CZK', 'EUR', 'USD']

export const CURRENCY_LABELS: Record<Currency, string> = {
  CZK: 'CZK (Kč)',
  EUR: 'EUR (€)',
  USD: 'USD ($)',
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CZK: 'Kč',
  EUR: '€',
  USD: '$',
}

// Přesnost množství podle typu aktiva
export const QUANTITY_DECIMALS: Record<AssetType, number> = {
  stock:       3,
  etf:         3,
  crypto:      8,
  commodity:   4,
  real_estate: 0,
  savings:     2,
  pension:     2,
  bond:        2,
  p2p:         2,
  custom:      2,
}
