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
    showAllocationChart:     (row.show_allocation_chart as boolean) ?? true,
    showReserveWidget:       (row.show_reserve_widget as boolean) ?? true,
    showPerformanceWidget:   row.show_performance_widget as boolean,
    showWinnersLosers:       (row.show_winners_losers as boolean) ?? false,
    showMarketOverview:      (row.show_market_overview as boolean) ?? false,
    performanceSectionIds:   (row.performance_section_ids as string[]) ?? [],
    totalValueSectionIds:    (row.total_value_section_ids as string[]) ?? [],
  }
}

function toDbSettings(settings: Settings, userId: string) {
  return {
    user_id:                     userId,
    display_currency:            settings.displayCurrency,
    show_portfolio_chart:        settings.showPortfolioChart,
    show_allocation_chart:       settings.showAllocationChart,
    show_reserve_widget:         settings.showReserveWidget,
    show_performance_widget:     settings.showPerformanceWidget,
    show_winners_losers:         settings.showWinnersLosers,
    show_market_overview:        settings.showMarketOverview,
    performance_section_ids:     settings.performanceSectionIds,
    total_value_section_ids:     settings.totalValueSectionIds,
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
    if (error) { console.warn('saveSettings DB error, falling back to localStorage:', error); localSave(settings); return }
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
