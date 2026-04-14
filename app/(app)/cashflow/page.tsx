'use client'

import { useEffect, useState, useCallback } from 'react'
import { Eye, EyeOff, TrendingUp, TrendingDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSettings } from '@/lib/context/settings-context'
import {
  initializeCashflow,
  getCashflowCategories,
  getCashflowItems,
  getCashflowHistory,
  getCashflowHidden,
  toggleCashflowHidden,
  getCategoryMonthly,
} from '@/lib/cashflow-storage'
import {
  getCurrencyCache,
  type CurrencyCache,
} from '@/lib/storage'
import { formatCurrency } from '@/lib/format'
import { CashflowTree } from '@/components/cashflow/cashflow-tree'
import type { CashflowCategory, CashflowItem, CashflowItemHistory } from '@/types/cashflow'

export default function CashflowPage() {
  const { settings } = useSettings()
  const t = useTranslations('cashflow')

  const [categories, setCategories] = useState<CashflowCategory[]>([])
  const [items, setItems]           = useState<CashflowItem[]>([])
  const [history, setHistory]       = useState<CashflowItemHistory[]>([])
  const [rates, setRates]           = useState<CurrencyCache | null>(null)
  const [hiddenIds, setHiddenIds]   = useState<string[]>([])

  const reload = useCallback(() => {
    setCategories(getCashflowCategories())
    setItems(getCashflowItems())
    setHistory(getCashflowHistory())
    setHiddenIds(getCashflowHidden())
  }, [])

  useEffect(() => {
    initializeCashflow()
    reload()
    const cached = getCurrencyCache()
    if (cached) {
      setRates(cached)
    } else {
      fetch('/api/currencies')
        .then((r) => r.json())
        .then((data) => setRates({ eurCzk: data.eurCzk, eurUsd: data.eurUsd, rates: data.rates ?? {}, updatedAt: new Date().toISOString() }))
        .catch(() => setRates({ eurCzk: 25.0, eurUsd: 1.08, rates: {}, updatedAt: new Date().toISOString() }))
    }
  }, [reload])

  if (!rates) {
    return <div className="p-6 text-muted-foreground text-sm">{t('loading')}</div>
  }

  // ── Top-level kategorie ────────────────────────────────────────────────────
  const topLevel = categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.order - b.order)

  const expenseTopLevel = topLevel.filter((c) => c.type === 'expense')
  const incomeTopLevel  = topLevel.filter((c) => c.type === 'income')

  function getMonthly(catId: string) {
    return getCategoryMonthly(catId, categories, items, history, rates!, settings.displayCurrency)
  }

  function handleToggle(catId: string) {
    const next = toggleCashflowHidden(catId)
    setHiddenIds(next)
  }

  const isHidden = (id: string) => hiddenIds.includes(id)

  // ── Výpočty (jen z viditelných kategorií) ─────────────────────────────────
  const totalIncome   = incomeTopLevel
    .filter((c) => !isHidden(c.id))
    .reduce((s, c) => s + getMonthly(c.id), 0)

  const totalExpenses = expenseTopLevel
    .filter((c) => !isHidden(c.id))
    .reduce((s, c) => s + getMonthly(c.id), 0)

  const freeCashflow = totalIncome - totalExpenses
  const savingsRate  = totalIncome > 0 ? (freeCashflow / totalIncome) * 100 : null
  const cfPositive   = freeCashflow >= 0

  // ── Viditelné sekce pro stromy ─────────────────────────────────────────────
  const visibleExpenses = expenseTopLevel.filter((c) => !isHidden(c.id))
  const visibleIncome   = incomeTopLevel.filter((c) => !isHidden(c.id))

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* ── Přehledová tabulka ──────────────────────────────────────────────── */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left font-semibold">{t('category')}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t('monthly')}</th>
              <th className="px-4 py-2.5 text-right font-semibold">{t('annual')}</th>
              <th className="px-3 py-2.5 text-center font-semibold w-10" title={t('showHide')}>
                <Eye className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Příjmy */}
            {incomeTopLevel.map((cat) => {
              const monthly = getMonthly(cat.id)
              const hidden  = isHidden(cat.id)
              return (
                <tr key={cat.id} className={`border-b transition-colors ${hidden ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-green-700 dark:text-green-400">{cat.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-green-700 dark:text-green-400">
                    {hidden ? '—' : formatCurrency(monthly, settings.displayCurrency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-green-700 dark:text-green-400">
                    {hidden ? '—' : formatCurrency(monthly * 12, settings.displayCurrency)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => handleToggle(cat.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={hidden ? t('show') : t('hide')}
                    >
                      {hidden ? <EyeOff className="h-3.5 w-3.5 mx-auto" /> : <Eye className="h-3.5 w-3.5 mx-auto" />}
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* Výdaje */}
            {expenseTopLevel.map((cat) => {
              const monthly = getMonthly(cat.id)
              const hidden  = isHidden(cat.id)
              return (
                <tr key={cat.id} className={`border-b transition-colors ${hidden ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-medium">{cat.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                    {hidden ? '—' : (monthly > 0 ? `-${formatCurrency(monthly, settings.displayCurrency)}` : '—')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                    {hidden ? '—' : (monthly > 0 ? `-${formatCurrency(monthly * 12, settings.displayCurrency)}` : '—')}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => handleToggle(cat.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={hidden ? t('show') : t('hide')}
                    >
                      {hidden ? <EyeOff className="h-3.5 w-3.5 mx-auto" /> : <Eye className="h-3.5 w-3.5 mx-auto" />}
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* Oddělovač */}
            <tr className="border-b-2 border-foreground/20"><td colSpan={4} /></tr>

            {/* Volné cashflow */}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-4 py-3 flex items-center gap-2">
                {cfPositive
                  ? <TrendingUp className="h-4 w-4 text-green-500" />
                  : <TrendingDown className="h-4 w-4 text-red-500" />}
                {t('freeCashflow')}
              </td>
              <td className={`px-4 py-3 text-right font-mono tabular-nums text-lg ${cfPositive ? 'text-green-600' : 'text-red-600'}`}>
                {cfPositive ? '+' : ''}{formatCurrency(freeCashflow, settings.displayCurrency)}
              </td>
              <td className={`px-4 py-3 text-right font-mono tabular-nums ${cfPositive ? 'text-green-600' : 'text-red-600'}`}>
                {cfPositive ? '+' : ''}{formatCurrency(freeCashflow * 12, settings.displayCurrency)}
              </td>
              <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                {savingsRate !== null ? `${savingsRate.toFixed(1)} %` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Stromy — jen viditelné kategorie ──────────────────────────────────── */}
      {visibleExpenses.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">{t('expenses')}</h2>
          <div className="border rounded-lg bg-card py-1">
            <CashflowTree
              categories={categories}
              items={items}
              history={history}
              displayCurrency={settings.displayCurrency}
              rates={rates}
              type="expense"
              visibleTopIds={visibleExpenses.map((c) => c.id)}
              onDataChange={reload}
            />
          </div>
        </div>
      )}

      {visibleIncome.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">{t('income')}</h2>
          <div className="border rounded-lg bg-card py-1">
            <CashflowTree
              categories={categories}
              items={items}
              history={history}
              displayCurrency={settings.displayCurrency}
              rates={rates}
              type="income"
              visibleTopIds={visibleIncome.map((c) => c.id)}
              onDataChange={reload}
            />
          </div>
        </div>
      )}

      {visibleExpenses.length === 0 && visibleIncome.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t('allHidden')}
        </p>
      )}
    </div>
  )
}
