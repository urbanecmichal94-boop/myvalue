import type { Section } from '@/types'
import {
  getSections as localGet,
  saveSection as localSave,
  deleteSection as localDelete,
} from '@/lib/storage'
import { getDbClient } from './client'

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toSection(row: Record<string, unknown>): Section {
  return {
    id:         row.id as string,
    name:       row.name as string,
    template:   row.template as Section['template'],
    color:      row.color as string | undefined,
    created_at: row.created_at as string,
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getSections(): Promise<Section[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('sections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (error) throw error
    return (data ?? []).map(toSection)
  }
  return localGet()
}

export async function saveSection(section: Section): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('sections')
      .upsert({ ...section, user_id: userId })
    if (error) throw error
    return
  }
  localSave(section)
}

export async function deleteSection(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('sections')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDelete(id)
}
