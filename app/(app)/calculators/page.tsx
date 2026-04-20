import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function CalculatorsPage() {
  const t   = await getTranslations('calculators')
  const tm  = await getTranslations('calculators.mortgage')
  const ts  = await getTranslations('calculators.salary')
  const tc  = await getTranslations('calculators.compound')
  const tp  = await getTranslations('calculators.ppm')
  const tpa = await getTranslations('calculators.parental')

  const calcs = [
    { slug: 'mortgage',           name: tm('name'),   desc: tm('desc') },
    { slug: 'salary',             name: ts('name'),   desc: ts('desc') },
    { slug: 'compound',           name: tc('name'),   desc: tc('desc') },
    { slug: 'pension',            name: 'Penzijní připojištění (DPS)',     desc: 'Simulace DPS s státním příspěvkem, poplatky fondu a porovnáním s ETF alternativou' },
    { slug: 'rent-vs-buy',        name: 'Nájem vs koupě nemovitosti',      desc: 'Srovnání čisté hodnoty majetku — hypotéka vs nájem s investováním rozdílu a bodu zlomu' },
    { slug: 'investment-property',name: 'Investiční nemovitost',           desc: 'Cashflow, Cap rate, Cash-on-cash a čistá hodnota — s volbou daňové strategie (paušál / odpisy)' },
    { slug: 'ppm',                name: tp('name'),   desc: tp('desc') },
    { slug: 'parental',           name: tpa('name'),  desc: tpa('desc') },
  ]

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {calcs.map((calc) => (
          <div key={calc.slug} className="rounded-lg border bg-card p-5 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-base">{calc.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{calc.desc}</p>
            </div>
            <div className="mt-auto pt-2">
              <Link
                href={`/calculators/${calc.slug}`}
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors w-full"
              >
                {t('open')}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
