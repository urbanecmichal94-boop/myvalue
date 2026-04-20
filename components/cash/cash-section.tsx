'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, History, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getCashAccountsWithBalances,
  saveCashAccount,
  deleteCashAccount,
  saveCashBalanceEntry,
  deleteCashBalanceEntry,
} from '@/lib/db/cash'
import type { CashAccount, CashAccountWithBalance, CashBalanceEntry } from '@/types/cash'
import { CURRENCIES, type Currency } from '@/types'
import type { CurrencyCache } from '@/lib/storage'
import { formatCurrency } from '@/lib/format'
import { convertCurrency } from '@/lib/calculations'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CashSectionProps {
  sectionId: string
  displayCurrency: Currency
  rates: CurrencyCache
  sectionColor: string
}

// ─── Dialogy ──────────────────────────────────────────────────────────────────

type DialogState =
  | { mode: 'add-account' }
  | { mode: 'edit-account'; account: CashAccount }
  | { mode: 'add-entry'; account: CashAccountWithBalance }
  | { mode: 'history'; account: CashAccountWithBalance }
  | null

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

export function CashSection({ sectionId, displayCurrency, rates, sectionColor }: CashSectionProps) {
  const t = useTranslations('cash')

  const [accounts, setAccounts] = useState<CashAccountWithBalance[]>([])
  const [loading, setLoading]   = useState(true)
  const [dialog, setDialog]     = useState<DialogState>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    try {
      const data = await getCashAccountsWithBalances(sectionId, rates, displayCurrency)
      setAccounts(data)
    } catch (e) {
      console.error('CashSection load error:', e)
    } finally {
      setLoading(false)
    }
  }, [sectionId, rates, displayCurrency])

  useEffect(() => { reload() }, [reload])

  const totalDisplay = accounts.reduce((s, a) => s + a.currentBalanceDisplay, 0)

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDeleteAccount(account: CashAccountWithBalance) {
    if (!confirm(t('confirmDeleteAccount', { name: account.name }))) return
    await deleteCashAccount(account.id)
    reload()
  }

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">{t('loading')}</p>

  return (
    <div className="space-y-4">

      {/* Celkový zůstatek */}
      {accounts.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">{t('totalBalance')}</p>
          <p className="text-3xl font-bold" style={{ color: sectionColor }}>
            {formatCurrency(totalDisplay, displayCurrency)}
          </p>
          {accounts.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              {accounts.length} {t('accounts')}
            </p>
          )}
        </div>
      )}

      {/* Graf vývoje */}
      {accounts.length > 0 && <CashChart accounts={accounts} displayCurrency={displayCurrency} rates={rates} sectionColor={sectionColor} t={t} />}

      {/* Seznam účtů */}
      <div className="space-y-2">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            displayCurrency={displayCurrency}
            expanded={expanded.has(account.id)}
            onToggle={() => toggleExpanded(account.id)}
            onEdit={() => setDialog({ mode: 'edit-account', account })}
            onDelete={() => handleDeleteAccount(account)}
            onAddEntry={() => setDialog({ mode: 'add-entry', account })}
            onHistory={() => setDialog({ mode: 'history', account })}
            t={t}
          />
        ))}
      </div>

      {/* Přidat účet */}
      <Button variant="outline" className="w-full" onClick={() => setDialog({ mode: 'add-account' })}>
        <Plus className="h-4 w-4 mr-2" />
        {t('addAccount')}
      </Button>

      {/* Dialogy */}
      {(dialog?.mode === 'add-account' || dialog?.mode === 'edit-account') && (
        <AccountDialog
          account={dialog.mode === 'edit-account' ? dialog.account : undefined}
          sectionId={sectionId}
          onClose={() => setDialog(null)}
          onSave={() => { setDialog(null); reload() }}
          t={t}
        />
      )}

      {dialog?.mode === 'add-entry' && (
        <EntryDialog
          account={dialog.account}
          onClose={() => setDialog(null)}
          onSave={() => { setDialog(null); reload() }}
          t={t}
        />
      )}

      {dialog?.mode === 'history' && (
        <HistoryDialog
          account={dialog.account}
          displayCurrency={displayCurrency}
          onClose={() => setDialog(null)}
          onDelete={async (id) => { await deleteCashBalanceEntry(id); reload() }}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Řádek účtu ───────────────────────────────────────────────────────────────

function AccountRow({
  account, displayCurrency, expanded, onToggle, onEdit, onDelete, onAddEntry, onHistory, t,
}: {
  account: CashAccountWithBalance
  displayCurrency: Currency
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddEntry: () => void
  onHistory: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
        <button className="shrink-0 text-muted-foreground" onClick={onToggle}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{account.name}</p>
          {account.note && <p className="text-xs text-muted-foreground truncate">{account.note}</p>}
        </div>

        <div className="text-right shrink-0">
          <p className="font-semibold tabular-nums">
            {formatCurrency(account.currentBalance, account.currency)}
          </p>
          {account.currency !== displayCurrency && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(account.currentBalanceDisplay, displayCurrency)}
            </p>
          )}
        </div>

        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddEntry} title={t('updateBalance')}>
            <TrendingUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onHistory} title={t('history')}>
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && account.history.length > 0 && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-2">{t('recentHistory')}</p>
          <div className="space-y-1">
            {account.history.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{entry.date}</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(entry.amount, account.currency)}
                  {entry.note && <span className="text-xs text-muted-foreground ml-2">{entry.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Graf vývoje ──────────────────────────────────────────────────────────────

function CashChart({ accounts, displayCurrency, rates, sectionColor, t }: {
  accounts: CashAccountWithBalance[]
  displayCurrency: Currency
  rates: CurrencyCache
  sectionColor: string
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  // Sloučíme historii všech účtů do jednoho časového řádku
  const allDates = new Set<string>()
  for (const acc of accounts) {
    for (const e of acc.history) allDates.add(e.date)
  }

  const sorted = Array.from(allDates).sort()
  if (sorted.length < 2) return null

  const chartData = sorted.map((date) => {
    let total = 0
    for (const acc of accounts) {
      const entry = acc.history.filter((e) => e.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
      if (entry) total += convertCurrency(entry.amount, acc.currency, displayCurrency, rates)
    }
    return { date, total }
  })

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('balanceHistory')}</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
          <Tooltip
            formatter={(v) => formatCurrency(Number(v ?? 0), displayCurrency)}
            labelFormatter={(l) => l}
          />
          <Line type="monotone" dataKey="total" stroke={sectionColor} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Dialog přidat/upravit účet ───────────────────────────────────────────────

function AccountDialog({ account, sectionId, onClose, onSave, t }: {
  account?: CashAccount
  sectionId: string
  onClose: () => void
  onSave: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  const [name, setName]         = useState(account?.name ?? '')
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? 'CZK')
  const [note, setNote]         = useState(account?.note ?? '')
  const [amount, setAmount]     = useState('')
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])

  async function handleSave() {
    if (!name.trim()) return
    const acc: CashAccount = {
      id:         account?.id ?? crypto.randomUUID(),
      section_id: sectionId,
      name:       name.trim(),
      currency,
      note:       note.trim() || undefined,
      created_at: account?.created_at ?? new Date().toISOString(),
    }
    await saveCashAccount(acc)

    // Při přidávání nového účtu rovnou zadat první zůstatek
    if (!account) {
      const parsed = parseFloat(amount.replace(',', '.'))
      if (!isNaN(parsed) && parsed >= 0) {
        await saveCashBalanceEntry({
          id:         crypto.randomUUID(),
          account_id: acc.id,
          amount:     parsed,
          date,
          created_at: new Date().toISOString(),
        })
      }
    }
    onSave()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{account ? t('editAccount') : t('addAccount')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>{t('accountName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accountNamePlaceholder')} autoFocus />
          </div>

          <div className="space-y-1">
            <Label>{t('currency')}</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{t('note')} <span className="text-muted-foreground text-xs">({t('optional')})</span></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
          </div>

          {!account && (
            <>
              <div className="space-y-1">
                <Label>{t('initialBalance')}</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>{t('date')}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
            <Button className="flex-1" disabled={!name.trim()} onClick={handleSave}>{t('save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog zadat nový zůstatek ───────────────────────────────────────────────

function EntryDialog({ account, onClose, onSave, t }: {
  account: CashAccountWithBalance
  onClose: () => void
  onSave: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  const [amount, setAmount] = useState(String(account.currentBalance || ''))
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [note, setNote]     = useState('')

  const prev = account.currentBalance
  const next = parseFloat(amount.replace(',', '.'))
  const diff = !isNaN(next) ? next - prev : null

  async function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) return
    await saveCashBalanceEntry({
      id:         crypto.randomUUID(),
      account_id: account.id,
      amount:     parsed,
      date,
      note:       note.trim() || undefined,
      created_at: new Date().toISOString(),
    })
    onSave()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('updateBalance')} — {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>{t('newBalance')} ({account.currency})</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" autoFocus />
            {diff !== null && (
              <p className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {diff >= 0 ? '+' : ''}{diff.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {account.currency}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{t('date')}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('note')} <span className="text-muted-foreground text-xs">({t('optional')})</span></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
            <Button className="flex-1" disabled={isNaN(parseFloat(amount))} onClick={handleSave}>{t('save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog historie ──────────────────────────────────────────────────────────

function HistoryDialog({ account, displayCurrency, onClose, onDelete, t }: {
  account: CashAccountWithBalance
  displayCurrency: Currency
  onClose: () => void
  onDelete: (id: string) => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('historyTitle')} — {account.name}</DialogTitle>
        </DialogHeader>
        {account.history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('noHistory')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-left font-medium">{t('date')}</th>
                  <th className="py-2 text-right font-medium">{t('balance')}</th>
                  <th className="py-2 text-left font-medium pl-3">{t('note')}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {account.history.map((entry, i) => (
                  <tr key={entry.id} className={`border-b last:border-0 ${i === 0 ? 'font-medium bg-primary/5' : ''}`}>
                    <td className="py-2 tabular-nums">
                      {entry.date}
                      {i === 0 && <span className="ml-2 text-xs text-primary">{t('current')}</span>}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {formatCurrency(entry.amount, account.currency)}
                    </td>
                    <td className="py-2 pl-3 text-muted-foreground text-xs">{entry.note ?? '—'}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                        onClick={() => {
                          if (account.history.length <= 1) { alert(t('cannotDeleteLast')); return }
                          if (confirm(t('confirmDeleteEntry', { date: entry.date }))) onDelete(entry.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="outline" className="w-full mt-2" onClick={onClose}>{t('close')}</Button>
      </DialogContent>
    </Dialog>
  )
}
