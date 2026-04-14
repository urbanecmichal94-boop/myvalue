'use client'

import { useEffect, useRef } from 'react'

// ── Sdílený hook pro TV embed widgety (ne Advanced Chart) ─────────────────────

const TV_BASE = 'https://s3.tradingview.com/external-embedding/'

function useTvWidget(config: object, scriptName = 'embed-widget-runner.js') {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = TV_BASE + scriptName
    script.async = true
    script.innerHTML = JSON.stringify(config)
    containerRef.current.appendChild(script)

    return () => { if (containerRef.current) containerRef.current.innerHTML = '' }
  }, [JSON.stringify(config)])

  return containerRef
}

// ── Symbol Info ───────────────────────────────────────────────────────────────
// Zobrazí: aktuální cenu, denní změnu, 52W high/low, objem, tržní kap.

interface SymbolInfoProps {
  symbol: string
  theme?: 'light' | 'dark'
}

export function TvSymbolInfo({ symbol, theme = 'dark' }: SymbolInfoProps) {
  const ref = useTvWidget({
    symbol,
    width: '100%',
    locale: 'cs',
    dateRange: '12M',
    colorTheme: theme,
    isTransparent: false,
    largeChartUrl: '',
  }, 'embed-widget-symbol-info.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Technical Analysis ────────────────────────────────────────────────────────
// Buy/Sell/Neutral signál z 26 indikátorů (MA, oscillators)

interface TechAnalysisProps {
  symbol: string
  interval?: 'D' | 'W' | 'M' | '1h' | '4h'
  theme?: 'light' | 'dark'
}

export function TvTechnicalAnalysis({ symbol, interval = 'D', theme = 'dark' }: TechAnalysisProps) {
  const ref = useTvWidget({
    interval,
    width: '100%',
    isTransparent: false,
    height: 450,
    symbol,
    showIntervalTabs: true,
    displayMode: 'single',
    locale: 'cs',
    colorTheme: theme,
  }, 'embed-widget-technical-analysis.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Company Profile ───────────────────────────────────────────────────────────
// Popis firmy, sektor, odvětví, web, počet zaměstnanců

interface CompanyProfileProps {
  symbol: string
  theme?: 'light' | 'dark'
}

export function TvCompanyProfile({ symbol, theme = 'dark' }: CompanyProfileProps) {
  const ref = useTvWidget({
    width: '100%',
    height: 480,
    isTransparent: false,
    colorTheme: theme,
    symbol,
    locale: 'cs',
  }, 'embed-widget-company-profile.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Timeline (Novinky) ────────────────────────────────────────────────────────
// Zprávy a novinky k danému tickeru

interface TimelineProps {
  symbol: string
  theme?: 'light' | 'dark'
}

export function TvTimeline({ symbol, theme = 'dark' }: TimelineProps) {
  const ref = useTvWidget({
    feedMode: 'symbol',
    isTransparent: false,
    displayMode: 'regular',
    width: '100%',
    height: 550,
    colorTheme: theme,
    symbol,
    locale: 'en',
  }, 'embed-widget-timeline.js')
  return (
    <div key={symbol} className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Market Overview ───────────────────────────────────────────────────────────
// Přehled trhů — indexy, komodity, forex, krypto se sparkline grafy

export function TvMarketOverview({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const ref = useTvWidget({
    colorTheme: theme,
    dateRange: '12M',
    showChart: true,
    locale: 'cs',
    width: '100%',
    height: 660,
    isTransparent: false,
    showSymbolLogo: true,
    showFloatingTooltip: false,
    tabs: [
      {
        title: 'Indexy',
        symbols: [
          { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
          { s: 'FOREXCOM:NSXUSD', d: 'NASDAQ 100' },
          { s: 'FOREXCOM:DJI',    d: 'Dow Jones' },
          { s: 'INDEX:DEU40',     d: 'DAX 40' },
          { s: 'EURONEXT:PX',     d: 'PX (Praha)' },
          { s: 'CBOE:VIX',        d: 'VIX' },
        ],
        originalTitle: 'Indices',
      },
      {
        title: 'Komodity',
        symbols: [
          { s: 'CME_MINI:GC1!',  d: 'Zlato' },
          { s: 'CME:SI1!',       d: 'Stříbro' },
          { s: 'NYMEX:CL1!',     d: 'Ropa WTI' },
          { s: 'NYMEX:NG1!',     d: 'Zemní plyn' },
          { s: 'CBOT:ZW1!',      d: 'Pšenice' },
        ],
        originalTitle: 'Commodities',
      },
      {
        title: 'Forex',
        symbols: [
          { s: 'FX:EURUSD', d: 'EUR/USD' },
          { s: 'FX:GBPUSD', d: 'GBP/USD' },
          { s: 'FX:USDJPY', d: 'USD/JPY' },
          { s: 'FX:EURCHF', d: 'EUR/CHF' },
          { s: 'FX:EURCZK', d: 'EUR/CZK' },
          { s: 'FX:USDCZK', d: 'USD/CZK' },
        ],
        originalTitle: 'Forex',
      },
      {
        title: 'Crypto',
        symbols: [
          { s: 'CRYPTO:BTCUSD', d: 'Bitcoin' },
          { s: 'CRYPTO:ETHUSD', d: 'Ethereum' },
          { s: 'CRYPTO:SOLUSD', d: 'Solana' },
          { s: 'CRYPTO:XRPUSD', d: 'XRP' },
        ],
        originalTitle: 'Crypto',
      },
    ],
  }, 'embed-widget-market-overview.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Economic Calendar ─────────────────────────────────────────────────────────
// Kalendář makroekonomických událostí (CPI, NFP, FOMC, HDP...)

export function TvEconomicCalendar({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const ref = useTvWidget({
    colorTheme: theme,
    isTransparent: false,
    width: '100%',
    height: 650,
    locale: 'cs',
    importanceFilter: '-1,0,1,2',
    countryFilter: 'us,eu,gb,de,fr,jp,cn,cz,sk',
  }, 'embed-widget-events.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Crypto Market Screener ────────────────────────────────────────────────────
// Top krypto dle tržní kap., ceny, objemu, denní změny

export function TvCryptoMarket({ theme = 'dark' }: { theme?: 'light' | 'dark' }) {
  const ref = useTvWidget({
    width: '100%',
    height: 600,
    defaultColumn: 'overview',
    screener_type: 'crypto_mkt',
    displayCurrency: 'USD',
    colorTheme: theme,
    locale: 'cs',
  }, 'embed-widget-screener.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}

// ── Financials ────────────────────────────────────────────────────────────────
// Tržby, zisk, EPS, P/E — jen pro akcie

interface FinancialsProps {
  symbol: string
  theme?: 'light' | 'dark'
}

export function TvFinancials({ symbol, theme = 'dark' }: FinancialsProps) {
  const ref = useTvWidget({
    isTransparent: false,
    largeChartUrl: '',
    displayMode: 'regular',
    width: '100%',
    height: 480,
    colorTheme: theme,
    symbol,
    locale: 'cs',
  }, 'embed-widget-financials.js')
  return (
    <div className="tradingview-widget-container rounded-lg border bg-card overflow-hidden">
      <div className="tradingview-widget-container__widget" ref={ref} />
    </div>
  )
}
