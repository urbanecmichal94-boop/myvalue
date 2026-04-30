'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Settings } from '@/lib/storage'
import {
  getSettings as dbGetSettings,
  saveSettings as dbSaveSettings,
} from '@/lib/db/settings'

interface SettingsContextValue {
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
}

const DEFAULT_SETTINGS: Settings = {
  displayCurrency: 'CZK',
  showPortfolioChart: true,
  showAllocationChart: true,
  showReserveWidget: true,
  showPerformanceWidget: true,
  showWinnersLosers: false,
  showMarketOverview: false,
  includePropertiesInDashboard: true,
  performanceSectionIds: [],
  totalValueSectionIds: [],
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
})

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    dbGetSettings().then(setSettings).catch(console.error)
  }, [])

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial }
      dbSaveSettings(updated).catch(console.error)
      return updated
    })
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
