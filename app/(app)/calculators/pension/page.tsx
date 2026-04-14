import { getTranslations } from 'next-intl/server'
import { PensionCalculator } from '@/components/calculators/pension-calculator'

export default async function PensionPage() {
  const t = await getTranslations('calculators.pension')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <PensionCalculator />
    </div>
  )
}
