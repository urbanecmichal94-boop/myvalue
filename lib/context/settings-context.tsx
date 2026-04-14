'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getSettings, saveSettings, type Settings } from '@/lib/storage'

interface SettingsContextValue {
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: { displayCurrency: 'CZK', showPortfolioChart: true, showPerformanceWidget: true, performanceSectionIds: [] },
  updateSettings: () => {},
})

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ displayCurrency: 'CZK', showPortfolioChart: true, showPerformanceWidget: true, performanceSectionIds: [] })

  // Načíst nastavení z localStorage po prvním renderu (klient)
  useEffect(() => {
    setSettings(getSettings())
  }, [])

  function updateSettings(partial: Partial<Settings>) {
    const updated = { ...settings, ...partial }
    setSettings(updated)
    saveSettings(updated)
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
