import type { PortfolioSnapshot } from '@/lib/storage'
import {
  getSnapshots as localGet,
  addSnapshot as localAdd,
} from '@/lib/storage'
import { getDbClient } from './client'

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toSnapshot(row: Record<string, unknown>): PortfolioSnapshot {
  return {
    date:     row.date as string,
    value:    Number(row.value),
    currency: row.currency as PortfolioSnapshot['currency'],
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getSnapshots(): Promise<PortfolioSnapshot[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('date, value, currency')
      .eq('user_id', userId)
      .order('date')
    if (error) throw error
    return (data ?? []).map(toSnapshot)
  }
  return localGet()
}

export async function addSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('portfolio_snapshots')
      .upsert(
        { ...snapshot, user_id: userId },
        { onConflict: 'user_id,date' }
      )
    if (error) throw error
    return
  }
  localAdd(snapshot)
}
