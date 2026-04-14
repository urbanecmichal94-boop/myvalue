import type { Property } from '@/types/property'
import {
  getProperties as localGet,
  saveProperty as localSave,
  deleteProperty as localDelete,
} from '@/lib/property-storage'
import { getDbClient } from './client'

// ─── Mapování DB → App (snake_case → camelCase) ────────────────────────────────

function toProperty(row: Record<string, unknown>): Property {
  return {
    id:               row.id as string,
    name:             row.name as string,
    address:          row.address as string | undefined,
    type:             row.type as Property['type'],
    purchaseDate:     row.purchase_date as string,
    purchasePrice:    Number(row.purchase_price),
    purchaseCosts:    Number(row.purchase_costs),
    currentValue:     Number(row.current_value),
    lastValuedAt:     row.last_valued_at as string,
    mortgage:         row.mortgage as Property['mortgage'],
    isRental:         row.is_rental as boolean,
    rentalHistory:    (row.rental_history as Property['rentalHistory']) ?? [],
    valuationHistory: (row.valuation_history as Property['valuationHistory']) ?? [],
    notes:            row.notes as string | undefined,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
  }
}

function toDbProperty(p: Property, userId: string) {
  return {
    id:                p.id,
    user_id:           userId,
    name:              p.name,
    address:           p.address ?? null,
    type:              p.type,
    purchase_date:     p.purchaseDate,
    purchase_price:    p.purchasePrice,
    purchase_costs:    p.purchaseCosts,
    current_value:     p.currentValue,
    last_valued_at:    p.lastValuedAt,
    mortgage:          p.mortgage ?? null,
    is_rental:         p.isRental,
    rental_history:    p.rentalHistory,
    valuation_history: p.valuationHistory,
    notes:             p.notes ?? null,
    created_at:        p.createdAt,
    updated_at:        p.updatedAt,
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getProperties(): Promise<Property[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    if (error) throw error
    return (data ?? []).map(toProperty)
  }
  return localGet()
}

export async function saveProperty(p: Property): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('properties')
      .upsert(toDbProperty(p, userId))
    if (error) throw error
    return
  }
  localSave(p)
}

export async function deleteProperty(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  localDelete(id)
}
