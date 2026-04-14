import type { Asset } from '@/types'
import {
  getAssets as localGet,
  saveAsset as localSave,
  deleteAsset as localDelete,
} from '@/lib/storage'
import { getDbClient } from './client'

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toAsset(row: Record<string, unknown>): Asset {
  return {
    id:                 row.id as string,
    section_id:         row.section_id as string,
    type:               row.type as Asset['type'],
    name:               row.name as string,
    ticker:             row.ticker as string | undefined,
    currency:           row.currency as Asset['currency'],
    commodity_unit:     row.commodity_unit as Asset['commodity_unit'],
    commodity_form:     row.commodity_form as Asset['commodity_form'],
    notes:              row.notes as string | undefined,
    sector:             row.sector as string | undefined,
    industry:           row.industry as string | undefined,
    country:            row.country as string | undefined,
    tradingview_symbol: row.tradingview_symbol as string | undefined,
    created_at:         row.created_at as string,
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getAssets(sectionId?: string): Promise<Asset[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    let query = supabase
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (sectionId) query = query.eq('section_id', sectionId)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map(toAsset)
  }
  return localGet(sectionId)
}

export async function saveAsset(asset: Asset): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('assets')
      .upsert({ ...asset, user_id: userId })
    if (error) throw error
    return
  }
  localSave(asset)
}

export async function deleteAsset(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    // Transakce se smažou automaticky (ON DELETE CASCADE)
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDelete(id)
}
