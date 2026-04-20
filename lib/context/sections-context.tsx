'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Section } from '@/types'
import { migrateOrphanedAssets } from '@/lib/storage'
import {
  getSections,
  saveSection as dbSaveSection,
  deleteSection as dbDeleteSection,
} from '@/lib/db/sections'

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
    getSections().then(setSections).catch(console.error)
  }, [])

  useEffect(() => {
    migrateOrphanedAssets()
    refresh()
  }, [refresh])

  const saveSection = useCallback((section: Section) => {
    // Optimistický update — UI se změní okamžitě
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === section.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = section
        return next
      }
      return [...prev, section]
    })
    dbSaveSection(section).catch(console.error)
  }, [])

  const removeSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
    dbDeleteSection(id).catch(console.error)
  }, [])

  return (
    <SectionsContext.Provider value={{ sections, saveSection, removeSection, refresh }}>
      {children}
    </SectionsContext.Provider>
  )
}

export function useSections() {
  return useContext(SectionsContext)
}
