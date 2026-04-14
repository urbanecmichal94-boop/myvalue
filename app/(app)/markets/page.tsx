'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, TrendingUp, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TradingViewChart } from '@/components/charts/tradingview-chart'
import {
  TvSymbolInfo,
  TvCryptoMarket,
} from '@/components/charts/tradingview-widgets'
import { NewsWidget } from '@/components/markets/news-widget'
import {
  getFundamentalsCache,
  saveFundamentalsCache,
  isFundamentalsCacheValid,
} from '@/lib/storage'
import type { FundamentalsData } from '@/app/api/fundamentals/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined, decimals = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtLarge(n: number | undefined): string {
  if (n == null) return '—'
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' B'
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + ' mld'
  if (n >= 1e6)  return (n / 1e6).toFixed(1) + ' mil'
  return n.toLocaleString('cs-CZ')
}

function fmtPct(n: number | undefined): string {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + ' %'
}

// ── Rychlé zkratky ────────────────────────────────────────────────────────────

const QUICK_TICKERS = [
  { label: 'S&P 500',  symbol: 'SPY'    },
  { label: 'NASDAQ',   symbol: 'QQQ'    },
  { label: 'Bitcoin',  symbol: 'BTCUSD' },
  { label: 'Gold',     symbol: 'XAUUSD' },
  { label: 'Apple',    symbol: 'AAPL'   },
  { label: 'NVIDIA',   symbol: 'NVDA'   },
  { label: 'Tesla',    symbol: 'TSLA'   },
  { label: 'EUR/USD',  symbol: 'EURUSD' },
]

type Tab = 'chart' | 'fundamentals' | 'news' | 'crypto'

// ── Karta metriky ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div className="relative group rounded-lg border bg-card p-3 text-xs cursor-default">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold text-sm">{value}</p>
      {sub && <p className="text-muted-foreground text-[11px] mt-0.5">{sub}</p>}
      {tooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
          w-52 rounded-md border bg-popover px-3 py-2 text-[11px] text-popover-foreground shadow-md
          opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      )}
    </div>
  )
}

// ── Hlavní stránka ────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const t = useTranslations('markets')

  const [input,       setInput]       = useState('')
  const [symbol,      setSymbol]      = useState('AAPL')
  const [activeTab,   setActiveTab]   = useState<Tab>('chart')
  const [fundData,    setFundData]    = useState<FundamentalsData | null>(null)
  const [fundLoading, setFundLoading] = useState(false)
  const [price,       setPrice]       = useState<{ value: number; change: number; currency: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchFundamentals = useCallback(async (ticker: string) => {
    const cache = getFundamentalsCache()
    const cached = cache[ticker]
    if (cached && isFundamentalsCacheValid(cached)) {
      setFundData(cached.data)
      return
    }

    setFundLoading(true)
    setFundData(null)
    try {
      const res = await fetch(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json() as { data: FundamentalsData }
      setFundData(json.data)
      saveFundamentalsCache({
        ...getFundamentalsCache(),
        [ticker]: { ticker, data: json.data, updatedAt: new Date().toISOString() },
      })
    } catch {
      setFundData(null)
    } finally {
      setFundLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFundamentals(symbol)
    setPrice(null)
    fetch(`/api/prices?tickers=${encodeURIComponent(symbol)}&type=stock`)
      .then((r) => r.json())
      .then((d: { prices?: Record<string, number>; dailyChanges?: Record<string, number>; currencies?: Record<string, string> }) => {
        const value = d.prices?.[symbol]
        if (value) setPrice({
          value,
          change: d.dailyChanges?.[symbol] ?? 0,
          currency: d.currencies?.[symbol] ?? 'USD',
        })
      })
      .catch(() => {})
  }, [symbol, fetchFundamentals])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const val = input.trim().toUpperCase()
    if (val) { setSymbol(val); setInput('') }
  }

  function handleQuick(sym: string) {
    setSymbol(sym)
    setActiveTab('chart')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chart',        label: t('tabChart') },
    { id: 'fundamentals', label: t('tabFundamentals') },
    { id: 'news',         label: t('tabNews') },
    { id: 'crypto',       label: t('tabCrypto') },
  ]

  return (
    <div className="p-6 max-w-7xl space-y-5">

      {/* Hlavička */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" /> {t('title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      {/* Vyhledávání */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
            {t('searchBtn')}
          </button>
        </form>

        {/* Rychlé zkratky */}
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_TICKERS.map((q) => (
            <button
              key={q.symbol}
              onClick={() => handleQuick(q.symbol)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors
                ${symbol === q.symbol
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aktivní symbol + název + cena */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-xl font-bold font-mono">{symbol}</span>
        {fundData?.name && (
          <span className="text-sm text-muted-foreground">{fundData.name}</span>
        )}
        {fundData?.sector && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{fundData.sector}</span>
        )}
        {price && (
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">
              {price.value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-muted-foreground ml-1">{price.currency}</span>
            </span>
            <span className={`text-sm font-medium tabular-nums ${price.change >= 0 ? 'text-green-500' : 'text-red-400'}`}>
              {price.change >= 0 ? '+' : ''}{price.change.toFixed(2)} %
            </span>
          </div>
        )}
      </div>

      {/* Symbol Info widget — vždy nahoře */}
      <TvSymbolInfo symbol={symbol} theme="dark" />

      {/* Záložky */}
      <div className="flex gap-0 border-b overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px
              ${activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Graf */}
      {activeTab === 'chart' && (
        <TradingViewChart ticker={symbol} theme="dark" />
      )}

      {/* Fundamenty */}
      {activeTab === 'fundamentals' && (
        <div className="space-y-4">
          {fundLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">{t('fundamentalsLoading')}</div>
          )}
          {!fundLoading && !fundData && (
            <div className="text-sm text-muted-foreground py-8 text-center">{t('fundamentalsUnavailable')}</div>
          )}
          {!fundLoading && fundData && (
            <>
              {/* Valuace */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('sectionValuation')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label={t('marketCap')}   value={fmtLarge(fundData.marketCap)} sub={fundData.currency} tooltip={t('marketCapTooltip')} />
                  <MetricCard label={t('peTrailing')}  value={fmtNum(fundData.peRatio)}     tooltip={t('peTrailingTooltip')} />
                  <MetricCard label={t('peForward')}   value={fmtNum(fundData.forwardPE)}   tooltip={t('peForwardTooltip')} />
                  <MetricCard label={t('eps')}         value={fundData.eps != null ? fmtNum(fundData.eps) + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('epsTooltip')} />
                  <MetricCard label={t('priceToBook')} value={fmtNum(fundData.priceToBook)} tooltip={t('priceToBookTooltip')} />
                </div>
              </div>

              {/* Dividendy */}
              {(fundData.dividendYield != null || fundData.dividendRate != null) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('sectionDividends')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard label={t('dividendYield')} value={fmtPct(fundData.dividendYield)} tooltip={t('dividendYieldTooltip')} />
                    <MetricCard label={t('dividendRate')}  value={fundData.dividendRate != null ? fmtNum(fundData.dividendRate) + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('dividendRateTooltip')} />
                    <MetricCard label={t('payoutRatio')}   value={fmtPct(fundData.payoutRatio)}   tooltip={t('payoutRatioTooltip')} />
                  </div>
                </div>
              )}

              {/* Cena */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('sectionPrice')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label={t('week52High')} value={fundData.fiftyTwoWeekHigh      != null ? fmtNum(fundData.fiftyTwoWeekHigh)      + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('week52HighTooltip')} />
                  <MetricCard label={t('week52Low')}  value={fundData.fiftyTwoWeekLow       != null ? fmtNum(fundData.fiftyTwoWeekLow)       + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('week52LowTooltip')} />
                  <MetricCard label={t('ma50')}       value={fundData.fiftyDayAverage       != null ? fmtNum(fundData.fiftyDayAverage)       + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('ma50Tooltip')} />
                  <MetricCard label={t('ma200')}      value={fundData.twoHundredDayAverage  != null ? fmtNum(fundData.twoHundredDayAverage)  + ' ' + (fundData.currency ?? '') : '—'} tooltip={t('ma200Tooltip')} />
                </div>
              </div>

              {/* Zdraví firmy */}
              {(fundData.freeCashflow != null || fundData.returnOnEquity != null || fundData.debtToEquity != null || fundData.beta != null || fundData.profitMargin != null || fundData.revenueGrowth != null) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('sectionHealth')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {fundData.freeCashflow   != null && <MetricCard label={t('freeCashflow')}  value={fmtLarge(fundData.freeCashflow)}  sub={fundData.currency} tooltip={t('freeCashflowTooltip')} />}
                    {fundData.returnOnEquity != null && <MetricCard label={t('roe')}           value={fmtPct(fundData.returnOnEquity)}  tooltip={t('roeTooltip')} />}
                    {fundData.debtToEquity   != null && <MetricCard label={t('debtToEquity')}  value={fmtNum(fundData.debtToEquity)}    tooltip={t('debtToEquityTooltip')} />}
                    {fundData.beta           != null && <MetricCard label={t('beta')}          value={fmtNum(fundData.beta)}            tooltip={t('betaTooltip')} />}
                    {fundData.profitMargin   != null && <MetricCard label={t('profitMargin')}  value={fmtPct(fundData.profitMargin)}    tooltip={t('profitMarginTooltip')} />}
                    {fundData.revenueGrowth  != null && <MetricCard label={t('revenueGrowth')} value={fmtPct(fundData.revenueGrowth)}   tooltip={t('revenueGrowthTooltip')} />}
                  </div>
                </div>
              )}

              {/* Popis */}
              {fundData.description && (
                <div className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {fundData.sector   && <span>📂 {fundData.sector}</span>}
                    {fundData.industry && <span>🏭 {fundData.industry}</span>}
                    {fundData.country  && <span>🌍 {fundData.country}</span>}
                    {fundData.employees && <span>👥 {t('employees', { count: fundData.employees.toLocaleString('cs-CZ') })}</span>}
                    {fundData.website  && (
                      <a href={fundData.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> Web
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-5">
                    {fundData.description}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Novinky */}
      {activeTab === 'news' && (
        <NewsWidget symbol={symbol} />
      )}

      {/* Krypto trh */}
      {activeTab === 'crypto' && (
        <TvCryptoMarket theme="dark" />
      )}

    </div>
  )
}
