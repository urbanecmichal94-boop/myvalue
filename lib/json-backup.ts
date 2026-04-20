import type { Section, Asset, Transaction } from '@/types'
import type { CashflowCategory, CashflowItem, CashflowItemHistory } from '@/types/cashflow'
import type { Property } from '@/types/property'
import type { PortfolioSnapshot } from '@/lib/storage'

import { getSections, saveSection } from '@/lib/db/sections'
import { getAssets, saveAsset } from '@/lib/db/assets'
import { getTransactions, saveTransaction } from '@/lib/db/transactions'
import {
  getCashflowCategories,
  saveCashflowCategory,
  getCashflowItems,
  saveCashflowItem,
  getCashflowHistory,
  addCashflowHistoryEntry,
} from '@/lib/db/cashflow'
import { getProperties, saveProperty } from '@/lib/db/properties'
import { getSnapshots, addSnapshot } from '@/lib/db/snapshots'

// ─── Typy ─────────────────────────────────────────────────────────────────────

export const BACKUP_VERSION = 1

export interface BackupData {
  version:             number
  exportedAt:          string
  sections:            Section[]
  assets:              Asset[]
  transactions:        Transaction[]
  cashflow_categories: CashflowCategory[]
  cashflow_items:      CashflowItem[]
  cashflow_history:    CashflowItemHistory[]
  properties:          Property[]
  snapshots:           PortfolioSnapshot[]
}

export interface ImportResult {
  sections:            number
  assets:              number
  transactions:        number
  cashflow_categories: number
  cashflow_items:      number
  cashflow_history:    number
  properties:          number
  snapshots:           number
  total:               number
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportAllData(): Promise<BackupData> {
  const [
    sections,
    assets,
    transactions,
    cashflow_categories,
    cashflow_items,
    cashflow_history,
    properties,
    snapshots,
  ] = await Promise.all([
    getSections(),
    getAssets(),
    getTransactions(),
    getCashflowCategories(),
    getCashflowItems(),
    getCashflowHistory(),
    getProperties(),
    getSnapshots(),
  ])

  return {
    version:    BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sections,
    assets,
    transactions,
    cashflow_categories,
    cashflow_items,
    cashflow_history,
    properties,
    snapshots,
  }
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href     = url
  a.download = `myvalue-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Validace ─────────────────────────────────────────────────────────────────

export function validateBackup(raw: unknown): BackupData {
  if (!raw || typeof raw !== 'object') throw new Error('Soubor není platný JSON objekt')
  const d = raw as Record<string, unknown>
  if (typeof d.version !== 'number') throw new Error('Chybí pole "version"')
  if (d.version > BACKUP_VERSION) throw new Error(`Záloha je z novější verze aplikace (v${d.version})`)
  if (!Array.isArray(d.sections))            throw new Error('Chybí pole "sections"')
  if (!Array.isArray(d.assets))              throw new Error('Chybí pole "assets"')
  if (!Array.isArray(d.transactions))        throw new Error('Chybí pole "transactions"')
  if (!Array.isArray(d.cashflow_categories)) throw new Error('Chybí pole "cashflow_categories"')
  if (!Array.isArray(d.cashflow_items))      throw new Error('Chybí pole "cashflow_items"')
  if (!Array.isArray(d.cashflow_history))    throw new Error('Chybí pole "cashflow_history"')
  if (!Array.isArray(d.properties))          throw new Error('Chybí pole "properties"')
  if (!Array.isArray(d.snapshots))           throw new Error('Chybí pole "snapshots"')
  return d as unknown as BackupData
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importAllData(data: BackupData): Promise<ImportResult> {
  const result: ImportResult = {
    sections: 0, assets: 0, transactions: 0,
    cashflow_categories: 0, cashflow_items: 0, cashflow_history: 0,
    properties: 0, snapshots: 0, total: 0,
  }

  // Načíst existující IDs pro deduplication
  const [
    existingSections,
    existingAssets,
    existingTransactions,
    existingCategories,
    existingItems,
    existingHistory,
    existingProperties,
    existingSnapshots,
  ] = await Promise.all([
    getSections(),
    getAssets(),
    getTransactions(),
    getCashflowCategories(),
    getCashflowItems(),
    getCashflowHistory(),
    getProperties(),
    getSnapshots(),
  ])

  const existingSectionIds    = new Set(existingSections.map(x => x.id))
  const existingAssetIds      = new Set(existingAssets.map(x => x.id))
  const existingTxIds         = new Set(existingTransactions.map(x => x.id))
  const existingCatIds        = new Set(existingCategories.map(x => x.id))
  const existingItemIds       = new Set(existingItems.map(x => x.id))
  const existingHistoryIds    = new Set(existingHistory.map(x => x.id))
  const existingPropertyIds   = new Set(existingProperties.map(x => x.id))
  const existingSnapshotDates = new Set(existingSnapshots.map(x => x.date))

  // Sekce — pořadí důležité (assets je referencují)
  for (const s of data.sections) {
    if (existingSectionIds.has(s.id)) continue
    await saveSection(s)
    result.sections++
  }

  // Aktiva
  for (const a of data.assets) {
    if (existingAssetIds.has(a.id)) continue
    await saveAsset(a)
    result.assets++
  }

  // Transakce
  for (const tx of data.transactions) {
    if (existingTxIds.has(tx.id)) continue
    await saveTransaction(tx)
    result.transactions++
  }

  // Cashflow kategorie
  for (const cat of data.cashflow_categories) {
    if (existingCatIds.has(cat.id)) continue
    await saveCashflowCategory(cat)
    result.cashflow_categories++
  }

  // Cashflow položky
  for (const item of data.cashflow_items) {
    if (existingItemIds.has(item.id)) continue
    await saveCashflowItem(item)
    result.cashflow_items++
  }

  // Cashflow historie
  for (const entry of data.cashflow_history) {
    if (existingHistoryIds.has(entry.id)) continue
    await addCashflowHistoryEntry(entry)
    result.cashflow_history++
  }

  // Nemovitosti
  for (const p of data.properties) {
    if (existingPropertyIds.has(p.id)) continue
    await saveProperty(p)
    result.properties++
  }

  // Snapshots
  for (const snap of data.snapshots) {
    if (existingSnapshotDates.has(snap.date)) continue
    await addSnapshot(snap)
    result.snapshots++
  }

  result.total =
    result.sections + result.assets + result.transactions +
    result.cashflow_categories + result.cashflow_items + result.cashflow_history +
    result.properties + result.snapshots

  return result
}
