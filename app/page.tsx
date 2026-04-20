import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { TrendingUp, Wallet, Building2, Calculator, CheckCircle2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const tAuth = await getTranslations('auth')

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Navigace ─────────────────────────────────────────────────────────── */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">Myvalue</span>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">{tAuth('toLogin')}</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">{t('ctaRegister')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-medium px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            CZ &amp; SK trh · Zadarmo
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
            {t('heroTagline')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10">
            {t('heroSub')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button size="lg" className="gap-2 w-44">
                {t('ctaRegister')} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-44">
                {t('ctaLogin')}
              </Button>
            </Link>
          </div>

          <div className="mt-4">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {t('ctaDemo')}
            </Link>
            <p className="text-xs text-muted-foreground/60 mt-0.5">{t('ctaDemoNote')}</p>
          </div>
        </section>

        {/* ── Funkce ───────────────────────────────────────────────────────────── */}
        <section className="border-t bg-muted/30">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-bold text-center mb-10">{t('featuresTitle')}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <FeatureCard
                icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
                title={t('feature1Title')}
                desc={t('feature1Desc')}
              />
              <FeatureCard
                icon={<Wallet className="h-5 w-5 text-green-500" />}
                title={t('feature2Title')}
                desc={t('feature2Desc')}
              />
              <FeatureCard
                icon={<Building2 className="h-5 w-5 text-orange-500" />}
                title={t('feature3Title')}
                desc={t('feature3Desc')}
              />
              <FeatureCard
                icon={<Calculator className="h-5 w-5 text-purple-500" />}
                title={t('feature4Title')}
                desc={t('feature4Desc')}
              />
            </div>
          </div>
        </section>

        {/* ── Proč Myvalue ─────────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-8">{t('whyTitle')}</h2>
          <ul className="max-w-sm mx-auto space-y-3">
            {([
              t('why1'),
              t('why2'),
              t('why3'),
              t('why4'),
            ] as string[]).map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* ── CTA spodní ───────────────────────────────────────────────────────── */}
        <section className="border-t bg-muted/30">
          <div className="max-w-5xl mx-auto px-6 py-14 text-center">
            <h2 className="text-2xl font-bold mb-3">{t('heroTagline')}</h2>
            <p className="text-muted-foreground mb-6 text-sm">{t('heroSub')}</p>
            <Link href="/register">
              <Button size="lg" className="gap-2">
                {t('ctaRegister')} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Myvalue · myvalue.cz</span>
          <span>{t('footerRights')}</span>
        </div>
      </footer>

    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
        {icon}
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}
