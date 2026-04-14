import type { Asset, Transaction, AssetType, TransactionType } from '@/types'
import type { CashflowCategory, CashflowItem, CashflowItemHistory } from '@/types/cashflow'
import { ASSET_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from '@/types'
import type { Currency } from '@/types'

// ─── Sestavení CSV ────────────────────────────────────────────────────────────

// Zaokrouhlí číslo na max. N desetinných míst a odstraní trailing nuly
function formatNum(value: number, maxDecimals = 8): string {
  return parseFloat(value.toFixed(maxDecimals)).toString()
}

function escapeCell(value: string | number | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...cells: (string | number | undefined)[]): string {
  return cells.map(escapeCell).join(',')
}

const HEADER = row('Datum', 'Typ', 'Kategorie', 'Název', 'Ticker', 'Množství', 'Cena', 'Měna', 'Poznámka')

export function transactionsToCsv(assets: Asset[], transactions: Transaction[]): string {
  const assetMap = new Map(assets.map((a) => [a.id, a]))

  const lines = transactions
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((tx) => {
      const asset = assetMap.get(tx.asset_id)
      if (!asset) return null
      return row(
        tx.date,
        TRANSACTION_TYPE_LABELS[tx.type],
        ASSET_TYPE_LABELS[asset.type],
        asset.name,
        asset.ticker ?? '',
        tx.type === 'update' || tx.type === 'dividend' ? '' : formatNum(tx.quantity, 8),
        formatNum(tx.price, 4),
        tx.currency,
        tx.notes ?? '',
      )
    })
    .filter(Boolean)

  return [HEADER, ...lines].join('\n')
}

// ─── Stažení souboru ──────────────────────────────────────────────────────────

export function downloadCsv(content: string, filename: string): void {
  // BOM pro správné zobrazení diakritiky v Excelu
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function csvFilename(prefix: string): string {
  const date = new Date().toISOString().split('T')[0]
  return `${prefix}_${date}.csv`
}

// ─── Cashflow CSV ─────────────────────────────────────────────────────────────

export function cashflowToCsv(
  categories: CashflowCategory[],
  items: CashflowItem[],
  history: CashflowItemHistory[],
): string {
  const lines: string[] = []

  // Kategorie
  lines.push(row('cashflow_category', 'id', 'nazev', 'parent_id', 'typ', 'preset', 'poradi'))
  for (const c of categories.sort((a, b) => a.order - b.order)) {
    lines.push(row('cashflow_category', c.id, c.name, c.parent_id ?? '', c.type, c.is_preset ? '1' : '0', c.order))
  }

  // Položky
  lines.push(row('cashflow_item', 'id', 'category_id', 'nazev', 'mena', 'frekvence', 'datum_splatnosti', 'poznamka'))
  for (const i of items) {
    lines.push(row('cashflow_item', i.id, i.category_id, i.name, i.currency, i.frequency, i.due_date ?? '', i.notes ?? ''))
  }

  // Historie
  lines.push(row('cashflow_history', 'id', 'item_id', 'castka', 'plati_od', 'poznamka'))
  for (const h of history.sort((a, b) => a.valid_from.localeCompare(b.valid_from))) {
    lines.push(row('cashflow_history', h.id, h.item_id, formatNum(h.amount, 2), h.valid_from, h.notes ?? ''))
  }

  return lines.join('\n')
}

// ─── Import CSV ───────────────────────────────────────────────────────────────

export interface CsvRow {
  date: string
  txType: TransactionType
  assetType: AssetType
  name: string
  ticker: string
  quantity: number
  price: number
  currency: Currency
  notes: string
}

const TX_LABEL_TO_TYPE: Record<string, TransactionType> = Object.fromEntries(
  Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => [v, k as TransactionType])
)

const ASSET_LABEL_TO_TYPE: Record<string, AssetType> = Object.fromEntries(
  Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => [v, k as AssetType])
)

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cells.push(current); current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

export function parseCsv(csv: string): { rows: CsvRow[]; errors: string[] } {
  const rows: CsvRow[] = []
  const errors: string[] = []

  // Odstranit BOM
  const clean = csv.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows, errors: ['Soubor neobsahuje žádná data'] }

  // Přeskočit hlavičku
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    if (cells.length < 8) { errors.push(`Řádek ${i + 1}: nesprávný počet sloupců`); continue }

    const [date, txLabel, assetLabel, name, ticker, qtyStr, priceStr, currency, notes = ''] = cells

    const txType = TX_LABEL_TO_TYPE[txLabel]
    if (!txType) { errors.push(`Řádek ${i + 1}: neznámý typ transakce "${txLabel}"`); continue }

    const assetType = ASSET_LABEL_TO_TYPE[assetLabel] ?? 'custom'
    const quantity = parseFloat(qtyStr) || 0
    const price = parseFloat(priceStr)
    if (isNaN(price)) { errors.push(`Řádek ${i + 1}: neplatná cena`); continue }

    rows.push({
      date: date.trim(),
      txType,
      assetType,
      name: name.trim(),
      ticker: ticker.trim(),
      quantity,
      price,
      currency: (currency.trim() as Currency) || 'CZK',
      notes: notes.trim(),
    })
  }

  return { rows, errors }
}
