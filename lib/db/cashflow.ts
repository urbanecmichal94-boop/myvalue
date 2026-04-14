import type { CashflowCategory, CashflowItem, CashflowItemHistory } from '@/types/cashflow'
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
  return {
    id:               row.id as string,
    name:             row.name as string,
    parent_id:        row.parent_id as string | null,
    type:             row.type as CashflowCategory['type'],
    is_preset:        row.is_preset as boolean,
    item_suggestions: row.item_suggestions as string[] | undefined,
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
    const { error } = await supabase
      .from('cashflow_categories')
      .upsert({ ...cat, user_id: userId })
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

// ─── Hidden categories (localStorage only — UI preference, není kritická data) ─

export function getCashflowHidden(): string[] {
  return localGetHidden()
}

export function saveCashflowHidden(ids: string[]): void {
  localSaveHidden(ids)
}
