import type { Settings, ColumnState } from '@/lib/storage'
import {
  getSettings as localGet,
  saveSettings as localSave,
  getColumnConfig as localGetColumns,
  saveColumnConfig as localSaveColumns,
  resetColumnConfig as localResetColumns,
} from '@/lib/storage'
import { getDbClient } from './client'

// ─── Mapování DB ↔ App (snake_case ↔ camelCase) ───────────────────────────────

function toSettings(row: Record<string, unknown>): Settings {
  return {
    displayCurrency:         row.display_currency as Settings['displayCurrency'],
    showPortfolioChart:      row.show_portfolio_chart as boolean,
    showPerformanceWidget:   row.show_performance_widget as boolean,
    performanceSectionIds:   (row.performance_section_ids as string[]) ?? [],
  }
}

function toDbSettings(settings: Settings, userId: string) {
  return {
    user_id:                   userId,
    display_currency:          settings.displayCurrency,
    show_portfolio_chart:      settings.showPortfolioChart,
    show_performance_widget:   settings.showPerformanceWidget,
    performance_section_ids:   settings.performanceSectionIds,
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error) return localGet()  // fallback pokud záznam chybí
    return toSettings(data as Record<string, unknown>)
  }
  return localGet()
}

export async function saveSettings(settings: Settings): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('settings')
      .upsert(toDbSettings(settings, userId))
    if (error) throw error
    return
  }
  localSave(settings)
}

// ─── Column config (uložen jako JSONB v settings.column_config) ───────────────

export async function getColumnConfig(): Promise<ColumnState[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('settings')
      .select('column_config')
      .eq('user_id', userId)
      .single()
    if (error || !data) return localGetColumns()
    const config = (data as Record<string, unknown>).column_config as ColumnState[]
    return Array.isArray(config) && config.length > 0 ? config : localGetColumns()
  }
  return localGetColumns()
}

export async function saveColumnConfig(config: ColumnState[]): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('settings')
      .update({ column_config: config })
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localSaveColumns(config)
}

export async function resetColumnConfig(): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('settings')
      .update({ column_config: [] })
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localResetColumns()
}
