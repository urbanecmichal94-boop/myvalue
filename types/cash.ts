import type { Currency } from './index'

export interface CashAccount {
  id: string
  section_id: string
  name: string
  currency: Currency
  note?: string
  created_at: string
}

export interface CashBalanceEntry {
  id: string
  account_id: string
  amount: number
  date: string       // YYYY-MM-DD
  note?: string
  created_at: string
}

export interface CashAccountWithBalance extends CashAccount {
  currentBalance: number         // aktuální zůstatek (nejnovější entry)
  currentBalanceDisplay: number  // převedeno na zobrazovací měnu
  history: CashBalanceEntry[]
}
