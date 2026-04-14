import { getTranslations } from 'next-intl/server'
import { CompoundCalculator } from '@/components/calculators/compound-calculator'

export default async function CompoundPage() {
  const t = await getTranslations('calculators.compound')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <CompoundCalculator />
    </div>
  )
}
