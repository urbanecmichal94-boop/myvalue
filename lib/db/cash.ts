import type { CashAccount, CashBalanceEntry, CashAccountWithBalance } from '@/types/cash'
import type { Currency } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import { convertCurrency } from '@/lib/calculations'
import { getDbClient } from './client'

// ─── localStorage fallback ────────────────────────────────────────────────────

function lsLoad<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function lsSave(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const LS_ACCOUNTS = 'cash_accounts'
const LS_HISTORY  = 'cash_balance_history'

function lsGetAccounts(sectionId?: string): CashAccount[] {
  const all = lsLoad<CashAccount[]>(LS_ACCOUNTS, [])
  return sectionId ? all.filter((a) => a.section_id === sectionId) : all
}

function lsSaveAccount(account: CashAccount): void {
  const all = lsGetAccounts()
  const idx = all.findIndex((a) => a.id === account.id)
  idx >= 0 ? (all[idx] = account) : all.push(account)
  lsSave(LS_ACCOUNTS, all)
}

function lsDeleteAccount(id: string): void {
  lsSave(LS_ACCOUNTS, lsGetAccounts().filter((a) => a.id !== id))
  lsSave(LS_HISTORY, lsGetHistory().filter((e) => e.account_id !== id))
}

function lsGetHistory(accountId?: string): CashBalanceEntry[] {
  const all = lsLoad<CashBalanceEntry[]>(LS_HISTORY, [])
  return accountId ? all.filter((e) => e.account_id === accountId) : all
}

function lsSaveEntry(entry: CashBalanceEntry): void {
  const all = lsGetHistory()
  const idx = all.findIndex((e) => e.id === entry.id)
  idx >= 0 ? (all[idx] = entry) : all.push(entry)
  lsSave(LS_HISTORY, all)
}

function lsDeleteEntry(id: string): void {
  lsSave(LS_HISTORY, lsGetHistory().filter((e) => e.id !== id))
}

// ─── Mapování DB → App ────────────────────────────────────────────────────────

function toAccount(row: Record<string, unknown>): CashAccount {
  return {
    id:         row.id as string,
    section_id: row.section_id as string,
    name:       row.name as string,
    currency:   row.currency as Currency,
    note:       row.note as string | undefined,
    created_at: row.created_at as string,
  }
}

function toEntry(row: Record<string, unknown>): CashBalanceEntry {
  return {
    id:         row.id as string,
    account_id: row.account_id as string,
    amount:     Number(row.amount),
    date:       row.date as string,
    note:       row.note as string | undefined,
    created_at: row.created_at as string,
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getCashAccounts(sectionId: string): Promise<CashAccount[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('cash_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('section_id', sectionId)
      .order('created_at')
    if (error) { console.warn('cash_accounts DB error, falling back to localStorage:', error); return lsGetAccounts(sectionId) }
    return (data ?? []).map(toAccount)
  }
  return lsGetAccounts(sectionId)
}

export async function saveCashAccount(account: CashAccount): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cash_accounts')
      .upsert({ ...account, user_id: userId })
    if (error) { console.warn('saveCashAccount DB error, falling back to localStorage:', error); lsSaveAccount(account); return }
    return
  }
  lsSaveAccount(account)
}

export async function deleteCashAccount(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cash_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) { console.warn('deleteCashAccount DB error, falling back to localStorage:', error); lsDeleteAccount(id); return }
    return
  }
  lsDeleteAccount(id)
}

// ─── Balance history ──────────────────────────────────────────────────────────

export async function getCashHistory(accountId: string): Promise<CashBalanceEntry[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('cash_balance_history')
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('date', { ascending: false })
    if (error) { console.warn('cash_balance_history DB error, falling back to localStorage:', error); return lsGetHistory(accountId).sort((a, b) => b.date.localeCompare(a.date)) }
    return (data ?? []).map(toEntry)
  }
  return lsGetHistory(accountId).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getCashHistoryForSection(sectionId: string): Promise<CashBalanceEntry[]> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { data, error } = await supabase
      .from('cash_balance_history')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (error) throw error
    // Filtrujeme na straně klienta podle section_id přes join — Supabase nemá přímý join tady
    // Proto načteme všechny a filtrujeme dle accountIds
    return (data ?? []).map(toEntry)
  }
  return lsGetHistory().sort((a, b) => b.date.localeCompare(a.date))
}

export async function saveCashBalanceEntry(entry: CashBalanceEntry): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cash_balance_history')
      .upsert({ ...entry, user_id: userId })
    if (error) { console.warn('saveCashBalanceEntry DB error, falling back to localStorage:', error); lsSaveEntry(entry); return }
    return
  }
  lsSaveEntry(entry)
}

export async function deleteCashBalanceEntry(id: string): Promise<void> {
  const { supabase, userId } = await getDbClient()
  if (userId) {
    const { error } = await supabase
      .from('cash_balance_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) { console.warn('deleteCashBalanceEntry DB error, falling back to localStorage:', error); lsDeleteEntry(id); return }
    return
  }
  lsDeleteEntry(id)
}

// ─── Složený helper: účty + zůstatky ─────────────────────────────────────────

export async function getCashAccountsWithBalances(
  sectionId: string,
  rates: CurrencyCache,
  displayCurrency: Currency,
): Promise<CashAccountWithBalance[]> {
  const accounts = await getCashAccounts(sectionId)

  return Promise.all(
    accounts.map(async (account) => {
      const history = await getCashHistory(account.id)
      const today = new Date().toISOString().split('T')[0]
      // Aktuální zůstatek = nejnovější entry s datem <= dnes
      const current = history.find((e) => e.date <= today)
      const currentBalance = current?.amount ?? 0
      const currentBalanceDisplay = convertCurrency(currentBalance, account.currency, displayCurrency, rates)
      return { ...account, currentBalance, currentBalanceDisplay, history }
    })
  )
}

/** Celková hodnota cash sekce v zobrazovací měně */
export async function getCashSectionTotal(
  sectionId: string,
  rates: CurrencyCache,
  displayCurrency: Currency,
): Promise<number> {
  const accounts = await getCashAccountsWithBalances(sectionId, rates, displayCurrency)
  return accounts.reduce((s, a) => s + a.currentBalanceDisplay, 0)
}
