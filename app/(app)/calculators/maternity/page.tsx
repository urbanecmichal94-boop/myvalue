import { getTranslations } from 'next-intl/server'
import { MaternityCalculator } from '@/components/calculators/maternity-calculator'

export default async function MaternityPage() {
  const t = await getTranslations('calculators.maternity')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <MaternityCalculator />
    </div>
  )
}
