import {
  CASHFLOW_PRESETS,
  FREQUENCY_TO_MONTHLY,
  type CashflowCategory,
  type CashflowItem,
  type CashflowItemHistory,
  type CashflowFrequency,
} from '@/types/cashflow'
import type { Currency } from '@/types'
import { convertCurrency } from '@/lib/calculations'
import type { CurrencyCache } from '@/lib/storage'

// ─── Klíče v localStorage ────────────────────────────────────────────────────

const KEYS = {
  categories:   'cf_categories',
  items:        'cf_items',
  history:      'cf_history',
  initialized:  'cf_initialized',
  hiddenCats:   'cf_hidden_cats',   // string[] — ID skrytých top-level kategorií
} as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

function generateId(): string {
  return crypto.randomUUID()
}

// ─── Inicializace preset kategorií ───────────────────────────────────────────
// Spustí se jednou při prvním otevření Cashflow stránky

export function initializeCashflow(): void {
  if (typeof window === 'undefined') return

  // Migrace: smazat prázdnou preset kategorii "Vlastní výdaje" pokud existuje
  const existing = load<CashflowCategory[]>(KEYS.categories, [])
  const vlastni = existing.find((c) => c.name === 'Vlastní výdaje' && c.is_preset && c.parent_id === null)
  if (vlastni) {
    const allItems = load<{ category_id: string }[]>(KEYS.items, [])
    const hasChildren = existing.some((c) => c.parent_id === vlastni.id)
    const hasItems = allItems.some((i) => i.category_id === vlastni.id)
    if (!hasChildren && !hasItems) {
      save(KEYS.categories, existing.filter((c) => c.id !== vlastni.id))
    }
  }

  if (localStorage.getItem(KEYS.initialized)) return

  const categories: CashflowCategory[] = []
  let order = 0

  for (const preset of CASHFLOW_PRESETS) {
    const topId = generateId()
    categories.push({
      id:               topId,
      name:             preset.name,
      parent_id:        null,
      type:             preset.type,
      is_preset:        true,
      item_suggestions: preset.itemSuggestions,
      order:            order++,
      created_at:       new Date().toISOString(),
    })

    if (preset.children) {
      for (const child of preset.children) {
        categories.push({
          id:               generateId(),
          name:             child.name,
          parent_id:        topId,
          type:             preset.type,
          is_preset:        true,
          item_suggestions: child.itemSuggestions,
          order:            order++,
          created_at:       new Date().toISOString(),
        })
      }
    }
  }

  save(KEYS.categories, categories)
  save(KEYS.initialized, true)
}

// ─── Kategorie ────────────────────────────────────────────────────────────────

export function getCashflowCategories(): CashflowCategory[] {
  return load<CashflowCategory[]>(KEYS.categories, [])
}

export function saveCashflowCategory(category: CashflowCategory): void {
  const all = getCashflowCategories()
  const idx = all.findIndex((c) => c.id === category.id)
  if (idx >= 0) {
    all[idx] = category
  } else {
    all.push(category)
  }
  save(KEYS.categories, all)
}

export function deleteCashflowCategory(id: string): void {
  const all = getCashflowCategories()
  save(KEYS.categories, all.filter((c) => c.id !== id))
}

// ─── Položky ─────────────────────────────────────────────────────────────────

export function getCashflowItems(categoryId?: string): CashflowItem[] {
  const all = load<CashflowItem[]>(KEYS.items, [])
  return categoryId ? all.filter((i) => i.category_id === categoryId) : all
}

export function saveCashflowItem(item: CashflowItem): void {
  const all = getCashflowItems()
  const idx = all.findIndex((i) => i.id === item.id)
  if (idx >= 0) {
    all[idx] = item
  } else {
    all.push(item)
  }
  save(KEYS.items, all)
}

export function deleteCashflowItem(id: string): void {
  save(KEYS.items, getCashflowItems().filter((i) => i.id !== id))
  // Smazat také historii
  save(KEYS.history, getCashflowHistory().filter((h) => h.item_id !== id))
}

// ─── Historie hodnot ──────────────────────────────────────────────────────────

export function getCashflowHistory(itemId?: string): CashflowItemHistory[] {
  const all = load<CashflowItemHistory[]>(KEYS.history, [])
  return itemId ? all.filter((h) => h.item_id === itemId) : all
}

export function addCashflowHistoryEntry(entry: CashflowItemHistory): void {
  const all = getCashflowHistory()
  all.push(entry)
  save(KEYS.history, all)
}

export function deleteCashflowHistoryEntry(id: string): void {
  save(KEYS.history, getCashflowHistory().filter((h) => h.id !== id))
}

// ─── Výpočetní helpers ────────────────────────────────────────────────────────

// Aktuální částka položky = nejnovější záznam s valid_from <= dnes
export function getCurrentAmount(itemId: string, history: CashflowItemHistory[]): number {
  const today = new Date().toISOString().split('T')[0]
  const entries = history
    .filter((h) => h.item_id === itemId && h.valid_from <= today)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))
  return entries[0]?.amount ?? 0
}

// Měsíční ekvivalent položky v zobrazovací měně
export function getMonthlyAmount(
  item: CashflowItem,
  history: CashflowItemHistory[],
  rates: CurrencyCache,
  displayCurrency: Currency,
): number {
  const amount = getCurrentAmount(item.id, history)
  const monthly = amount * FREQUENCY_TO_MONTHLY[item.frequency]
  return convertCurrency(monthly, item.currency, displayCurrency, rates)
}

// Rekurzivní součet měsíční hodnoty kategorie (včetně podkategorií)
export function getCategoryMonthly(
  categoryId: string,
  allCategories: CashflowCategory[],
  allItems: CashflowItem[],
  allHistory: CashflowItemHistory[],
  rates: CurrencyCache,
  displayCurrency: Currency,
): number {
  const directItems = allItems.filter((i) => i.category_id === categoryId)
  const itemSum = directItems.reduce(
    (sum, item) => sum + getMonthlyAmount(item, allHistory, rates, displayCurrency),
    0,
  )
  const children = allCategories.filter((c) => c.parent_id === categoryId)
  const childSum = children.reduce(
    (sum, child) => sum + getCategoryMonthly(child.id, allCategories, allItems, allHistory, rates, displayCurrency),
    0,
  )
  return itemSum + childSum
}

// ─── Viditelnost top-level kategorií ─────────────────────────────────────────
// Ukládáme ID skrytých kategorií. Prázdné pole = vše viditelné (default).

export function getCashflowHidden(): string[] {
  return load<string[]>(KEYS.hiddenCats, [])
}

export function saveCashflowHidden(hiddenIds: string[]): void {
  save(KEYS.hiddenCats, hiddenIds)
}

export function toggleCashflowHidden(categoryId: string): string[] {
  const hidden = getCashflowHidden()
  const next = hidden.includes(categoryId)
    ? hidden.filter((id) => id !== categoryId)
    : [...hidden, categoryId]
  saveCashflowHidden(next)
  return next
}

// ─── Nová položka + první history záznam ─────────────────────────────────────

export function createCashflowItem(params: {
  categoryId: string
  name: string
  currency: Currency
  frequency: CashflowFrequency
  amount: number
  dueDate?: string
  notes?: string
}): void {
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

  saveCashflowItem(item)
  addCashflowHistoryEntry(historyEntry)
}

// Aktualizace položky — pokud se změní částka, přidá nový history záznam
export function updateCashflowItem(params: {
  item: CashflowItem
  newAmount: number
  newFrequency: CashflowFrequency
  newCurrency: Currency
  newName: string
  newDueDate?: string
  newNotes?: string
  currentAmount: number
}): void {
  const today = new Date().toISOString().split('T')[0]

  const updatedItem: CashflowItem = {
    ...params.item,
    name:      params.newName,
    frequency: params.newFrequency,
    currency:  params.newCurrency,
    due_date:  params.newDueDate,
    notes:     params.newNotes,
  }
  saveCashflowItem(updatedItem)

  // Přidat history záznam jen pokud se změnila částka
  if (params.newAmount !== params.currentAmount) {
    addCashflowHistoryEntry({
      id:         generateId(),
      item_id:    params.item.id,
      amount:     params.newAmount,
      valid_from: today,
      created_at: new Date().toISOString(),
    })
  }
}
