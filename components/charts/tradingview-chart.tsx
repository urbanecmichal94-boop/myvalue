'use client'

import { useEffect, useRef } from 'react'

interface TradingViewChartProps {
  ticker: string
  tvSymbol?: string   // vlastní override, např. "XETR:DTE"
  theme?: 'light' | 'dark'
}

// Mapování přípon Yahoo Finance → TradingView exchange prefix
const SUFFIX_MAP: Record<string, string> = {
  '.DE': 'XETR',
  '.L':  'LSE',
  '.PA': 'EURONEXT',
  '.MI': 'MIL',
  '.AS': 'EURONEXT',
  '.TO': 'TSX',
  '.AX': 'ASX',
  '.WA': 'GPW',
  '.PR': 'PSE',
  '.HK': 'HKEX',
  '.T':  'TSE',
  '.SW': 'SWX',
  '.ST': 'OMX',
  '.OL': 'OSL',
  '.CO': 'OMXCOP',
  '.HE': 'OMXHEX',
  '.BR': 'EURONEXT',
  '.MC': 'BME',
  '.LS': 'EURONEXT',
  '.VX': 'SIX',
}

// Crypto — přeložit na Binance USDT pair
const CRYPTO_MAP: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT', ETH: 'BINANCE:ETHUSDT', SOL: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT', XRP: 'BINANCE:XRPUSDT', ADA: 'BINANCE:ADAUSDT',
  DOGE: 'BINANCE:DOGEUSDT', AVAX: 'BINANCE:AVAXUSDT', DOT: 'BINANCE:DOTUSDT',
  MATIC: 'BINANCE:MATICUSDT', LINK: 'BINANCE:LINKUSDT', UNI: 'BINANCE:UNIUSDT',
}

function toTvSymbol(ticker: string): string {
  const upper = ticker.toUpperCase()
  if (CRYPTO_MAP[upper]) return CRYPTO_MAP[upper]

  // Najít nejdelší matching příponu
  for (const [suffix, exchange] of Object.entries(SUFFIX_MAP)) {
    if (ticker.endsWith(suffix)) {
      return `${exchange}:${ticker.slice(0, -suffix.length)}`
    }
  }

  // Žádná přípona — nechat TV hledat samo (funguje pro US tickery)
  return ticker
}

export function TradingViewChart({ ticker, tvSymbol, theme = 'dark' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = `tv_${ticker.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random().toString(36).slice(2, 7)}`

  useEffect(() => {
    if (!containerRef.current) return

    // Vyčistit předchozí widget
    containerRef.current.innerHTML = `<div id="${widgetId}" />`

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      if (typeof (window as unknown as Record<string, unknown>).TradingView === 'undefined') return
      const TV = (window as unknown as Record<string, { widget: new (opts: unknown) => unknown }>).TradingView
      new TV.widget({
        autosize: false,
        width: containerRef.current?.offsetWidth ?? 900,
        height: 500,
        symbol: tvSymbol ?? toTvSymbol(ticker),
        interval: 'D',
        timezone: 'Europe/Prague',
        theme,
        style: '1',          // svíčky
        locale: 'cs',
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        container_id: widgetId,
      })
    }

    containerRef.current.appendChild(script)

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [ticker, theme, widgetId])

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div ref={containerRef} style={{ height: 500 }} />
      <p className="text-[10px] text-muted-foreground text-right px-3 py-1">
        Graf poskytuje <a href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer" className="underline">TradingView</a>
      </p>
    </div>
  )
}
