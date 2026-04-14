import { format } from 'date-fns'
import { cs } from 'date-fns/locale'

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value / 100)
}

export function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'd. M. yyyy', { locale: cs })
  } catch {
    return dateStr
  }
}

export function formatQuantity(value: number, decimals: number): string {
  return value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}
