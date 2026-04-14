'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  getCategoryMonthly,
  getCurrentAmount,
  getMonthlyAmount,
  createCashflowItem,
  updateCashflowItem,
  deleteCashflowItem,
  deleteCashflowCategory,
  deleteCashflowHistoryEntry,
  saveCashflowCategory,
} from '@/lib/cashflow-storage'
import {
  FREQUENCY_LABELS,
  type CashflowCategory,
  type CashflowItem,
  type CashflowItemHistory,
  type CashflowFrequency,
  type CashflowNodeType,
} from '@/types/cashflow'
import { CURRENCIES, type Currency } from '@/types'
import { formatCurrency } from '@/lib/format'
import type { CurrencyCache } from '@/lib/storage'

// ─── Typy ─────────────────────────────────────────────────────────────────────

interface CashflowTreeProps {
  categories: CashflowCategory[]
  items: CashflowItem[]
  history: CashflowItemHistory[]
  displayCurrency: Currency
  rates: CurrencyCache
  type: CashflowNodeType
  visibleTopIds?: string[]   // pokud zadáno, renderuje jen tyto top-level kategorie
  onDataChange: () => void
}

type DialogState =
  | { mode: 'add-item'; categoryId: string; suggestions: string[] }
  | { mode: 'edit-item'; item: CashflowItem; currentAmount: number }
  | { mode: 'add-category'; parentId: string | null; type: CashflowNodeType }
  | { mode: 'edit-category'; category: CashflowCategory }
  | { mode: 'history'; item: CashflowItem }
  | null

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

export function CashflowTree({
  categories,
  items,
  history,
  displayCurrency,
  rates,
  type,
  visibleTopIds,
  onDataChange,
}: CashflowTreeProps) {
  const t    = useTranslations('cashflowTree')
  const tEnum = useTranslations('enums')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogState>(null)

  const topLevel = categories
    .filter((c) => c.parent_id === null && c.type === type)
    .filter((c) => !visibleTopIds || visibleTopIds.includes(c.id))
    .sort((a, b) => a.order - b.order)

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDeleteItem(item: CashflowItem) {
    if (!confirm(t('confirmDeleteItem', { name: item.name }))) return
    deleteCashflowItem(item.id)
    onDataChange()
  }

  function handleDeleteCategory(cat: CashflowCategory) {
    const hasChildren = categories.some((c) => c.parent_id === cat.id)
    const hasItems = items.some((i) => i.category_id === cat.id)
    if (hasChildren || hasItems) {
      alert(t('cannotDeleteCategory'))
      return
    }
    if (!confirm(t('confirmDeleteCategory', { name: cat.name }))) return
    deleteCashflowCategory(cat.id)
    onDataChange()
  }

  function openAddItem(categoryId: string, suggestions: string[]) {
    setDialog({ mode: 'add-item', categoryId, suggestions })
  }

  function openEditItem(item: CashflowItem) {
    const currentAmount = getCurrentAmount(item.id, history)
    setDialog({ mode: 'edit-item', item, currentAmount })
  }

  function openAddCategory(parentId: string | null) {
    setDialog({ mode: 'add-category', parentId, type })
  }

  function openEditCategory(category: CashflowCategory) {
    setDialog({ mode: 'edit-category', category })
  }

  function openHistory(item: CashflowItem) {
    setDialog({ mode: 'history', item })
  }

  // ── Renderer řádku kategorie ──────────────────────────────────────────────

  function renderCategory(cat: CashflowCategory, depth: number) {
    const isExpanded = expanded.has(cat.id)
    const children = categories
      .filter((c) => c.parent_id === cat.id)
      .sort((a, b) => a.order - b.order)
    const directItems = items.filter((i) => i.category_id === cat.id)
    const monthly = getCategoryMonthly(cat.id, categories, items, history, rates, displayCurrency)
    const hasContent = children.length > 0 || directItems.length > 0
    // Kategorie 2. úrovně (podkategorie) mohou přijímat položky přímo
    const canAddItems = depth >= 1 || children.length === 0
    // Kategorie 1. úrovně s přímými položkami (Bydlení) nebo 2. úrovně
    const suggestions = cat.item_suggestions ?? []
    // Přidávat podkategorie mohou jen top-level kategorie (depth=0)
    const canAddSubcategory = depth === 0

    return (
      <div key={cat.id}>
        {/* Řádek kategorie */}
        <div
          className={`flex items-center gap-1 py-2 px-3 rounded-md hover:bg-muted/40 transition-colors group
            ${depth === 0 ? 'font-semibold text-sm' : 'text-sm'}`}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {/* Expand/collapse */}
          <button
            className="w-5 h-5 flex items-center justify-center text-muted-foreground shrink-0"
            onClick={() => toggleExpand(cat.id)}
          >
            {hasContent
              ? isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
              : <span className="w-3.5 h-3.5" />
            }
          </button>

          {/* Název */}
          <span className="flex-1 truncate">{cat.name}</span>

          {/* Měsíční součet */}
          <span className={`font-mono text-sm tabular-nums shrink-0 mr-2 ${monthly > 0 ? '' : 'text-muted-foreground'}`}>
            {monthly > 0 ? formatCurrency(monthly, displayCurrency) : '—'}
          </span>

          {/* Akce (zobrazit jen při hoveru) */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {(canAddItems || depth === 1) && (
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title={t('addItemTitle')}
                onClick={() => openAddItem(cat.id, suggestions)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            {canAddSubcategory && (
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title={t('addSubcategoryTitle')}
                onClick={() => openAddCategory(cat.id)}
              >
                <span className="text-xs font-bold">+K</span>
              </Button>
            )}
            {!cat.is_preset && (
              <>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => openEditCategory(cat)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteCategory(cat)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Obsah (podkategorie + položky) */}
        {isExpanded && (
          <>
            {children.map((child) => renderCategory(child, depth + 1))}
            {directItems.map((item) => renderItem(item, depth + 1))}
          </>
        )}
      </div>
    )
  }

  // ── Renderer řádku položky ────────────────────────────────────────────────

  function renderItem(item: CashflowItem, depth: number) {
    const monthlyDisplay = getMonthlyAmount(item, history, rates, displayCurrency)

    return (
      <div
        key={item.id}
        className="flex items-center gap-1 py-1.5 px-3 rounded-md hover:bg-muted/30 transition-colors group text-sm"
        style={{ paddingLeft: `${depth * 20 + 12 + 24}px` }}
      >
        <span className="flex-1 truncate text-muted-foreground">{item.name}</span>

        <Badge variant="outline" className="text-xs font-normal mr-1 shrink-0">
          {tEnum(`frequencies.${item.frequency}`)}
        </Badge>

        <span className="font-mono text-sm tabular-nums shrink-0 mr-2">
          {formatCurrency(monthlyDisplay, displayCurrency)}
          <span className="text-muted-foreground text-xs">{t('perMonth')}</span>
        </span>

        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title={t('historyValues')}
            onClick={() => openHistory(item)}
          >
            <History className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => openEditItem(item)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => handleDeleteItem(item)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {topLevel.map((cat) => renderCategory(cat, 0))}

      {/* Přidat vlastní top-level sekci */}
      <button
        onClick={() => openAddCategory(null)}
        className="flex items-center gap-2 px-4 py-2 w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-md transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('addSection')}
      </button>

      {/* Formulářový dialog */}
      {dialog?.mode !== 'history' && (
        <CashflowDialog
          key={dialog
            ? dialog.mode === 'add-item'        ? `add-item-${dialog.categoryId}`
            : dialog.mode === 'edit-item'       ? `edit-item-${dialog.item.id}`
            : dialog.mode === 'add-category'    ? `add-cat-${dialog.parentId ?? 'top'}`
            : dialog.mode === 'edit-category'   ? `edit-cat-${dialog.category.id}`
            : 'dialog'
            : 'closed'
          }
          state={dialog}
          displayCurrency={displayCurrency}
          onClose={() => setDialog(null)}
          onSave={() => { setDialog(null); onDataChange() }}
          categories={categories}
        />
      )}

      {/* Dialog historie */}
      {dialog?.mode === 'history' && (
        <HistoryDialog
          item={dialog.item}
          history={history}
          displayCurrency={displayCurrency}
          onClose={() => setDialog(null)}
          onDelete={(entryId) => {
            deleteCashflowHistoryEntry(entryId)
            onDataChange()
          }}
        />
      )}
    </div>
  )
}

// ─── Dialog (přidat/upravit položku nebo kategorii) ──────────────────────────

interface CashflowDialogProps {
  state: DialogState
  displayCurrency: Currency
  categories: CashflowCategory[]
  onClose: () => void
  onSave: () => void
}

function CashflowDialog({ state, displayCurrency, categories, onClose, onSave }: CashflowDialogProps) {
  const t     = useTranslations('cashflowTree')
  const tCommon = useTranslations('common')
  const tEnum  = useTranslations('enums')
  // Inicializace přímo z props — spolehlivé díky key-remount na rodičovské komponentě
  const [name, setName]           = useState(
    state?.mode === 'edit-item'     ? state.item.name
    : state?.mode === 'edit-category' ? state.category.name
    : ''
  )
  const [amount, setAmount]       = useState(
    state?.mode === 'edit-item' ? String(state.currentAmount) : ''
  )
  const [currency, setCurrency]   = useState<Currency>(
    state?.mode === 'edit-item' ? state.item.currency : displayCurrency
  )
  const [frequency, setFrequency] = useState<CashflowFrequency>(
    state?.mode === 'edit-item' ? state.item.frequency : 'monthly'
  )
  const [dueDate, setDueDate]     = useState(
    state?.mode === 'edit-item' ? (state.item.due_date ?? '') : ''
  )
  const [notes, setNotes]         = useState(
    state?.mode === 'edit-item' ? (state.item.notes ?? '') : ''
  )
  const [step, setStep]           = useState<'pick' | 'form'>(
    state?.mode === 'add-item' && (state.suggestions?.length ?? 0) > 0 ? 'pick' : 'form'
  )

  function handleOpen(open: boolean) {
    if (!open) onClose()
  }

  function pickSuggestion(suggestion: string) {
    setName(suggestion)
    setStep('form')
  }

  function handleSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (!name.trim()) return

    if (state?.mode === 'add-item') {
      if (isNaN(parsedAmount) || parsedAmount <= 0) return
      createCashflowItem({
        categoryId: state.categoryId,
        name:       name.trim(),
        currency,
        frequency,
        amount:     parsedAmount,
        dueDate:    dueDate || undefined,
        notes:      notes || undefined,
      })
    } else if (state?.mode === 'edit-item') {
      if (isNaN(parsedAmount) || parsedAmount <= 0) return
      updateCashflowItem({
        item:          state.item,
        newAmount:     parsedAmount,
        newFrequency:  frequency,
        newCurrency:   currency,
        newName:       name.trim(),
        newDueDate:    dueDate || undefined,
        newNotes:      notes || undefined,
        currentAmount: state.currentAmount,
      })
    } else if (state?.mode === 'add-category') {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.order), 0)
      saveCashflowCategory({
        id:         crypto.randomUUID(),
        name:       name.trim(),
        parent_id:  state.parentId,
        type:       state.type,
        is_preset:  false,
        order:      maxOrder + 1,
        created_at: new Date().toISOString(),
      })
    } else if (state?.mode === 'edit-category') {
      saveCashflowCategory({ ...state.category, name: name.trim() })
    }

    onSave()
  }

  const isItem = state?.mode === 'add-item' || state?.mode === 'edit-item'
  const title =
    state?.mode === 'add-item'                               ? t('dialogAddItem')
    : state?.mode === 'edit-item'                            ? t('dialogEditItem')
    : state?.mode === 'add-category' && state.parentId === null ? t('dialogNewSection')
    : state?.mode === 'add-category'                         ? t('dialogNewSubcategory')
    : state?.mode === 'edit-category'                        ? t('dialogRenameCategory')
    : ''

  const isValid = name.trim().length > 0 &&
    (!isItem || (parseFloat(amount.replace(',', '.')) > 0))

  return (
    <Dialog open={state !== null && state.mode !== 'history'} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Krok 1 — výběr z nabídky (jen pro add-item) */}
        {step === 'pick' && state?.mode === 'add-item' && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">{t('selectOrCustom')}</p>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {state.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => pickSuggestion(s)}
                  className="px-3 py-2 rounded-md border text-sm text-left hover:bg-muted transition-colors"
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => { setName(''); setStep('form') }}
                className="px-3 py-2 rounded-md border text-sm text-left hover:bg-muted transition-colors text-muted-foreground"
              >
                {t('customOption')}
              </button>
            </div>
          </div>
        )}

        {/* Krok 2 — formulář */}
        {step === 'form' && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>{tCommon('name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('itemNamePlaceholder')}
                autoFocus
              />
            </div>

            {isItem && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>{tCommon('amount')}</Label>
                    <Input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tCommon('currency')}</Label>
                    <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>{t('frequency')}</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as CashflowFrequency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQUENCY_LABELS) as CashflowFrequency[]).map((k) => (
                        <SelectItem key={k} value={k}>{tEnum(`frequencies.${k}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>{t('dueDate')} <span className="text-muted-foreground text-xs">{t('dueDateOptional')}</span></Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button className="flex-1" disabled={!isValid} onClick={handleSave}>
                {state?.mode === 'edit-item' || state?.mode === 'edit-category' ? t('saveBtn') : t('addBtn')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog historie hodnot ───────────────────────────────────────────────────

interface HistoryDialogProps {
  item: CashflowItem
  history: CashflowItemHistory[]
  displayCurrency: Currency
  onClose: () => void
  onDelete: (entryId: string) => void
}

function HistoryDialog({ item, history, displayCurrency, onClose, onDelete }: HistoryDialogProps) {
  const t      = useTranslations('cashflowTree')
  const tCommon = useTranslations('common')
  const today = new Date().toISOString().split('T')[0]

  const entries = history
    .filter((h) => h.item_id === item.id)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from)) // nejnovější nahoře

  const currentEntry = entries.find((h) => h.valid_from <= today)

  function handleDelete(entry: CashflowItemHistory) {
    if (entries.length <= 1) {
      alert(t('cannotDeleteLastEntry'))
      return
    }
    if (!confirm(t('confirmDeleteEntry', { date: entry.valid_from }))) return
    onDelete(entry.id)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('historyTitle', { name: item.name })}</DialogTitle>
        </DialogHeader>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('noRecords')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-left font-medium">{t('validFrom')}</th>
                  <th className="py-2 text-right font-medium">{tCommon('amount')}</th>
                  <th className="py-2 text-left font-medium pl-3">{t('noteHeader')}</th>
                  <th className="py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isCurrent = entry.id === currentEntry?.id
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b last:border-0 ${isCurrent ? 'bg-primary/5 font-medium' : ''}`}
                    >
                      <td className="py-2 tabular-nums">
                        {entry.valid_from}
                        {isCurrent && (
                          <span className="ml-2 text-xs text-primary">{t('current')}</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {entry.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })}
                        <span className="text-muted-foreground text-xs ml-1">{item.currency}</span>
                      </td>
                      <td className="py-2 pl-3 text-muted-foreground">
                        {entry.notes ?? '—'}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(entry)}
                          title={t('deleteEntry')}
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

        <div className="pt-2">
          <Button variant="outline" className="w-full" onClick={onClose}>{t('close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
