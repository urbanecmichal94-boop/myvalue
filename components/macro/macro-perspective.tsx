'use client'

import { useTranslations } from 'next-intl'
import { ChartCard } from '@/components/macro/historical-chart-card'
import {
  SP500, US_INFLATION, US_PURCHASING_POWER, US_DEBT_GDP, US_FED_RATE, US_10Y_YIELD,
  US_UNEMPLOYMENT, US_GOLD, US_CAPE, US_DEBT_USD, US_M2,
} from '@/data/historical/usa'

export function MacroPerspective() {
  const t = useTranslations('macro')

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">{t('perspectiveNote')}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title={t('chartSP500')}
          source="Robert Shiller / Yale (1928–2025)"
          unit="body"
          color="#3b82f6"
          data={SP500}
          logScale={true}
          area={true}
          note={t('chartSP500Note')}
        />
        <ChartCard
          title={t('chartInflationUS')}
          source="BLS CPI-U (1914–2025)"
          unit="%"
          color="#f97316"
          data={US_INFLATION}
          referenceZero={true}
        />
        <ChartCard
          title={t('chartCumulativeInflation')}
          source="BLS CPI-U — kumulativní zdražení od začátku období"
          unit="%"
          color="#8b5cf6"
          data={US_PURCHASING_POWER}
          cumulative={true}
          referenceZero={true}
          area={true}
          note={t('chartCumulativeInflationNote')}
        />
        <ChartCard
          title={t('chartDebtGdp')}
          source="FRED / OMB (1929–2025)"
          unit="%"
          color="#ef4444"
          data={US_DEBT_GDP}
          area={true}
        />
        <ChartCard
          title={t('chartDebtUsd')}
          source="FRED GFDEBTN / U.S. Treasury (1929–2025)"
          unit="T USD"
          color="#7c3aed"
          data={US_DEBT_USD}
          area={true}
          note={t('chartDebtUsdNote')}
        />
        <ChartCard
          title={t('chartFedRate')}
          source="FRED FEDFUNDS (1954–2025)"
          unit="%"
          color="#10b981"
          data={US_FED_RATE}
          area={true}
        />
        <ChartCard
          title={t('chart10yYield')}
          source="FRED GS10 (1962–2025)"
          unit="%"
          color="#f59e0b"
          data={US_10Y_YIELD}
          area={true}
        />
        <ChartCard
          title={t('chartUnemploymentUS')}
          source="FRED UNRATE (1948–2025)"
          unit="%"
          color="#64748b"
          data={US_UNEMPLOYMENT}
          area={true}
        />
        <ChartCard
          title={t('chartGold')}
          source="World Gold Council / Kitco (1920–2025)"
          unit="USD"
          color="#eab308"
          data={US_GOLD}
          logScale={true}
          area={true}
          note={t('chartGoldNote')}
        />
        <ChartCard
          title={t('chartCape')}
          source="Robert Shiller / Yale (1920–2025)"
          unit="×"
          color="#ec4899"
          data={US_CAPE}
          area={true}
          note={t('chartCapeNote')}
        />
        <ChartCard
          title={t('chartM2Usa')}
          source="FRED M2SL — Federal Reserve (1960–2024)"
          unit="T USD"
          color="#06b6d4"
          data={US_M2}
          area={true}
          showCagr={true}
          note={t('chartM2UsaNote')}
        />
      </div>
    </div>
  )
}
