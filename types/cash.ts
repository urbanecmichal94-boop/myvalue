import type { Currency } from './index'

export type CashEnvelopeType = 'reserve' | 'spending' | 'general'
export type CashEntryType = 'balance' | 'deposit' | 'withdrawal'

export const ENVELOPE_TYPE_COLORS: Record<CashEnvelopeType, string> = {
  reserve:  '#3b82f6',
  spending: '#f97316',
  general:  '#6b7280',
}

export interface CashAccount {
  id:            string
  section_id:    string
  name:          string
  currency:      Currency
  envelope_type: CashEnvelopeType
  note?:         string
  created_at:    string
}

export interface CashBalanceEntry {
  id:         string
  account_id: string
  type:       CashEntryType
  amount:     number        // vždy kladné; type určuje směr
  date:       string        // YYYY-MM-DD
  note?:      string
  created_at: string
}

export interface CashAccountWithBalance extends CashAccount {
  currentBalance:        number
  currentBalanceDisplay: number
  history:               CashBalanceEntry[]
}
