import { getTranslations } from 'next-intl/server'
import { RentVsBuyCalculator } from '@/components/calculators/rent-vs-buy-calculator'

export default async function RentVsBuyPage() {
  const t = await getTranslations('calculators.rentVsBuy')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <RentVsBuyCalculator />
    </div>
  )
}
