'use client'

import { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Download, Upload, Check, DatabaseBackup, User, Monitor, LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  exportAllData,
  downloadBackup,
  importAllData,
  validateBackup,
  type ImportResult,
} from '@/lib/json-backup'
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
import { generateId } from '@/lib/storage'
import { getAssets, saveAsset } from '@/lib/db/assets'
import { getTransactions, saveTransaction } from '@/lib/db/transactions'
import { getSections } from '@/lib/db/sections'
import {
  CURRENCIES,
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
} from '@/lib/db/cashflow'

type SettingsSection = 'account' | 'display' | 'dashboard' | 'data'

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { sections, saveSection: saveSectionCtx } = useSections()
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const jsonInputRef    = useRef<HTMLInputElement>(null)
  const [importing, setImporting]           = useState(false)
  const [importResult, setImportResult]     = useState<{ imported: number; skipped: number } | null>(null)
  const [jsonImporting, setJsonImporting]   = useState(false)
  const [jsonResult, setJsonResult]         = useState<ImportResult | null>(null)

  const [activeSection, setActiveSection]   = useState<SettingsSection>('account')

  // Účet
  const [currentEmail, setCurrentEmail]     = useState<string | null>(null)
  const [newEmail, setNewEmail]             = useState('')
  const [emailLoading, setEmailLoading]     = useState(false)
  const [newPassword, setNewPassword]       = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null)
    })
  }, [])

  const t        = useTranslations('settings')
  const tEnum    = useTranslations('enums')
  const tAccount = useTranslations('account')

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    const [assets, transactions, categories, items, history] = await Promise.all([
      getAssets(),
      getTransactions(),
      getCashflowCategories(),
      getCashflowItems(),
      getCashflowHistory(),
    ])

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
        toast.error(t('importError', { error: `${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} ${t('importErrorMore')})` : ''}` }))
      }

      if (rows.length === 0) { setImporting(false); return }

      // Načíst aktuální stav
      const currentSections = await getSections()
      const currentAssets = await getAssets()

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
          await saveAsset(asset)
        }

        // Zkontrolovat duplicitu transakce (stejné datum + typ + cena + množství)
        const existingTxs = await getTransactions(asset.id)
        const isDuplicate = existingTxs.some(
          (t) => t.date === row.date && t.type === row.txType && t.price === row.price && t.quantity === row.quantity
        )
        if (isDuplicate) { skipped++; continue }

        await saveTransaction({
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

  // ── JSON Backup Export ────────────────────────────────────────────────────

  async function handleJsonExport() {
    const data = await exportAllData()
    const isEmpty =
      data.sections.length === 0 &&
      data.assets.length === 0 &&
      data.cashflow_items.length === 0 &&
      data.properties.length === 0
    if (isEmpty) { toast.warning(t('noDataToBackup')); return }
    downloadBackup(data)
    toast.success(t('exportedJson'))
  }

  // ── JSON Backup Import ────────────────────────────────────────────────────

  async function handleJsonImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setJsonImporting(true)
    setJsonResult(null)

    try {
      const text = await file.text()
      const raw  = JSON.parse(text)
      const data = validateBackup(raw)
      const result = await importAllData(data)

      setJsonResult(result)
      if (result.total === 0) {
        toast.info(t('importJsonEmpty'))
      } else {
        toast.success(t('importedJson', { total: result.total }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg ? `${t('importJsonFailed')}: ${msg}` : t('importJsonFailed'))
    } finally {
      setJsonImporting(false)
      if (jsonInputRef.current) jsonInputRef.current.value = ''
    }
  }

  // ── Změna e-mailu ─────────────────────────────────────────────────────────

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setEmailLoading(true)
    const { error } = await createClient().auth.updateUser({ email: newEmail.trim() })
    setEmailLoading(false)
    if (error) { toast.error(tAccount('changeEmailError')); return }
    toast.success(tAccount('changeEmailSuccess', { email: newEmail.trim() }))
    setNewEmail('')
  }

  // ── Změna hesla ────────────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) { toast.error(tAccount('errorPasswordShort')); return }
    if (newPassword !== newPasswordConfirm) { toast.error(tAccount('errorPasswordMismatch')); return }
    setPasswordLoading(true)
    const { error } = await createClient().auth.updateUser({ password: newPassword })
    setPasswordLoading(false)
    if (error) { toast.error(tAccount('changePasswordError')); return }
    toast.success(tAccount('changePasswordSuccess'))
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  // ── Nav items ─────────────────────────────────────────────────────────────

  const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'account',   label: t('navAccount'),   icon: <User className="h-4 w-4" /> },
    { id: 'display',   label: t('navDisplay'),   icon: <Monitor className="h-4 w-4" /> },
    { id: 'dashboard', label: t('navDashboard'), icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'data',      label: t('navData'),      icon: <DatabaseBackup className="h-4 w-4" /> },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

      <div className="flex gap-6">
        {/* ── Levý panel ────────────────────────────────────────────────── */}
        <nav className="w-44 shrink-0">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === item.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Obsah ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 max-w-xl space-y-6">

          {/* ── Účet ──────────────────────────────────────────────────────── */}
          {activeSection === 'account' && (
            currentEmail ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {tAccount('title')}
                  </CardTitle>
                  <CardDescription className="text-xs">{tAccount('currentEmail')}: <strong>{currentEmail}</strong></CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Změna e-mailu */}
                  <form onSubmit={handleChangeEmail} className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-0.5">{tAccount('changeEmail')}</p>
                      <p className="text-xs text-muted-foreground mb-3">{tAccount('changeEmailDesc')}</p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder={tAccount('newEmail')}
                          required
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <Button type="submit" size="sm" disabled={emailLoading} className="shrink-0">
                          {emailLoading ? '...' : tAccount('changeEmailBtn')}
                        </Button>
                      </div>
                    </div>
                  </form>

                  <div className="border-t" />

                  {/* Změna hesla */}
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-0.5">{tAccount('changePassword')}</p>
                      <p className="text-xs text-muted-foreground mb-3">{tAccount('changePasswordDesc')}</p>
                      <div className="space-y-2">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={tAccount('newPassword')}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={newPasswordConfirm}
                            onChange={(e) => setNewPasswordConfirm(e.target.value)}
                            placeholder={tAccount('newPasswordConfirm')}
                            required
                            autoComplete="new-password"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <Button type="submit" size="sm" disabled={passwordLoading} className="shrink-0">
                            {passwordLoading ? '...' : tAccount('changePasswordBtn')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>

                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  {tAccount('notLoggedIn')}
                </CardContent>
              </Card>
            )
          )}

          {/* ── Zobrazení ─────────────────────────────────────────────────── */}
          {activeSection === 'display' && (
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
                                  const current = selected.length === 0
                                    ? autoSections.map((x) => x.id)
                                    : [...selected]
                                  const next = current.includes(s.id)
                                    ? current.filter((id) => id !== s.id)
                                    : [...current, s.id]
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
          )}

          {/* ── Dashboard ────────────────────────────────────────────────── */}
          {activeSection === 'dashboard' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('navDashboard')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('portfolioChart')}</p>
                    <p className="text-xs text-muted-foreground">{t('portfolioChartDesc')}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.showPortfolioChart}
                    onClick={() => updateSettings({ showPortfolioChart: !settings.showPortfolioChart })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.showPortfolioChart ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.showPortfolioChart ? 'translate-x-6' : 'translate-x-1'}`} />
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
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.showPerformanceWidget ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.showPerformanceWidget ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="border-t" />

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('dashboardSections')}</p>
                  <p className="text-xs text-muted-foreground">{t('dashboardSectionsDesc')}</p>
                  <div className="space-y-1.5 pt-1">
                    {sections.map((s) => {
                      const selected = settings.totalValueSectionIds ?? []
                      const checked = selected.length === 0 || selected.includes(s.id)
                      return (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const current = selected.length === 0 ? sections.map((x) => x.id) : [...selected]
                              const next = current.includes(s.id) ? current.filter((id) => id !== s.id) : [...current, s.id]
                              updateSettings({ totalValueSectionIds: next.length === sections.length ? [] : next })
                            }}
                            className="h-4 w-4"
                          />
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color ?? '#6b7280' }} />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {/* ── Data ──────────────────────────────────────────────────────── */}
          {activeSection === 'data' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('data')}</CardTitle>
                  <CardDescription>{t('dataDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Export CSV */}
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

                  {/* Import CSV */}
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

              {/* JSON Backup */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DatabaseBackup className="h-4 w-4" />
                    {t('backupTitle')}
                  </CardTitle>
                  <CardDescription>{t('backupDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Export JSON */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('exportJsonTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('exportJsonDesc')}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleJsonExport}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('exportJson')}
                    </Button>
                  </div>

                  <div className="border-t" />

                  {/* Import JSON */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('importJsonTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('importJsonDesc')}</p>
                      {jsonResult && jsonResult.total > 0 && (
                        <div className="mt-2 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                            <Check className="h-3.5 w-3.5" />
                            {t('importedJson', { total: jsonResult.total })}
                          </div>
                          <p className="text-xs text-muted-foreground pl-5">
                            {t('importedJsonDetail', {
                              sections:     jsonResult.sections,
                              assets:       jsonResult.assets,
                              transactions: jsonResult.transactions,
                              cashflow:     jsonResult.cashflow_categories + jsonResult.cashflow_items + jsonResult.cashflow_history,
                              properties:   jsonResult.properties,
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <input
                        ref={jsonInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleJsonImportFile}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={jsonImporting}
                        onClick={() => jsonInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {jsonImporting ? t('importingJson') : t('importJson')}
                      </Button>
                    </div>
                  </div>

                </CardContent>
              </Card>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
