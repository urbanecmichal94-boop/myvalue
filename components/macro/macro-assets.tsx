'use client'

import { useTranslations } from 'next-intl'
import { ChartCard } from '@/components/macro/historical-chart-card'
import { US_GOLD, SP500 } from '@/data/historical/usa'
import {
  SILVER, COPPER, OIL_WTI, NATURAL_GAS,
  BITCOIN, ETHEREUM, NASDAQ100, MSCI_WORLD, MSCI_EM, PX_INDEX,
} from '@/data/historical/assets'

export function MacroAssets() {
  const t = useTranslations('macro')

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">{t('assetsNote')}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title={t('chartGold')}
          source="World Gold Council / Kitco (1920–2025)"
          unit="USD/oz"
          color="#eab308"
          data={US_GOLD}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('chartGoldNote')}
        />
        <ChartCard
          title={t('assetSilver')}
          source="LBMA / Silver Institute (1920–2025)"
          unit="USD/oz"
          color="#94a3b8"
          data={SILVER}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('assetSilverNote')}
        />
        <ChartCard
          title={t('assetCopper')}
          source="LME / COMEX — roční průměr (1960–2025)"
          unit="USD/lb"
          color="#b45309"
          data={COPPER}
          area={true}
          showCagr={true}
          note={t('assetCopperNote')}
        />
        <ChartCard
          title={t('assetOilWti')}
          source="EIA / FRED — WTI Cushing roční průměr (1946–2025)"
          unit="USD/bbl"
          color="#78716c"
          data={OIL_WTI}
          area={true}
          note={t('assetOilNote')}
        />
        <ChartCard
          title={t('assetNaturalGas')}
          source="EIA — Henry Hub spot, roční průměr (1990–2025)"
          unit="USD/MMBtu"
          color="#0ea5e9"
          data={NATURAL_GAS}
          area={true}
          note={t('assetNaturalGasNote')}
        />
        <ChartCard
          title={t('assetBitcoin')}
          source="CoinGecko / CMC — závěrová cena 31. 12. (2010–2025)"
          unit="USD"
          color="#f97316"
          data={BITCOIN}
          logScale={true}
          defaultLog={false}
          area={true}
          showCagr={true}
          note={t('assetBitcoinNote')}
        />
        <ChartCard
          title={t('assetEthereum')}
          source="CoinGecko / CMC — závěrová cena 31. 12. (2015–2025)"
          unit="USD"
          color="#8b5cf6"
          data={ETHEREUM}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('assetEthereumNote')}
        />
        <ChartCard
          title={t('chartSP500')}
          source="Robert Shiller / Yale (1928–2025)"
          unit="body"
          color="#3b82f6"
          data={SP500}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('chartSP500Note')}
        />
        <ChartCard
          title={t('assetNasdaq')}
          source="Nasdaq — závěrová hodnota 31. 12. (1985–2025)"
          unit="body"
          color="#22c55e"
          data={NASDAQ100}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('assetNasdaqNote')}
        />
        <ChartCard
          title={t('assetMsciWorld')}
          source="MSCI World Price Return USD (1970–2025)"
          unit="body"
          color="#06b6d4"
          data={MSCI_WORLD}
          logScale={true}
          area={true}
          showCagr={true}
          note={t('assetMsciWorldNote')}
        />
        <ChartCard
          title={t('assetMsciEm')}
          source="MSCI Emerging Markets Price Return USD (1988–2025)"
          unit="body"
          color="#f43f5e"
          data={MSCI_EM}
          area={true}
          showCagr={true}
          note={t('assetMsciEmNote')}
        />
        <ChartCard
          title={t('assetPx')}
          source="Burza cenných papírů Praha — PX index (1994–2025)"
          unit="body"
          color="#a855f7"
          data={PX_INDEX}
          area={true}
          showCagr={true}
          note={t('assetPxNote')}
        />
      </div>
    </div>
  )
}
