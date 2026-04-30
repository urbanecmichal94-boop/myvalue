'use client'

import { useTranslations } from 'next-intl'
import { ChartCard } from '@/components/macro/historical-chart-card'
import {
  CZ_PROPERTY_CZ, CZ_PROPERTY_PRAGUE, CZ_MORTGAGE_RATE, CZ_HOUSING_AFFORD,
  CZ_WAGE, CZ_WAGE_MEDIAN, CZ_WAGE_GROWTH, CZ_REPO_RATE, CZ_RENT_PRAGUE, CZ_RENT_CZ,
  CZ_RENTAL_YIELD, CZ_RENTAL_YIELD_CZ, CZ_HOUSING_AFFORD_PRAGUE, CZ_RENT_GROWTH,
  CZ_PROPERTY_GROWTH, CZ_APARTMENT_TRANSACTIONS,
} from '@/data/historical/cz'

export function MacroCzNemovitosti() {
  const t = useTranslations('macro')

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title={t('czPropertyCompare')}
          source="ČSÚ / Deloitte Real Index / HB Index (2005–2025)"
          unit="tis. Kč"
          color="#6366f1"
          color2="#3b82f6"
          data={CZ_PROPERTY_PRAGUE}
          data2={CZ_PROPERTY_CZ}
          label1="Praha"
          label2="ČR"
          note={t('czPropertyUnit')}
        />
        <ChartCard
          title={t('czRentCompare')}
          source="Deloitte / Flat Zone / ČSÚ (2010–2025)"
          unit="Kč/m²"
          color="#06b6d4"
          color2="#0ea5e9"
          data={CZ_RENT_PRAGUE}
          data2={CZ_RENT_CZ}
          label1="Praha"
          label2="ČR"
          note={t('czRentNote')}
        />
        <ChartCard
          title={t('czRentalYieldCompare')}
          source="Výpočet z dat ČSÚ / Deloitte (2010–2025)"
          unit="%"
          color="#f43f5e"
          color2="#fb923c"
          data={CZ_RENTAL_YIELD}
          data2={CZ_RENTAL_YIELD_CZ}
          label1="Praha"
          label2="ČR"
          note={t('czRentalYieldCompareNote')}
        />
        <ChartCard
          title={t('czHousingAffordCompare')}
          source="Výpočet z dat ČSÚ (2005–2025)"
          unit="roky"
          color="#ef4444"
          color2="#f97316"
          data={CZ_HOUSING_AFFORD_PRAGUE}
          data2={CZ_HOUSING_AFFORD}
          label1="Praha"
          label2="ČR"
          note={t('czHousingAffordCompareNote')}
        />
        <ChartCard
          title={t('czRatesCompare')}
          source="Fincentrum Hypoindex / ČNB (2003–2025)"
          unit="%"
          color="#f97316"
          color2="#8b5cf6"
          data={CZ_MORTGAGE_RATE}
          data2={CZ_REPO_RATE}
          label1="hypotéka"
          label2="repo"
          note={t('czRatesCompareNote')}
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
          title={t('czWageRentGrowth')}
          source="ČSÚ / Deloitte (1994–2025)"
          unit="%"
          color="#10b981"
          color2="#06b6d4"
          color3="#ef4444"
          data={CZ_WAGE_GROWTH.filter(p => p.year >= 2000)}
          data2={CZ_RENT_GROWTH}
          data3={CZ_PROPERTY_GROWTH}
          label1="mzdy"
          label2="nájmy"
          label3="ceny bytů"
          referenceZero={true}
          note={t('czWageRentGrowthNote')}
        />
        <ChartCard
          title={t('czApartmentTransactions')}
          source="ČSÚ / ČÚZK katastr (2010–2024)"
          unit="tis. ks"
          color="#8b5cf6"
          data={CZ_APARTMENT_TRANSACTIONS}
          note={t('czApartmentTransactionsNote')}
        />
      </div>
    </div>
  )
}
