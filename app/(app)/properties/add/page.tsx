import { getTranslations } from 'next-intl/server'
import { PropertyForm } from '@/components/properties/property-form'

export default async function AddPropertyPage() {
  const t = await getTranslations('properties.form')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('titleAdd')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitleAdd')}</p>
      </div>
      <PropertyForm />
    </div>
  )
}
