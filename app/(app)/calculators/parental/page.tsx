import { getTranslations } from 'next-intl/server'
import { ParentalCalculator } from '@/components/calculators/parental-calculator'

export default async function ParentalPage() {
  const t = await getTranslations('calculators.parental')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <ParentalCalculator />
    </div>
  )
}
