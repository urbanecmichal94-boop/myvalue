'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldCheck, Clock, AlertTriangle, Info, ChevronRight } from 'lucide-react'
import { type AssetWithValue } from '@/types'
import { getTransactions } from '@/lib/db/transactions'
import { formatCurrency } from '@/lib/format'
import type { Currency } from '@/types'
import type { Transaction } from '@/types'

const THREE_YEARS_MS = 3 * 365.25 * 24 * 60 * 60 * 1000
const ONE_YEAR_MS   = 365.25 * 24 * 60 * 60 * 1000

function taxTestMs(asset: AssetWithValue): number | null {
  if (asset.type === 'commodity') {
    const form = (asset as AssetWithValue & { commodity_form?: string }).commodity_form
    if (form === 'physical') return ONE_YEAR_MS   // fyzické zlato/stříbro — 1 rok
    if (form === 'etf')      return THREE_YEARS_MS // komoditní ETF — 3 roky
    if (form === 'futures')  return null            // futures — žádný test, vždy zdanitelné
    return ONE_YEAR_MS // výchozí pro komodity bez formy
  }
  return THREE_YEARS_MS // akcie, ETF, krypto
}

// ── Typy ─────────────────────────────────────────────────────────────────────

interface Lot {
  date: string
  quantity: number
  exempt: boolean
  daysRemaining: number | null
  exemptDate: string
  lotValue: number   // aktuální hodnota lotu v display měně
}

interface AssetTaxRow {
  asset: AssetWithValue
  lots: Lot[]
  exemptQty: number
  taxableQty: number
  totalValue: number
}

// ── Logika ────────────────────────────────────────────────────────────────────

function buildAssetRows(assets: AssetWithValue[], allTxs: Transaction[]): AssetTaxRow[] {
  const now = Date.now()

  return assets
    .filter((a) => a.totalQuantity > 0)
    .map((a) => {
      const txs = allTxs.filter((t) => t.asset_id === a.id)
      const buys = txs
        .filter((t) => t.type === 'buy')
        .sort((x, y) => x.date.localeCompare(y.date))

      // Cena za 1 kus v display měně
      const pricePerUnit = a.totalQuantity > 0 ? a.currentValueDisplay / a.totalQuantity : 0

      const testMs = taxTestMs(a)

      const lots: Lot[] = buys.map((tx) => {
        const buyTime    = new Date(tx.date).getTime()
        const heldMs     = now - buyTime
        // futures = nikdy osvobozeno (testMs === null)
        const exempt        = testMs !== null && heldMs >= testMs
        const exemptDate    = testMs !== null ? new Date(buyTime + testMs).toLocaleDateString('cs-CZ') : '—'
        const daysRemaining = (testMs !== null && !exempt) ? Math.ceil((testMs - heldMs) / 86400000) : null
        const lotValue      = tx.quantity * pricePerUnit

        return { date: tx.date, quantity: tx.quantity, exempt, daysRemaining, exemptDate, lotValue }
      })

      const exemptQty  = lots.filter((l) => l.exempt).reduce((s, l) => s + l.quantity, 0)
      const taxableQty = lots.filter((l) => !l.exempt).reduce((s, l) => s + l.quantity, 0)

      return { asset: a, lots, exemptQty, taxableQty, totalValue: a.currentValueDisplay }
    })
}

function fmtQty(n: number): string {
  return n.toLocaleString('cs-CZ', { maximumFractionDigits: 4 })
}

function fmtDays(days: number): string {
  const years = Math.floor(days / 365)
  const rest  = days % 365
  if (years === 0) return `${rest} dní`
  if (rest === 0)  return `${years} r.`
  return `${years} r. ${rest} dní`
}

// ── Komponenta ────────────────────────────────────────────────────────────────

interface TaxOverviewProps {
  assets: AssetWithValue[]
  displayCurrency: Currency
}

export function TaxOverview({ assets, displayCurrency }: TaxOverviewProps) {
  const t = useTranslations('taxes')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [allTxs, setAllTxs] = useState<Transaction[]>([])

  useEffect(() => {
    getTransactions().then(setAllTxs).catch(console.error)
  }, [])

  const rows = buildAssetRows(assets, allTxs).sort((a, b) => {
    // Nejbližší datum osvobození nahoře, plně osvobozené dolů
    const aMin = Math.min(...a.lots.filter(l => !l.exempt && l.daysRemaining !== null).map(l => l.daysRemaining!))
    const bMin = Math.min(...b.lots.filter(l => !l.exempt && l.daysRemaining !== null).map(l => l.daysRemaining!))
    const aHasTaxable = a.taxableQty > 0
    const bHasTaxable = b.taxableQty > 0
    if (!aHasTaxable && !bHasTaxable) return 0
    if (!aHasTaxable) return 1
    if (!bHasTaxable) return -1
    return (isFinite(aMin) ? aMin : Infinity) - (isFinite(bMin) ? bMin : Infinity)
  })

  const totalExemptQty  = rows.reduce((s, r) => s + r.exemptQty, 0)
  const totalTaxableQty = rows.reduce((s, r) => s + r.taxableQty, 0)
  const exemptValue     = rows.reduce((s, r) => {
    return s + r.lots.filter((l) => l.exempt).reduce((ls, l) => ls + l.lotValue, 0)
  }, 0)
  const taxableValue    = rows.reduce((s, r) => {
    return s + r.lots.filter((l) => !l.exempt).reduce((ls, l) => ls + l.lotValue, 0)
  }, 0)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">

      {/* Disclaimer */}
      <div className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 p-3 text-xs text-yellow-800 dark:text-yellow-300">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{t('disclaimer')}</span>
      </div>

      {/* Shrnutí */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 p-3">
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">{t('exempt')}</p>
          <p className="text-lg font-bold text-green-700 dark:text-green-400 mt-0.5">{fmtQty(totalExemptQty)} ks</p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">{formatCurrency(exemptValue, displayCurrency)}</p>
        </div>
        <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 p-3">
          <p className="text-xs text-orange-700 dark:text-orange-400 font-medium">{t('taxable')}</p>
          <p className="text-lg font-bold text-orange-700 dark:text-orange-400 mt-0.5">{fmtQty(totalTaxableQty)} ks</p>
          <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">{formatCurrency(taxableValue, displayCurrency)}</p>
        </div>
      </div>

      {/* Tabulka */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left font-semibold w-8"></th>
              <th className="px-4 py-2 text-left font-semibold">{t('colAsset')}</th>
              <th className="px-4 py-2 text-right font-semibold">{t('colExemptQty')}</th>
              <th className="px-4 py-2 text-right font-semibold">{t('colTaxableQty')}</th>
              <th className="px-4 py-2 text-right font-semibold">{t('colValue')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.asset.id)
              const hasMultiple = row.lots.length > 1

              return (
                <>
                  {/* Souhrnný řádek */}
                  <tr
                    key={row.asset.id}
                    onClick={() => hasMultiple && toggle(row.asset.id)}
                    className={`border-b hover:bg-muted/30 transition-colors ${hasMultiple ? 'cursor-pointer' : ''}`}
                  >
                    {/* Expand ikona */}
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {hasMultiple && (
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      )}
                    </td>

                    {/* Aktivum */}
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-xs bg-muted px-1.5 py-0.5 rounded">
                        {row.asset.ticker ?? row.asset.name}
                      </span>
                      {row.asset.ticker && (
                        <span className="ml-2 text-xs text-muted-foreground">{row.asset.name}</span>
                      )}
                      {hasMultiple && (
                        <span className="ml-2 text-xs text-muted-foreground">({row.lots.length} nákupy)</span>
                      )}
                    </td>

                    {/* Osvobozeno */}
                    <td className="px-4 py-2.5 text-right">
                      {row.exemptQty > 0 ? (
                        <span className="text-sm font-medium text-green-700 dark:text-green-400 tabular-nums">
                          {fmtQty(row.exemptQty)} ks
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Zdanitelné */}
                    <td className="px-4 py-2.5 text-right">
                      {row.taxableQty > 0 ? (
                        <div>
                          <span className="text-sm font-medium text-orange-600 dark:text-orange-400 tabular-nums">
                            {fmtQty(row.taxableQty)} ks
                          </span>
                          {/* Pro jednolotové pozice ukáž datum osvobození přímo */}
                          {row.lots.length === 1 && row.lots[0].daysRemaining != null && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              za {fmtDays(row.lots[0].daysRemaining)} ({row.lots[0].exemptDate})
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Hodnota */}
                    <td className="px-4 py-2.5 text-right font-semibold text-sm">
                      {formatCurrency(row.totalValue, displayCurrency)}
                    </td>
                  </tr>

                  {/* Rozbalené loty */}
                  {isOpen && row.lots.map((lot, i) => (
                    <tr key={`${row.asset.id}-lot-${i}`} className="border-b last:border-0 bg-muted/20">
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 pl-8">
                        <span className="text-xs text-muted-foreground">
                          {new Date(lot.date).toLocaleDateString('cs-CZ')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums" colSpan={1}>
                        {/* počet kusů tohoto lotu */}
                        <span className="text-muted-foreground">{fmtQty(lot.quantity)} ks</span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs" colSpan={1}>
                        {/* status */}
                        {lot.exempt ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                            <ShieldCheck className="h-3 w-3" /> {t('statusExempt')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <Clock className="h-3 w-3" /> za {fmtDays(lot.daysRemaining!)} ({lot.exemptDate})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(lot.lotValue, displayCurrency)}
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <p className="text-xs text-muted-foreground">{t('legend')}</p>
    </div>
  )
}
