'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, History, ChevronDown, ChevronUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
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
  computeBalanceAtDate,
} from '@/lib/db/cash'
import type { CashAccount, CashAccountWithBalance, CashBalanceEntry, CashEnvelopeType, CashEntryType } from '@/types/cash'
import { ENVELOPE_TYPE_COLORS } from '@/types/cash'
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
  | { mode: 'transaction'; account: CashAccountWithBalance; txType: 'deposit' | 'withdrawal' }
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
      {accounts.length > 0 && (
        <CashChart accounts={accounts} displayCurrency={displayCurrency} rates={rates} sectionColor={sectionColor} t={t} />
      )}

      {/* Seznam obálek */}
      <div className="space-y-2">
        {accounts.map((account) => (
          <EnvelopeRow
            key={account.id}
            account={account}
            displayCurrency={displayCurrency}
            expanded={expanded.has(account.id)}
            onToggle={() => toggleExpanded(account.id)}
            onEdit={() => setDialog({ mode: 'edit-account', account })}
            onDelete={() => handleDeleteAccount(account)}
            onDeposit={() => setDialog({ mode: 'transaction', account, txType: 'deposit' })}
            onWithdrawal={() => setDialog({ mode: 'transaction', account, txType: 'withdrawal' })}
            onHistory={() => setDialog({ mode: 'history', account })}
            t={t}
          />
        ))}
      </div>

      {/* Přidat obálku */}
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

      {dialog?.mode === 'transaction' && (
        <TransactionDialog
          account={dialog.account}
          initialType={dialog.txType}
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

// ─── Řádek obálky ─────────────────────────────────────────────────────────────

function EnvelopeRow({
  account, displayCurrency, expanded, onToggle, onEdit, onDelete, onDeposit, onWithdrawal, onHistory, t,
}: {
  account: CashAccountWithBalance
  displayCurrency: Currency
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onDeposit: () => void
  onWithdrawal: () => void
  onHistory: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  const envColor = ENVELOPE_TYPE_COLORS[account.envelope_type]

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button className="shrink-0 text-muted-foreground" onClick={onToggle}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${envColor}20`, color: envColor }}
            >
              {t(`envelope_${account.envelope_type}`)}
            </span>
            <p className="font-medium truncate">{account.name}</p>
          </div>
          {account.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{account.note}</p>}
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
      </div>

      {/* Akce */}
      <div className="flex items-center gap-1 px-3 pb-2.5 border-t pt-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700" onClick={onDeposit}>
          <ArrowDownCircle className="h-3.5 w-3.5" />
          {t('deposit')}
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600" onClick={onWithdrawal}>
          <ArrowUpCircle className="h-3.5 w-3.5" />
          {t('withdrawal')}
        </Button>
        <div className="flex-1" />
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

      {/* Poslední transakce (rozbaleno) */}
      {expanded && account.history.length > 0 && (
        <div className="border-t px-4 py-3 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-2">{t('recentHistory')}</p>
          <div className="space-y-1">
            {account.history.slice(0, 5).map((entry) => (
              <TransactionLine key={entry.id} entry={entry} currency={account.currency} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Řádek transakce ──────────────────────────────────────────────────────────

function TransactionLine({ entry, currency }: { entry: CashBalanceEntry; currency: string }) {
  const t = useTranslations('cash')
  const isDeposit    = entry.type === 'deposit'
  const isWithdrawal = entry.type === 'withdrawal'
  const isBalance    = entry.type === 'balance'

  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground tabular-nums">{entry.date}</span>
      <div className="flex items-center gap-2">
        {entry.note && <span className="text-xs text-muted-foreground">{entry.note}</span>}
        <span className={`font-mono tabular-nums font-medium ${isDeposit ? 'text-green-600' : isWithdrawal ? 'text-red-500' : 'text-muted-foreground'}`}>
          {isDeposit && '+'}
          {isWithdrawal && '−'}
          {isBalance && `${t('balanceEntry')}: `}
          {formatCurrency(entry.amount, currency)}
        </span>
      </div>
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
  const allDates = new Set<string>()
  for (const acc of accounts) {
    for (const e of acc.history) allDates.add(e.date)
  }

  const sorted = Array.from(allDates).sort()
  if (sorted.length < 2) return null

  const chartData = sorted.map((date) => {
    let total = 0
    for (const acc of accounts) {
      const balance = computeBalanceAtDate(acc.history, date)
      total += convertCurrency(balance, acc.currency, displayCurrency, rates)
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

// ─── Dialog přidat/upravit obálku ─────────────────────────────────────────────

const ENVELOPE_TYPES: CashEnvelopeType[] = ['reserve', 'spending', 'general']

function AccountDialog({ account, sectionId, onClose, onSave, t }: {
  account?: CashAccount
  sectionId: string
  onClose: () => void
  onSave: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  const [name, setName]               = useState(account?.name ?? '')
  const [currency, setCurrency]       = useState<Currency>(account?.currency ?? 'CZK')
  const [envelopeType, setEnvelopeType] = useState<CashEnvelopeType>(account?.envelope_type ?? 'general')
  const [note, setNote]               = useState(account?.note ?? '')
  const [amount, setAmount]           = useState('')
  const [date, setDate]               = useState(new Date().toISOString().split('T')[0])

  async function handleSave() {
    if (!name.trim()) return
    const acc: CashAccount = {
      id:            account?.id ?? crypto.randomUUID(),
      section_id:    sectionId,
      name:          name.trim(),
      currency,
      envelope_type: envelopeType,
      note:          note.trim() || undefined,
      created_at:    account?.created_at ?? new Date().toISOString(),
    }
    await saveCashAccount(acc)

    if (!account) {
      const parsed = parseFloat(amount.replace(',', '.'))
      if (!isNaN(parsed) && parsed >= 0) {
        await saveCashBalanceEntry({
          id:         crypto.randomUUID(),
          account_id: acc.id,
          type:       'balance',
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
            <Label>{t('envelopeType')}</Label>
            <div className="flex gap-2">
              {ENVELOPE_TYPES.map((et) => {
                const color = ENVELOPE_TYPE_COLORS[et]
                const active = envelopeType === et
                return (
                  <button
                    key={et}
                    type="button"
                    onClick={() => setEnvelopeType(et)}
                    className="flex-1 py-1.5 px-2 rounded-md border text-xs font-medium transition-all"
                    style={active ? { backgroundColor: `${color}20`, borderColor: color, color } : {}}
                  >
                    {t(`envelope_${et}`)}
                  </button>
                )
              })}
            </div>
          </div>

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

// ─── Dialog vklad / výběr ─────────────────────────────────────────────────────

function TransactionDialog({ account, initialType, onClose, onSave, t }: {
  account: CashAccountWithBalance
  initialType: 'deposit' | 'withdrawal'
  onClose: () => void
  onSave: () => void
  t: ReturnType<typeof useTranslations<'cash'>>
}) {
  const [txType, setTxType] = useState<'deposit' | 'withdrawal'>(initialType)
  const [amount, setAmount] = useState('')
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [note, setNote]     = useState('')

  const parsed = parseFloat(amount.replace(',', '.'))
  const valid  = !isNaN(parsed) && parsed > 0

  const newBalance = valid
    ? account.currentBalance + (txType === 'deposit' ? parsed : -parsed)
    : null

  async function handleSave() {
    if (!valid) return
    await saveCashBalanceEntry({
      id:         crypto.randomUUID(),
      account_id: account.id,
      type:       txType as CashEntryType,
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
          <DialogTitle>{account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">

          {/* Typ transakce */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTxType('deposit')}
              className={`flex-1 py-2 rounded-md border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${txType === 'deposit' ? 'bg-green-50 border-green-400 text-green-700' : 'text-muted-foreground'}`}
            >
              <ArrowDownCircle className="h-4 w-4" />
              {t('deposit')}
            </button>
            <button
              type="button"
              onClick={() => setTxType('withdrawal')}
              className={`flex-1 py-2 rounded-md border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${txType === 'withdrawal' ? 'bg-red-50 border-red-400 text-red-600' : 'text-muted-foreground'}`}
            >
              <ArrowUpCircle className="h-4 w-4" />
              {t('withdrawal')}
            </button>
          </div>

          <div className="space-y-1">
            <Label>{t('transactionAmount')} ({account.currency})</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" autoFocus />
            {newBalance !== null && (
              <p className="text-xs text-muted-foreground">
                {t('newBalanceAfter')}: <span className="font-medium tabular-nums">{formatCurrency(newBalance, account.currency)}</span>
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
            <Button className="flex-1" disabled={!valid} onClick={handleSave}>{t('save')}</Button>
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
                  <th className="py-2 text-left font-medium pl-2">{t('transactionType')}</th>
                  <th className="py-2 text-right font-medium">{t('transactionAmount')}</th>
                  <th className="py-2 text-left font-medium pl-3">{t('note')}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {account.history.map((entry) => {
                  const isDeposit    = entry.type === 'deposit'
                  const isWithdrawal = entry.type === 'withdrawal'
                  return (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 tabular-nums text-muted-foreground">{entry.date}</td>
                      <td className="py-2 pl-2">
                        <span className={`text-xs font-medium ${isDeposit ? 'text-green-600' : isWithdrawal ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {isDeposit ? t('deposit') : isWithdrawal ? t('withdrawal') : t('balanceEntry')}
                        </span>
                      </td>
                      <td className={`py-2 text-right font-mono tabular-nums ${isDeposit ? 'text-green-600' : isWithdrawal ? 'text-red-500' : ''}`}>
                        {isDeposit && '+'}
                        {isWithdrawal && '−'}
                        {formatCurrency(entry.amount, account.currency)}
                      </td>
                      <td className="py-2 pl-3 text-muted-foreground text-xs">{entry.note ?? '—'}</td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                          onClick={() => {
                            if (confirm(t('confirmDeleteEntry', { date: entry.date }))) onDelete(entry.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Button variant="outline" className="w-full mt-2" onClick={onClose}>{t('close')}</Button>
      </DialogContent>
    </Dialog>
  )
}
