import type { CashflowCategory, CashflowItem, CashflowItemHistory, CashflowFrequency } from '@/types/cashflow'
import { CASHFLOW_PRESETS, getPresetSuggestions } from '@/types/cashflow'
import type { Currency } from '@/types'
import { generateId } from '@/lib/storage'
import {
  getCashflowCategories as localGetCats,
  saveCashflowCategory as localSaveCat,
  deleteCashflowCategory as localDeleteCat,
  getCashflowItems as localGetItems,
  saveCashflowItem as localSaveItem,
  deleteCashflowItem as localDeleteItem,
  getCashflowHistory as localGetHistory,
  addCashflowHistoryEntry as localAddHistory,
  deleteCashflowHistoryEntry as localDeleteHistory,
  getCashflowHidden as localGetHidden,
  saveCashflowHidden as localSaveHidden,
} from '@/lib/cashflow-storage'
import { getDbClient } from './client'

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toCategory(row: Record<string, unknown>): CashflowCategory {
  const isPreset = row.is_preset as boolean
  const name     = row.name as string
  return {
    id:               row.id as string,
    name,
    parent_id:        row.parent_id as string | null,
    type:             row.type as CashflowCategory['type'],
    is_preset:        isPreset,
    // Návrhy položek vždy z kódu — ne z DB (jinak se při aktualizaci kódu neprojeví)
    item_suggestions: isPreset ? getPresetSuggestions(name) : undefined,
    order:            row.order as number,
    created_at:       row.created_at as string,
  }
}

function toItem(row: Record<string, unknown>): CashflowItem {
  return {
    id:          row.id as string,
    category_id: row.category_id as string,
    name:        row.name as string,
    currency:    row.currency as CashflowItem['currency'],
    frequency:   row.frequency as CashflowItem['frequency'],
    due_date:    row.due_date as string | undefined,
    notes:       row.notes as string | undefined,
    created_at:  row.created_at as string,
  }
}

function toHistory(row: Record<string, unknown>): CashflowItemHistory {
  return {
    id:         row.id as string,
    item_id:    row.item_id as string,
    amount:     Number(row.amount),
    valid_from: row.valid_from as string,
    notes:      row.notes as string | undefined,
    created_at: row.created_at as string,
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCashflowCategories(): Promise<CashflowCategory[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('cashflow_categories')
      .select('*')
      .eq('user_id', userId)
      .order('order')
    if (error) throw error
    return (data ?? []).map(toCategory)
  }
  return localGetCats()
}

export async function saveCashflowCategory(cat: CashflowCategory): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    // item_suggestions se neukládají do DB — čteme je vždy z kódu
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { item_suggestions, ...catWithout } = cat
    const { error } = await supabase
      .from('cashflow_categories')
      .upsert({ ...catWithout, user_id: userId })
    if (error) throw error
    return
  }
  localSaveCat(cat)
}

export async function deleteCashflowCategory(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cashflow_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDeleteCat(id)
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function getCashflowItems(categoryId?: string): Promise<CashflowItem[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    let query = supabase
      .from('cashflow_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (categoryId) query = query.eq('category_id', categoryId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(toItem)
  }
  return localGetItems(categoryId)
}

export async function saveCashflowItem(item: CashflowItem): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cashflow_items')
      .upsert({ ...item, user_id: userId })
    if (error) throw error
    return
  }
  localSaveItem(item)
}

export async function deleteCashflowItem(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cashflow_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDeleteItem(id)
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getCashflowHistory(itemId?: string): Promise<CashflowItemHistory[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    let query = supabase
      .from('cashflow_item_history')
      .select('*')
      .eq('user_id', userId)
      .order('valid_from')
    if (itemId) query = query.eq('item_id', itemId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(toHistory)
  }
  return localGetHistory(itemId)
}

export async function addCashflowHistoryEntry(entry: CashflowItemHistory): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cashflow_item_history')
      .insert({ ...entry, user_id: userId })
    if (error) throw error
    return
  }
  localAddHistory(entry)
}

export async function deleteCashflowHistoryEntry(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cashflow_item_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDeleteHistory(id)
}

// ─── Composite helpers (async) ────────────────────────────────────────────────

export async function createCashflowItem(params: {
  categoryId: string
  name: string
  currency: Currency
  frequency: CashflowFrequency
  amount: number
  dueDate?: string
  notes?: string
}): Promise<void> {
  const now = new Date().toISOString()
  const today = now.split('T')[0]
  const itemId = generateId()

  const item: CashflowItem = {
    id:          itemId,
    category_id: params.categoryId,
    name:        params.name,
    currency:    params.currency,
    frequency:   params.frequency,
    due_date:    params.dueDate,
    notes:       params.notes,
    created_at:  now,
  }

  const historyEntry: CashflowItemHistory = {
    id:         generateId(),
    item_id:    itemId,
    amount:     params.amount,
    valid_from: today,
    created_at: now,
  }

  await saveCashflowItem(item)
  await addCashflowHistoryEntry(historyEntry)
}

export async function updateCashflowItem(params: {
  item: CashflowItem
  newAmount: number
  newFrequency: CashflowFrequency
  newCurrency: Currency
  newName: string
  newDueDate?: string
  newNotes?: string
  currentAmount: number
}): Promise<void> {
  const today = new Date().toISOString().split('T')[0]

  const updatedItem: CashflowItem = {
    ...params.item,
    name:      params.newName,
    frequency: params.newFrequency,
    currency:  params.newCurrency,
    due_date:  params.newDueDate,
    notes:     params.newNotes,
  }
  await saveCashflowItem(updatedItem)

  if (params.newAmount !== params.currentAmount) {
    await addCashflowHistoryEntry({
      id:         generateId(),
      item_id:    params.item.id,
      amount:     params.newAmount,
      valid_from: today,
      created_at: new Date().toISOString(),
    })
  }
}

// ─── Inicializace preset kategorií ───────────────────────────────────────────
// Spustí se při prvním otevření Cashflow — funguje pro localStorage i Supabase.

export async function initializeCashflowIfEmpty(): Promise<void> {
  const existing = await getCashflowCategories()
  // Přeskočit jen pokud už existují preset kategorie — vlastní kategorie nevadí
  const hasPresets = existing.some((c) => c.is_preset && c.parent_id === null)
  if (hasPresets) return

  const now = new Date().toISOString()
  let order = 0

  for (const preset of CASHFLOW_PRESETS) {
    const topId = crypto.randomUUID()
    await saveCashflowCategory({
      id:               topId,
      name:             preset.name,
      parent_id:        null,
      type:             preset.type,
      is_preset:        true,
      item_suggestions: preset.itemSuggestions,
      order:            order++,
      created_at:       now,
    })

    if (preset.children) {
      for (const child of preset.children) {
        await saveCashflowCategory({
          id:               crypto.randomUUID(),
          name:             child.name,
          parent_id:        topId,
          type:             preset.type,
          is_preset:        true,
          item_suggestions: child.itemSuggestions,
          order:            order++,
          created_at:       now,
        })
      }
    }
  }

  // Označit jako inicializováno i v localStorage (pro offline/demo režim)
  if (typeof window !== 'undefined') {
    localStorage.setItem('cf_initialized', 'true')
  }
}

// ─── Hidden categories (localStorage only — UI preference, není kritická data) ─

export function getCashflowHidden(): string[] {
  return localGetHidden()
}

export function saveCashflowHidden(ids: string[]): void {
  localSaveHidden(ids)
}
