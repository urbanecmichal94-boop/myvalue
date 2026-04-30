'use client'

import { useTranslations } from 'next-intl'
import { ChartCard } from '@/components/macro/historical-chart-card'
import {
  CZ_INFLATION, CZ_REPO_RATE, CZ_MORTGAGE_RATE, CZ_WAGE, CZ_WAGE_MEDIAN,
  CZ_UNEMPLOYMENT, CZ_GDP, CZ_DEBT_GDP, CZ_EUR, CZ_USD, CZ_M2, CZ_TRADE_BALANCE,
} from '@/data/historical/cz'

export function MacroCzMakro() {
  const t = useTranslations('macro')

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground">{t('czNote')}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title={t('czInflationRates')}
          source="ČSÚ / ČNB / Fincentrum Hypoindex (1993–2025)"
          unit="%"
          color="#f97316"
          color2="#3b82f6"
          color3="#10b981"
          data={CZ_INFLATION}
          data2={CZ_REPO_RATE}
          data3={CZ_MORTGAGE_RATE}
          label1="inflace"
          label2="repo"
          label3="hypotéka"
          referenceZero={true}
          note={t('czInflationRatesNote')}
        />
        <ChartCard
          title={t('czWage')}
          source="ČSÚ — průměr (1993–2025) · medián ISPV (2002–2025)"
          unit="tis. Kč"
          color="#10b981"
          color2="#0284c7"
          data={CZ_WAGE}
          data2={CZ_WAGE_MEDIAN}
          label1="průměr"
          label2="medián"
          note={t('czWageNote')}
        />
        <ChartCard
          title={t('czGdpUnemployment')}
          source="ČSÚ / Eurostat / World Bank (1993–2025)"
          unit="%"
          color="#8b5cf6"
          color2="#64748b"
          data={CZ_GDP}
          data2={CZ_UNEMPLOYMENT}
          label1="HDP růst"
          label2="nezaměstnanost"
          referenceZero={true}
          note={t('czGdpUnemploymentNote')}
        />
        <ChartCard
          title={t('czDebtGdp')}
          source="ČSÚ / Eurostat — Maastricht (1993–2025)"
          unit="%"
          color="#ef4444"
          data={CZ_DEBT_GDP}
        />
        <ChartCard
          title={t('czM2')}
          source="ČNB ARAD (2000–2024)"
          unit="mld. Kč"
          color="#06b6d4"
          data={CZ_M2}
          area={true}
          showCagr={true}
          note={t('czM2Note')}
        />
        <ChartCard
          title={t('czTradeBalance')}
          source="ČSÚ / CountryEconomy (2000–2024)"
          unit="mld. Kč"
          color="#10b981"
          data={CZ_TRADE_BALANCE}
          referenceZero={true}
          note={t('czTradeBalanceNote')}
        />
        <ChartCard
          title={t('czEurUsdCompare')}
          source="ČNB / ECB / Fed (1993–2025)"
          unit="CZK"
          color="#f59e0b"
          color2="#64748b"
          data={CZ_EUR}
          data2={CZ_USD}
          label1="EUR"
          label2="USD"
          note={t('czEurUsdNote')}
        />
      </div>
    </div>
  )
}
