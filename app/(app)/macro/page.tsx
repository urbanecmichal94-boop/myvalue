'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MacroTickerBar } from '@/components/macro/macro-ticker-bar'
import { MacroGrid } from '@/components/macro/macro-grid'
import { TvEconomicCalendar } from '@/components/charts/tradingview-widgets'

type Tab = 'overview' | 'calendar'

export default function MacroPage() {
  const t = useTranslations('macro')
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('tabOverview') },
    { id: 'calendar', label: t('tabCalendar') },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Nadpis */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Záložky */}
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

      {/* Přehled */}
      {activeTab === 'overview' && (
        <>
          <MacroTickerBar />
          <MacroGrid />
        </>
      )}

      {/* Ekonomický kalendář */}
      {activeTab === 'calendar' && (
        <TvEconomicCalendar theme="dark" />
      )}
    </div>
  )
}
