'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronUp, ChevronDown, ChevronsUpDown, Settings2, GripVertical, AlertTriangle, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getDividendCache,
  type ColumnState,
  type CurrencyCache,
} from '@/lib/storage'
import {
  getColumnConfig,
  saveColumnConfig,
  resetColumnConfig,
} from '@/lib/db/settings'
import {
  type AssetWithValue,
  type Currency,
} from '@/types'
import { convertCurrency } from '@/lib/calculations'
import { formatCurrency } from '@/lib/format'

// ─── Definice sloupců ─────────────────────────────────────────────────────────

type ColumnId =
  | 'name'
  | 'price'
  | 'daily_change'
  | 'total_return_pct'
  | 'quantity'
  | 'value'
  | 'avg_buy'
  | 'avg_buy_price'
  | 'abs_return'
  | 'dividends'
  | 'weight'
  | 'sector'
  | 'industry'
  | 'country'
  | 'yoc'

interface RenderExtra {
  yocMap: Record<string, number | null>
}

interface ColumnDef {
  id: ColumnId
  label: string
  align: 'left' | 'right'
  sortValue: (av: AssetWithValue) => number | string
  render: (av: AssetWithValue, currency: Currency, totalSectionValue?: number, extra?: RenderExtra) => React.ReactNode
}

// Labels jsou injektovány z komponenty (i18n)
const COLUMN_DEFS: ColumnDef[] = [
  {
    id: 'name',
    label: 'colName',
    align: 'left',
    sortValue: (av) => av.name,
    render: (av) => <span className="text-sm">{av.name}</span>,
  },
  {
    id: 'price',
    label: 'colPrice',
    align: 'right',
    sortValue: (av) => av.currentPriceUsd,
    render: (av) => {
      if (av.priceSource !== 'live' || av.currentPriceExchange === 0) return <span className="text-muted-foreground">—</span>
      const isGram = av.type === 'commodity' && av.commodity_unit === 'g'
      const unit = av.type === 'commodity'
        ? (isGram ? `${av.priceCurrency}/g` : `${av.priceCurrency}/oz`)
        : av.priceCurrency
      return (
        <span className="font-mono text-sm">
          {av.currentPriceExchange.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          <span className="text-muted-foreground text-xs ml-1">{unit}</span>
        </span>
      )
    },
  },
  {
    id: 'daily_change',
    label: 'colDailyPct',
    align: 'right',
    sortValue: (av) => av.dailyChangePct ?? -Infinity,
    render: (av) => {
      if (av.dailyChangePct === null || av.dailyChangePct === undefined) return <span className="text-muted-foreground">—</span>
      const pos = av.dailyChangePct >= 0
      return (
        <span className={`font-mono text-sm font-medium ${pos ? 'text-green-600' : 'text-red-600'}`}>
          {pos ? '+' : ''}{av.dailyChangePct.toFixed(2)} %
        </span>
      )
    },
  },
  {
    id: 'total_return_pct',
    label: 'colReturnPct',
    align: 'right',
    sortValue: (av) => av.totalReturnPct,
    render: (av) => {
      const pos = av.totalReturnPct >= 0
      return (
        <span className={`font-mono text-sm font-medium ${pos ? 'text-green-600' : 'text-red-600'}`}>
          {pos ? '+' : ''}{av.totalReturnPct.toFixed(2)} %
        </span>
      )
    },
  },
  {
    id: 'quantity',
    label: 'colQuantity',
    align: 'right',
    sortValue: (av) => av.totalQuantity,
    render: (av) => {
      if (av.priceSource === 'manual') return <span className="text-muted-foreground">—</span>
      const unit = av.type === 'commodity' ? (av.commodity_unit ?? 'oz') : 'ks'
      return (
        <span className="font-mono text-sm">
          {av.totalQuantity.toLocaleString('cs-CZ', { maximumFractionDigits: 6 })}
          <span className="text-muted-foreground text-xs ml-1">{unit}</span>
        </span>
      )
    },
  },
  {
    id: 'value',
    label: 'colValue',
    align: 'right',
    sortValue: (av) => av.currentValueDisplay,
    render: (av, currency) => {
      const pos = av.totalReturnDisplay >= 0
      const totalWithDiv = av.totalReturnDisplay + av.totalDividendsDisplay
      return (
        <div className="text-right">
          <p className="font-semibold text-sm">{formatCurrency(av.currentValueDisplay, currency)}</p>
          <p className={`text-xs ${pos ? 'text-green-600' : 'text-red-600'}`}>
            {pos ? '+' : ''}{formatCurrency(totalWithDiv, currency)}
          </p>
        </div>
      )
    },
  },
  {
    id: 'avg_buy',
    label: 'colInvested',
    align: 'right',
    sortValue: (av) => av.totalInvestedDisplay,
    render: (av, currency) => (
      <span className="font-mono text-sm">{formatCurrency(av.totalInvestedDisplay, currency)}</span>
    ),
  },
  {
    id: 'avg_buy_price',
    label: 'colAvgBuyPrice',
    align: 'right',
    sortValue: (av) => av.avgBuyPriceExchange,
    render: (av) => {
      if (av.priceSource === 'manual' || av.totalQuantity === 0 || av.avgBuyPriceExchange === 0) {
        return <span className="text-muted-foreground">—</span>
      }
      const isGram = av.type === 'commodity' && av.commodity_unit === 'g'
      const unit   = av.type === 'commodity'
        ? (isGram ? `${av.priceCurrency}/g` : `${av.priceCurrency}/oz`)
        : av.priceCurrency
      const pos = av.currentPriceExchange >= av.avgBuyPriceExchange
      return (
        <div className="text-right">
          <span className="font-mono text-sm">
            {av.avgBuyPriceExchange.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-muted-foreground text-xs ml-1">{unit}</span>
          </span>
          {av.currentPriceExchange > 0 && (
            <p className={`text-xs font-mono ${pos ? 'text-green-600' : 'text-red-600'}`}>
              {pos ? '▲' : '▼'} {av.currentPriceExchange.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      )
    },
  },
  {
    id: 'abs_return',
    label: 'colAbsReturn',
    align: 'right',
    sortValue: (av) => av.totalReturnDisplay,
    render: (av, currency) => {
      const pos = av.totalReturnDisplay >= 0
      return (
        <span className={`font-mono text-sm font-medium ${pos ? 'text-green-600' : 'text-red-600'}`}>
          {pos ? '+' : ''}{formatCurrency(av.totalReturnDisplay, currency)}
        </span>
      )
    },
  },
  {
    id: 'dividends',
    label: 'colDividends',
    align: 'right',
    sortValue: (av) => av.totalDividendsDisplay,
    render: (av, currency) =>
      av.totalDividendsDisplay > 0
        ? <span className="font-mono text-sm text-blue-600">+{formatCurrency(av.totalDividendsDisplay, currency)}</span>
        : <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'weight',
    label: 'colWeight',
    align: 'right',
    sortValue: (av) => av.currentValueDisplay,
    render: (av, _currency, totalSectionValue) => {
      if (!totalSectionValue || totalSectionValue === 0) return <span className="text-muted-foreground">—</span>
      const pct = (av.currentValueDisplay / totalSectionValue) * 100
      return <span className="font-mono text-sm">{pct.toFixed(1)} %</span>
    },
  },
  {
    id: 'sector',
    label: 'colSector',
    align: 'left',
    sortValue: (av) => av.sector ?? '',
    render: (av) => av.sector
      ? <span className="text-sm">{av.sector}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'industry',
    label: 'colIndustry',
    align: 'left',
    sortValue: (av) => av.industry ?? '',
    render: (av) => av.industry
      ? <span className="text-sm">{av.industry}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'country',
    label: 'colCountry',
    align: 'left',
    sortValue: (av) => av.country ?? '',
    render: (av) => av.country
      ? <span className="text-sm">{av.country}</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'yoc',
    label: 'colYoc',
    align: 'right',
    sortValue: () => 0,
    render: (av, _currency, _total, extra) => {
      const yoc = extra?.yocMap[av.id]
      if (yoc == null) return <span className="text-muted-foreground">—</span>
      return <span className="font-mono text-sm text-blue-600">{yoc.toFixed(2)} %</span>
    },
  },
]

// ─── Hlavní komponenta ────────────────────────────────────────────────────────

interface AssetTableProps {
  assets: AssetWithValue[]
  displayCurrency: Currency
  totalSectionValue?: number
  rates?: CurrencyCache | null
}

type SortDir = 'asc' | 'desc'

export function AssetTable({ assets, displayCurrency, totalSectionValue, rates }: AssetTableProps) {
  const t = useTranslations('assetTable')
  const [columnStates, setColumnStates] = useState<ColumnState[]>([])
  const [sortCol, setSortCol] = useState<ColumnId | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [gearOpen, setGearOpen] = useState(false)
  const [gearPos, setGearPos] = useState<{ top: number; left: number } | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [yocMap, setYocMap] = useState<Record<string, number | null>>({})
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getColumnConfig().then(setColumnStates).catch(console.error)
  }, [])

  // Výpočet YoC per aktivum z dividend cache (TTM)
  useEffect(() => {
    if (!rates) return
    const cache  = getDividendCache()
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
    const today  = new Date().toISOString().split('T')[0]
    const map: Record<string, number | null> = {}

    for (const av of assets) {
      if (!av.ticker || (av.type !== 'stock' && av.type !== 'etf')) { map[av.id] = null; continue }
      const entry = cache[av.ticker]
      if (!entry || entry.dividends.length === 0) { map[av.id] = null; continue }

      const ttm = entry.dividends
        .filter(d => d.exDate >= cutoff && d.exDate <= today)
        .reduce((sum, d) => sum + convertCurrency(d.amount, d.currency, displayCurrency, rates) * av.totalQuantity, 0)

      if (ttm === 0 || av.totalInvestedDisplay === 0) { map[av.id] = null; continue }
      map[av.id] = (ttm / av.totalInvestedDisplay) * 100
    }
    setYocMap(map)
  }, [assets.map(a => a.id).join(','), rates, displayCurrency])

  // Zavřít dropdown kliknutím mimo
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        gearBtnRef.current && !gearBtnRef.current.contains(e.target as Node)
      ) {
        setGearOpen(false)
      }
    }
    if (gearOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [gearOpen])

  // Viditelné sloupce v pořadí
  const visibleCols = columnStates
    .filter((cs) => cs.visible)
    .map((cs) => COLUMN_DEFS.find((d) => d.id === cs.id))
    .filter(Boolean) as ColumnDef[]

  // Všechny sloupce v pořadí (pro picker)
  const orderedAllCols = columnStates
    .map((cs) => ({ ...cs, def: COLUMN_DEFS.find((d) => d.id === cs.id) }))
    .filter((x) => x.def) as Array<ColumnState & { def: ColumnDef }>

  // Seřazená data
  const sortedAssets = [...assets].sort((a, b) => {
    if (!sortCol) return 0
    if (sortCol === 'yoc') {
      const va = yocMap[a.id] ?? -Infinity
      const vb = yocMap[b.id] ?? -Infinity
      return sortDir === 'asc' ? va - vb : vb - va
    }
    const def = COLUMN_DEFS.find((d) => d.id === sortCol)
    if (!def) return 0
    const va = def.sortValue(a)
    const vb = def.sortValue(b)
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function handleSort(colId: ColumnId) {
    if (sortCol === colId) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null) }
    } else {
      setSortCol(colId)
      setSortDir('asc')
    }
  }

  function toggleColumn(id: string) {
    const updated = columnStates.map((cs) => cs.id === id ? { ...cs, visible: !cs.visible } : cs)
    setColumnStates(updated)
    saveColumnConfig(updated).catch(console.error)
  }

  function handleReset() {
    resetColumnConfig()
      .then(() => getColumnConfig())
      .then((cols) => { setColumnStates(cols); setSortCol(null) })
      .catch(console.error)
  }

  // Drag & drop přeuspořádání v pickeru
  function handleDragStart(id: string) {
    setDraggedId(id)
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    setDragOverId(id)
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null); setDragOverId(null); return
    }
    const newStates = [...columnStates]
    const fromIdx = newStates.findIndex((c) => c.id === draggedId)
    const toIdx = newStates.findIndex((c) => c.id === targetId)
    const [removed] = newStates.splice(fromIdx, 1)
    newStates.splice(toIdx, 0, removed)
    setColumnStates(newStates)
    saveColumnConfig(newStates).catch(console.error)
    setDraggedId(null)
    setDragOverId(null)
  }

  function SortIcon({ colId }: { colId: ColumnId }) {
    if (sortCol !== colId) return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground opacity-50" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1 text-primary" />
      : <ChevronDown className="h-3 w-3 ml-1 text-primary" />
  }

  return (
    <>
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            {/* Ticker — vždy první, fixní */}
            <th className="sticky left-0 z-20 bg-muted/50 px-4 py-1.5 text-left font-semibold whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span>{t('ticker')}</span>
                {/* Gear ikona pro správu sloupců */}
                <button
                  ref={gearBtnRef}
                  onClick={() => {
                    if (!gearOpen && gearBtnRef.current) {
                      const r = gearBtnRef.current.getBoundingClientRect()
                      setGearPos({ top: r.bottom + 4, left: r.left })
                    }
                    setGearOpen((o) => !o)
                  }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={t('manageColumns')}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </th>

            {/* Dynamické sloupce */}
            {visibleCols.map((col) => (
              <th
                key={col.id}
                className={`px-4 py-1.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-muted/80 transition-colors
                  ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                onClick={() => handleSort(col.id)}
              >
                <div className={`flex items-center gap-0 ${col.align === 'right' ? 'justify-end' : ''}`}>
                  {col.align === 'right' && <SortIcon colId={col.id} />}
                  <span>{t(col.label)}</span>
                  {col.align === 'left' && <SortIcon colId={col.id} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedAssets.map((av) => (
            <tr
              key={av.id}
              className="group border-b last:border-0 hover:bg-muted/30 transition-colors"
            >
              {/* Ticker — sticky */}
              <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/30 transition-colors px-4 py-1 whitespace-nowrap">
                <Link href={`/assets/${av.id}`} className="hover:underline">
                  <div className="flex items-center gap-1.5">
                    {av.ticker
                      ? <Badge variant="secondary" className="text-xs font-mono font-semibold">{av.ticker}</Badge>
                      : <span className="font-medium text-sm">{av.name}</span>
                    }
                    {av.isStale && (
                      <span title={t('outdated')}><AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" /></span>
                    )}
                  </div>
                </Link>
              </td>

              {/* Dynamické buňky */}
              {visibleCols.map((col) => (
                <td
                  key={col.id}
                  className={`px-4 py-1 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.render(av, displayCurrency, totalSectionValue, { yocMap })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Dropdown picker — portal mimo overflow container */}
    {gearOpen && gearPos && typeof document !== 'undefined' && createPortal(
      <div
        ref={dropdownRef}
        style={{ position: 'fixed', top: gearPos.top, left: gearPos.left, zIndex: 9999 }}
        className="bg-card border rounded-lg shadow-lg w-56 py-2"
      >
        <div className="px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('columns')}</span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title={t('resetDefault')}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
        <div className="border-t mx-2 mb-1" />
        {orderedAllCols.map((col) => (
          <div
            key={col.id}
            draggable
            onDragStart={() => handleDragStart(col.id)}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDrop={() => handleDrop(col.id)}
            onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-default select-none transition-colors
              ${dragOverId === col.id && draggedId !== col.id ? 'bg-primary/10' : 'hover:bg-muted'}
              ${draggedId === col.id ? 'opacity-50' : ''}`}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
            <input
              type="checkbox"
              checked={col.visible}
              onChange={() => toggleColumn(col.id)}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer"
            />
            <span className="text-sm">{t(col.def.label)}</span>
          </div>
        ))}
      </div>,
      document.body
    )}
    </>
  )
}
