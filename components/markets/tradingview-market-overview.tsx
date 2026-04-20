'use client'

import { useEffect, useRef } from 'react'

export function TradingViewMarketOverview() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Vyčistit předchozí instance při re-mount
    containerRef.current.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    containerRef.current.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js'
    script.async = true
    script.type = 'text/javascript'

    const isDark = document.documentElement.classList.contains('dark')

    script.innerHTML = JSON.stringify({
      colorTheme: isDark ? 'dark' : 'light',
      dateRange: '12M',
      showChart: true,
      locale: 'en',
      width: '100%',
      height: 500,
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: false,
      tabs: [
        {
          title: 'Indexy',
          symbols: [
            { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
            { s: 'FOREXCOM:NSXUSD', d: 'Nasdaq 100' },
            { s: 'XETR:DAX',        d: 'DAX' },
            { s: 'LSE:UKX',         d: 'FTSE 100' },
            { s: 'PX1:PX1',         d: 'PX (Praha)' },
          ],
          originalTitle: 'Indices',
        },
        {
          title: 'Kurzy',
          symbols: [
            { s: 'FX:EURUSD', d: 'EUR/USD' },
            { s: 'FX:USDCZK', d: 'USD/CZK' },
            { s: 'FX:EURCZK', d: 'EUR/CZK' },
            { s: 'FX:GBPUSD', d: 'GBP/USD' },
            { s: 'FX:USDCAD', d: 'USD/CAD' },
          ],
          originalTitle: 'Forex',
        },
        {
          title: 'Komodity',
          symbols: [
            { s: 'COMEX:GC1!',  d: 'Zlato' },
            { s: 'COMEX:SI1!',  d: 'Stříbro' },
            { s: 'NYMEX:CL1!', d: 'Ropa WTI' },
            { s: 'NYMEX:NG1!', d: 'Zemní plyn' },
          ],
          originalTitle: 'Commodities',
        },
        {
          title: 'Krypto',
          symbols: [
            { s: 'BINANCE:BTCUSDT', d: 'Bitcoin' },
            { s: 'BINANCE:ETHUSDT', d: 'Ethereum' },
            { s: 'BINANCE:SOLUSDT', d: 'Solana' },
          ],
          originalTitle: 'Crypto',
        },
      ],
    })

    containerRef.current.appendChild(script)

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [])

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div ref={containerRef} className="tradingview-widget-container" />
    </div>
  )
}
