'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Plus, Settings, Wallet, BarChart2, Calculator, Building2, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useSections } from '@/lib/context/sections-context'
import { generateId } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  SECTION_PRESETS,
  TEMPLATE_COLORS,
  TEMPLATE_LABELS,
  type SectionTemplate,
} from '@/types'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { sections, saveSection } = useSections()
  const t = useTranslations('sidebar')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<{ name: string; template: SectionTemplate } | null>(null)
  const [isCustom, setIsCustom] = useState(false)

  function handleCreateSection() {
    const name = isCustom ? customName.trim() : selectedPreset?.name
    const template: SectionTemplate = isCustom ? 'custom' : (selectedPreset?.template ?? 'custom')
    if (!name) return

    const section = {
      id: generateId(),
      name,
      template,
      created_at: new Date().toISOString(),
    }
    saveSection(section)
    setDialogOpen(false)
    setSelectedPreset(null)
    setCustomName('')
    setIsCustom(false)
    router.push(`/sections/${section.id}`)
  }

  function handleClose() {
    setDialogOpen(false)
    setSelectedPreset(null)
    setCustomName('')
    setIsCustom(false)
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card px-3 py-4 gap-1">
      {/* Logo */}
      <div className="mb-4 px-3 py-2">
        <h1 className="text-lg font-bold tracking-tight">Myvalue</h1>
      </div>

      {/* Navigace */}
      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/dashboard'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {t('dashboard')}
        </Link>

        {/* Makro */}
        <Link
          href="/macro"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/macro'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <BarChart2 className="h-4 w-4 shrink-0" />
          {t('macro')}
        </Link>

        {/* Kalkulačky */}
        <Link
          href="/calculators"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/calculators' || pathname.startsWith('/calculators/')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Calculator className="h-4 w-4 shrink-0" />
          {t('calculators')}
        </Link>

        {/* Nemovitosti */}
        <Link
          href="/properties"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/properties' || pathname.startsWith('/properties/')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          {t('properties')}
        </Link>

        {/* Trhy */}
        <Link
          href="/markets"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/markets'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <TrendingUp className="h-4 w-4 shrink-0" />
          {t('markets')}
        </Link>

        {/* Cashflow */}
        <Link
          href="/cashflow"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/cashflow'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Wallet className="h-4 w-4 shrink-0" />
          {t('cashflow')}
        </Link>

        {/* Sekce */}
        {sections.length > 0 && (
          <div className="mt-3 mb-1 px-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('sections')}</p>
          </div>
        )}

        {sections.map((section) => {
          const isActive = pathname === `/sections/${section.id}` || pathname.startsWith(`/sections/${section.id}/`)
          return (
            <Link
              key={section.id}
              href={`/sections/${section.id}`}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: TEMPLATE_COLORS[section.template] }}
              />
              <span className="truncate">{section.name}</span>
            </Link>
          )
        })}

        {/* Přidat sekci */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleClose(); else setDialogOpen(true) }}>
          <DialogTrigger
            render={
              <button className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full text-left mt-1" />
            }
          >
            <Plus className="h-4 w-4 shrink-0" />
            {t('addSection')}
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('newSection')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">{t('selectPreset')}</p>

              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {SECTION_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => { setSelectedPreset(preset); setIsCustom(false) }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium text-left transition-colors',
                      !isCustom && selectedPreset?.name === preset.name
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted'
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: TEMPLATE_COLORS[preset.template] }}
                    />
                    {preset.name}
                  </button>
                ))}
                <button
                  onClick={() => { setIsCustom(true); setSelectedPreset(null) }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium text-left transition-colors',
                    isCustom ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: TEMPLATE_COLORS['custom'] }}
                  />
                  {t('custom')}
                </button>
              </div>

              {isCustom && (
                <div className="space-y-2">
                  <Input
                    placeholder="Název sekce..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('template', { label: `${TEMPLATE_LABELS['custom']} — manuální hodnota` })}
                  </p>
                </div>
              )}

              {!isCustom && selectedPreset && (
                <p className="text-xs text-muted-foreground">
                  {t('template', { label: TEMPLATE_LABELS[selectedPreset.template] })}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  {t('cancel')}
                </Button>
                <Button
                  className="flex-1"
                  disabled={isCustom ? !customName.trim() : !selectedPreset}
                  onClick={handleCreateSection}
                >
                  {t('createBtn')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </nav>

      {/* Nastavení */}
      <div className="border-t pt-2">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {t('settings')}
        </Link>
      </div>
    </aside>
  )
}
