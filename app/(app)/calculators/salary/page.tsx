import { getTranslations } from 'next-intl/server'
import { SalaryCalculator } from '@/components/calculators/salary-calculator'

export default async function SalaryPage() {
  const t = await getTranslations('calculators.salary')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('name')}</h1>
        <p className="text-muted-foreground mt-1">{t('desc')}</p>
      </div>
      <SalaryCalculator />
    </div>
  )
}
