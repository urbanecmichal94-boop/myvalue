import { getTranslations } from 'next-intl/server'
import { PpmCalculator } from '@/components/calculators/ppm-calculator'

export default async function PpmPage() {
  const t = await getTranslations('calculators.ppm')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <PpmCalculator />
    </div>
  )
}
