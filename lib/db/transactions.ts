import type { Transaction } from '@/types'
import {
  getTransactions as localGet,
  saveTransaction as localSave,
  deleteTransaction as localDelete,
} from '@/lib/storage'
import { getDbClient } from './client'

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toTransaction(row: Record<string, unknown>): Transaction {
  return {
    id:         row.id as string,
    asset_id:   row.asset_id as string,
    date:       row.date as string,
    type:       row.type as Transaction['type'],
    quantity:   Number(row.quantity),
    price:      Number(row.price),
    currency:   row.currency as Transaction['currency'],
    notes:      row.notes as string | undefined,
    created_at: row.created_at as string,
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getTransactions(assetId?: string): Promise<Transaction[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date')
    if (assetId) query = query.eq('asset_id', assetId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(toTransaction)
  }
  return localGet(assetId)
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('transactions')
      .upsert({ ...tx, user_id: userId })
    if (error) throw error
    return
  }
  localSave(tx)
}

export async function deleteTransaction(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDelete(id)
}
