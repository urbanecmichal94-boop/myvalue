'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Section } from '@/types'
import {
  getSections,
  saveSection as storageSaveSection,
  deleteSection as storageDeleteSection,
  migrateOrphanedAssets,
} from '@/lib/storage'

interface SectionsContextValue {
  sections: Section[]
  saveSection: (section: Section) => void
  removeSection: (id: string) => void
  refresh: () => void
}

const SectionsContext = createContext<SectionsContextValue>({
  sections: [],
  saveSection: () => {},
  removeSection: () => {},
  refresh: () => {},
})

export function SectionsProvider({ children }: { children: React.ReactNode }) {
  const [sections, setSections] = useState<Section[]>([])

  const refresh = useCallback(() => {
    setSections(getSections())
  }, [])

  useEffect(() => {
    // Migrovat stará aktiva bez section_id (jednorázová operace)
    migrateOrphanedAssets()
    refresh()
  }, [refresh])

  const saveSection = useCallback((section: Section) => {
    storageSaveSection(section)
    refresh()
  }, [refresh])

  const removeSection = useCallback((id: string) => {
    storageDeleteSection(id)
    refresh()
  }, [refresh])

  return (
    <SectionsContext.Provider value={{ sections, saveSection, removeSection, refresh }}>
      {children}
    </SectionsContext.Provider>
  )
}

export function useSections() {
  return useContext(SectionsContext)
}
