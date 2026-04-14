'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Download, Upload, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/lib/context/settings-context'
import { useSections } from '@/lib/context/sections-context'
import {
  getAssets,
  getTransactions,
  saveAsset,
  saveTransaction,
  getSections,
  saveSection,
  generateId,
} from '@/lib/storage'
import {
  CURRENCIES,
  CURRENCY_LABELS,
  ASSET_TYPE_TO_TEMPLATE,
  TEMPLATE_LABELS,
  type Currency,
} from '@/types'
import {
  transactionsToCsv,
  cashflowToCsv,
  downloadCsv,
  csvFilename,
  parseCsv,
} from '@/lib/csv'
import {
  getCashflowCategories,
  getCashflowItems,
  getCashflowHistory,
} from '@/lib/cashflow-storage'

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { sections, saveSection: saveSectionCtx } = useSections()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const t = useTranslations('settings')
  const tEnum = useTranslations('enums')

  // ── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const assets       = getAssets()
    const transactions = getTransactions()
    const categories   = getCashflowCategories()
    const items        = getCashflowItems()
    const history      = getCashflowHistory()

    const hasPortfolio = transactions.length > 0
    const hasCashflow  = items.length > 0

    if (!hasPortfolio && !hasCashflow) {
      toast.warning(t('noDataToExport'))
      return
    }

    if (hasPortfolio) {
      downloadCsv(transactionsToCsv(assets, transactions), csvFilename('portfolio'))
    }
    if (hasCashflow) {
      downloadCsv(cashflowToCsv(categories, items, history), csvFilename('cashflow'))
    }

    const parts = [hasPortfolio && 'portfolio', hasCashflow && 'cashflow'].filter(Boolean).join(' + ')
    toast.success(t('exported', { parts }))
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    try {
      const text = await file.text()
      const { rows, errors } = parseCsv(text)

      if (errors.length > 0) {
        toast.error(t('importError', { error: `${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} dalších)` : ''}` }))
      }

      if (rows.length === 0) { setImporting(false); return }

      // Načíst aktuální stav
      const currentSections = getSections()
      const currentAssets = getAssets()

      let imported = 0
      let skipped = 0

      for (const row of rows) {
        const template = ASSET_TYPE_TO_TEMPLATE[row.assetType]

        // Najít nebo vytvořit sekci dle šablony
        let section = currentSections.find((s) => s.template === template)
        if (!section) {
          section = {
            id: generateId(),
            name: TEMPLATE_LABELS[template],
            template,
            created_at: new Date().toISOString(),
          }
          currentSections.push(section)
          saveSectionCtx(section)
        }

        // Najít nebo vytvořit aktivum
        const isAuto = !!row.ticker
        let asset = currentAssets.find((a) =>
          a.section_id === section!.id &&
          (isAuto ? a.ticker === row.ticker : a.name === row.name)
        )
        if (!asset) {
          asset = {
            id: generateId(),
            section_id: section.id,
            type: row.assetType,
            name: row.name,
            ticker: row.ticker || undefined,
            currency: row.currency,
            created_at: new Date().toISOString(),
          }
          currentAssets.push(asset)
          saveAsset(asset)
        }

        // Zkontrolovat duplicitu transakce (stejné datum + typ + cena + množství)
        const existingTxs = getTransactions(asset.id)
        const isDuplicate = existingTxs.some(
          (t) => t.date === row.date && t.type === row.txType && t.price === row.price && t.quantity === row.quantity
        )
        if (isDuplicate) { skipped++; continue }

        saveTransaction({
          id: generateId(),
          asset_id: asset.id,
          date: row.date,
          type: row.txType,
          quantity: row.quantity,
          price: row.price,
          currency: row.currency,
          notes: row.notes || undefined,
          created_at: new Date().toISOString(),
        })
        imported++
      }

      setImportResult({ imported, skipped })
      if (imported > 0) toast.success(t('imported', { count: imported }))
      else toast.info(t('noNewTransactions'))
    } catch {
      toast.error(t('importFailed'))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* ── Zobrazení ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('display')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('displayCurrency')}</p>
              <p className="text-xs text-muted-foreground">{t('displayCurrencyDesc')}</p>
            </div>
            <Select
              value={settings.displayCurrency}
              onValueChange={(val) => updateSettings({ displayCurrency: val as Currency })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{tEnum(`currencies.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('portfolioChart')}</p>
              <p className="text-xs text-muted-foreground">{t('portfolioChartDesc')}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.showPortfolioChart}
              onClick={() => updateSettings({ showPortfolioChart: !settings.showPortfolioChart })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.showPortfolioChart ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.showPortfolioChart ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="border-t" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('performanceWidget')}</p>
              <p className="text-xs text-muted-foreground">{t('performanceWidgetDesc')}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.showPerformanceWidget}
              onClick={() => updateSettings({ showPerformanceWidget: !settings.showPerformanceWidget })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.showPerformanceWidget ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.showPerformanceWidget ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.showPerformanceWidget && (() => {
            const autoSections = sections.filter((s) =>
              ['stocks', 'crypto', 'commodity'].includes(s.template)
            )
            if (autoSections.length === 0) return null
            const selected = settings.performanceSectionIds ?? []
            return (
              <div className="space-y-2 pl-1">
                <p className="text-sm font-medium">{t('performanceSections')}</p>
                <p className="text-xs text-muted-foreground">{t('performanceSectionsDesc')}</p>
                <div className="space-y-1.5 pt-1">
                  {autoSections.map((s) => {
                    const checked = selected.length === 0 || selected.includes(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            // Pokud je vše zaškrtnuté (prázdný seznam = vše), začneme explicitním výběrem
                            const current = selected.length === 0
                              ? autoSections.map((x) => x.id)
                              : [...selected]
                            const next = current.includes(s.id)
                              ? current.filter((id) => id !== s.id)
                              : [...current, s.id]
                            // Pokud jsou zaškrtnuty všechny, uložíme prázdné pole (= vše)
                            updateSettings({
                              performanceSectionIds: next.length === autoSections.length ? [] : next
                            })
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">{s.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* ── Data ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('data')}</CardTitle>
          <CardDescription>{t('dataDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Export */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t('exportCsvTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('exportCsvDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              {t('export')}
            </Button>
          </div>

          <div className="border-t" />

          {/* Import */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t('importCsvTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('importCsvDesc')}</p>
              {importResult && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  {t('imported', { count: importResult.imported })}
                  {importResult.skipped > 0 && `, ${t('importedSkipped', { count: importResult.skipped })}`}
                </div>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {importing ? t('importing') : t('importBtn')}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
