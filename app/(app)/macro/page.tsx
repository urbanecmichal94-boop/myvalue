'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MacroTickerBar } from '@/components/macro/macro-ticker-bar'
import { MacroGrid } from '@/components/macro/macro-grid'
import { MacroPerspective } from '@/components/macro/macro-perspective'
import { MacroCzMakro } from '@/components/macro/macro-cz-makro'
import { MacroCzNemovitosti } from '@/components/macro/macro-cz-nemovitosti'
import { MacroAssets } from '@/components/macro/macro-assets'

type Tab = 'overview' | 'perspective' | 'cz' | 'assets'

export default function MacroPage() {
  const t = useTranslations('macro')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'perspective', label: t('tabPerspective') },
    { id: 'cz', label: t('tabCz') },
    { id: 'assets', label: t('tabAssets') },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <MacroTickerBar />
          <MacroGrid />
        </>
      )}

      {activeTab === 'perspective' && <MacroPerspective />}

      {activeTab === 'cz' && (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('sectionMacro')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <MacroCzMakro />
          </section>

          <MacroCzNemovitosti />
        </div>
      )}

      {activeTab === 'assets' && <MacroAssets />}
    </div>
  )
}
