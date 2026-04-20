'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { ChevronLeft, Plus, Trash2, Pencil, TrendingUp, TrendingDown, AlertTriangle, Circle, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/lib/context/settings-context'
import {
  getPriceCache,
  savePriceCache,
  getCurrencyCache,
  saveCurrencyCache,
  isPriceCacheValid,
  isCurrencyCacheValid,
  getCurrencyRateHistory,
  saveCurrencyRateHistory,
  isCurrencyRateHistoryValid,
  generateId,
  type CurrencyCache,
  type CurrencyRateHistory,
} from '@/lib/storage'
import { getAssets, saveAsset, deleteAsset } from '@/lib/db/assets'
import { getTransactions, saveTransaction, deleteTransaction } from '@/lib/db/transactions'
import { calculateAssetValue, priceToUsd } from '@/lib/calculations'
import {
  ASSET_TYPE_LABELS,
  AUTO_ASSET_TYPES,
  CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  type Asset,
  type Transaction,
  type AssetWithValue,
  type Currency,
  type TransactionType,
} from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { transactionsToCsv, downloadCsv, csvFilename } from '@/lib/csv'
import { TradingViewChart } from '@/components/charts/tradingview-chart'

const AUTO_TX_TYPES: TransactionType[] = ['buy', 'sell', 'dividend']
const MANUAL_TX_TYPES: TransactionType[] = ['update', 'buy', 'dividend']

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { settings } = useSettings()
  const t = useTranslations('assetDetail')
  const tCommon = useTranslations('common')
  const tEnum = useTranslations('enums')

  const [asset, setAsset] = useState<Asset | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [assetValue, setAssetValue] = useState<AssetWithValue | null>(null)
  const [rates, setRates] = useState<CurrencyCache | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [tvSymbolEdit, setTvSymbolEdit] = useState('')
  const [tvSymbolEditing, setTvSymbolEditing] = useState(false)

  const [txType, setTxType] = useState<TransactionType>('buy')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txQuantity, setTxQuantity] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [priceMode, setPriceMode] = useState<'per_unit' | 'total'>('per_unit')
  const [txCurrency, setTxCurrency] = useState<Currency>('CZK')
  const [txNotes, setTxNotes] = useState('')

  // Stav pro editaci transakce
  const [editType, setEditType] = useState<TransactionType>('buy')
  const [editDate, setEditDate] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCurrency, setEditCurrency] = useState<Currency>('CZK')
  const [editNotes, setEditNotes] = useState('')

  const loadData = useCallback(async () => {
    const assets = await getAssets()
    const found = assets.find((a) => a.id === id)
    if (!found) { router.push('/dashboard'); return }
    setAsset(found)

    const txs = await getTransactions(id)
    setTransactions([...txs].sort((a, b) => b.date.localeCompare(a.date)))

    let currentRates: CurrencyCache
    const cached = getCurrencyCache()
    if (cached && isCurrencyCacheValid(cached)) {
      currentRates = cached
    } else {
      try {
        const res = await fetch('/api/currencies')
        const data = await res.json()
        currentRates = { eurCzk: data.eurCzk, eurUsd: data.eurUsd, rates: data.rates ?? {}, updatedAt: new Date().toISOString() }
        saveCurrencyCache(currentRates)
      } catch {
        currentRates = cached ?? { eurCzk: 25.0, eurUsd: 1.08, rates: {}, updatedAt: new Date().toISOString() }
      }
    }
    setRates(currentRates)

    // ── Historické kurzy měn (pro cost basis) ─────────────────────────────
    let rateHistory: CurrencyRateHistory | null = null
    const cachedRateHistory = getCurrencyRateHistory()
    if (cachedRateHistory && isCurrencyRateHistoryValid(cachedRateHistory)) {
      rateHistory = cachedRateHistory
    } else {
      try {
        const allTxs = await getTransactions()
        if (allTxs.length > 0) {
          const earliest = allTxs.reduce((min, tx) => tx.date < min ? tx.date : min, allTxs[0].date)
          const fromDate = earliest.slice(0, 7) + '-01'
          const res = await fetch(`/api/currencies/history?from=${fromDate}`)
          const data = await res.json() as { months?: Record<string, Record<string, number>> }
          if (data.months) {
            rateHistory = { months: data.months, updatedAt: new Date().toISOString() }
            saveCurrencyRateHistory(rateHistory)
          }
        }
      } catch {
        rateHistory = cachedRateHistory
      }
    }

    let priceUsd: number | null = null
    let priceLocal: number | null = null
    let priceCurrency = 'USD'
    if (found.ticker && AUTO_ASSET_TYPES.includes(found.type)) {
      const priceCache = getPriceCache()
      const cachedPrice = priceCache[found.ticker]
      if (cachedPrice && isPriceCacheValid(cachedPrice)) {
        priceUsd = cachedPrice.priceUsd
        priceLocal = cachedPrice.priceLocal ?? null
        priceCurrency = cachedPrice.priceCurrency ?? 'USD'
      } else {
        try {
          const type = found.type === 'etf' ? 'stock'
            : found.type === 'crypto' ? 'crypto'
            : found.type === 'commodity' ? 'commodity'
            : 'stock'
          const res = await fetch(`/api/prices?tickers=${found.ticker}&type=${type}`)
          const data = await res.json() as {
            prices: Record<string, number>
            currencies?: Record<string, string>
          }
          const priceLocal = data.prices[found.ticker] ?? null
          const currency = data.currencies?.[found.ticker] ?? 'USD'
          priceUsd = priceLocal !== null ? priceToUsd(priceLocal, currency, currentRates) : null
          if (priceLocal !== null) {
            savePriceCache({
              ...priceCache,
              [found.ticker]: {
                ticker: found.ticker,
                priceUsd: priceUsd ?? 0,
                priceLocal,
                priceCurrency: currency,
                updatedAt: new Date().toISOString(),
              },
            })
          }
        } catch {
          priceUsd = cachedPrice?.priceUsd ?? null
        }
      }
    }

    const av = calculateAssetValue(found, txs, priceUsd, currentRates, settings.displayCurrency, null, priceLocal, priceCurrency, rateHistory)
    setAssetValue(av)
    setLoading(false)
  }, [id, router, settings.displayCurrency])

  useEffect(() => { loadData() }, [loadData])

  function handleAddTransaction() {
    if (!asset) return
    if (!txPrice || isNaN(Number(txPrice))) { toast.error(t('invalidPrice')); return }
    if (txType !== 'update' && txType !== 'dividend' && (!txQuantity || isNaN(Number(txQuantity)))) {
      toast.error(t('invalidQuantity')); return
    }

    const qty = Number(txQuantity)
    const rawPrice = Number(txPrice)
    const pricePerUnit = (priceMode === 'total' && qty > 0) ? rawPrice / qty : rawPrice

    saveTransaction({
      id: generateId(),
      asset_id: asset.id,
      date: txDate,
      type: txType,
      quantity: txType === 'update' || txType === 'dividend' ? 1 : qty,
      price: txType === 'update' || txType === 'dividend' ? rawPrice : pricePerUnit,
      currency: txCurrency,
      notes: txNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    }).catch(console.error)

    toast.success(t('transactionAdded'))
    setDialogOpen(false)
    setTxType('buy')
    setTxDate(new Date().toISOString().split('T')[0])
    setTxQuantity('')
    setTxPrice('')
    setTxNotes('')
    setPriceMode('per_unit')
    loadData()
  }

  function handleDeleteTransaction(txId: string) {
    deleteTransaction(txId).catch(console.error)
    toast.success(t('transactionDeleted'))
    loadData()
  }

  function handleEditTransaction(tx: Transaction) {
    setEditingTx(tx)
    setEditType(tx.type)
    setEditDate(tx.date)
    setEditQuantity(tx.type === 'update' || tx.type === 'dividend' ? '' : tx.quantity.toString())
    setEditPrice(tx.price.toString())
    setEditCurrency(tx.currency)
    setEditNotes(tx.notes ?? '')
    setEditDialogOpen(true)
  }

  function handleSaveEdit() {
    if (!editingTx) return
    if (!editPrice || isNaN(Number(editPrice))) { toast.error(t('invalidPrice')); return }
    if (editType !== 'update' && editType !== 'dividend' && (!editQuantity || isNaN(Number(editQuantity)))) {
      toast.error(t('invalidQuantity')); return
    }
    saveTransaction({
      ...editingTx,
      type: editType,
      date: editDate,
      quantity: editType === 'update' || editType === 'dividend' ? 1 : Number(editQuantity),
      price: Number(editPrice),
      currency: editCurrency,
      notes: editNotes.trim() || undefined,
    }).catch(console.error)
    toast.success(t('transactionUpdated'))
    setEditDialogOpen(false)
    setEditingTx(null)
    loadData()
  }

  function handleExport() {
    if (!asset) return
    const csv = transactionsToCsv([asset], transactions)
    downloadCsv(csv, csvFilename(asset.ticker ?? asset.name))
    toast.success(t('transactionsExported'))
  }

  function handleDeleteAsset() {
    if (!asset) return
    if (!confirm(t('confirmDeleteAsset', { name: asset.name }))) return
    deleteAsset(asset.id).catch(console.error)
    toast.success(t('assetDeleted'))
    router.push('/dashboard')
  }

  function handleSaveTvSymbol() {
    if (!asset) return
    const updated = { ...asset, tradingview_symbol: tvSymbolEdit.trim() || undefined }
    saveAsset(updated).catch(console.error)
    setAsset(updated)
    setTvSymbolEditing(false)
    toast.success(t('tvSymbolSaved'))
  }

  if (loading || !asset || !assetValue || !rates) {
    return <div className="p-6 text-muted-foreground">{tCommon('loading')}</div>
  }

  const isAuto = AUTO_ASSET_TYPES.includes(asset.type)
  const txTypes = isAuto ? AUTO_TX_TYPES : MANUAL_TX_TYPES
  const returnPositive = assetValue.totalReturnDisplay >= 0
  const quantityLabel = asset.type === 'commodity'
    ? (asset.commodity_unit === 'g' ? 'g' : 'oz')
    : 'ks'

  const backHref = asset.section_id ? `/sections/${asset.section_id}` : '/dashboard'

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Zpět + akce */}
      <div className="flex items-center justify-between">
        <Link href={backHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ChevronLeft className="mr-1 h-4 w-4" />{tCommon('back')}
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={transactions.length === 0}>
            <Download className="mr-2 h-4 w-4" />{tCommon('exportCsv')}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteAsset}>
            <Trash2 className="mr-2 h-4 w-4" />{t('deleteAsset')}
          </Button>
        </div>
      </div>

      {/* Hlavička */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{asset.name}</h1>
            {asset.ticker && <Badge variant="secondary">{asset.ticker}</Badge>}
            {assetValue.isStale && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-400 gap-1">
                <AlertTriangle className="h-3 w-3" />{t('outdated')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">{tEnum(`assetTypes.${asset.type}`)}</span>
            <Circle className={`h-2 w-2 ${isAuto ? 'fill-green-500 text-green-500' : 'fill-yellow-500 text-yellow-500'}`} />
            <span className="text-xs text-muted-foreground">{isAuto ? t('autoPrice') : t('manualValue')}</span>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open)
          if (open && isAuto && assetValue.currentPriceExchange > 0) {
            setTxPrice(assetValue.currentPriceExchange.toString())
            const c = assetValue.priceCurrency
            setTxCurrency((c === 'EUR' || c === 'USD' || c === 'CZK') ? c as import('@/types').Currency : 'USD')
            setPriceMode('per_unit')
          }
        }}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-2 h-4 w-4" />{t('addTransaction')}
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('addTransactionTitle', { name: asset.name })}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{tCommon('type')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {txTypes.map((txT) => (
                    <button
                      key={txT}
                      onClick={() => setTxType(txT)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                        ${txType === txT ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      {tEnum(`transactionTypes.${txT}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tCommon('date')}</Label>
                <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </div>

              {txType !== 'update' && txType !== 'dividend' && (
                <div className="space-y-2">
                  <Label>
                    {asset.type === 'commodity'
                      ? (asset.commodity_unit === 'g' ? t('quantityGrams') : t('quantityOz'))
                      : t('quantityPcs')}
                  </Label>
                  <Input
                    type="number" min="0" step="any" placeholder="0"
                    value={txQuantity} onChange={(e) => setTxQuantity(e.target.value)}
                  />
                </div>
              )}

              {/* Přepínač způsobu zadání ceny (jen pro buy/sell u auto aktiv) */}
              {isAuto && (txType === 'buy' || txType === 'sell') && (
                <div className="space-y-2">
                  <Label>{t('priceMode')}</Label>
                  <div className="flex gap-2">
                    {(['per_unit', 'total'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setPriceMode(mode)}
                        className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                          ${priceMode === mode ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                      >
                        {mode === 'per_unit' ? t('pricePerUnit') : t('totalPrice')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    {txType === 'update' ? t('currentValue') :
                     txType === 'dividend' ? t('dividendAmount') :
                     priceMode === 'total' ? t('totalPrice') : t('pricePerUnit')}
                  </Label>
                  <Input
                    type="number" min="0" step="any" placeholder="0"
                    value={txPrice} onChange={(e) => setTxPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tCommon('currency')}</Label>
                  <Select value={txCurrency} onValueChange={(v) => setTxCurrency(v as Currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Náhled výpočtu */}
              {(txType === 'buy' || txType === 'sell') && txQuantity && txPrice && Number(txQuantity) > 0 && Number(txPrice) > 0 && (
                <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                  {priceMode === 'per_unit' ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('totalLabel')}</span>
                      <span className="font-medium">
                        {(Number(txQuantity) * Number(txPrice)).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {txCurrency}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('pricePerUnitLabel')}</span>
                        <span className="font-medium">
                          {(Number(txPrice) / Number(txQuantity)).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} {txCurrency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('totalLabel')}</span>
                        <span className="font-medium">{Number(txPrice).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {txCurrency}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>{tCommon('notes')}</Label>
                <Textarea rows={2} value={txNotes} onChange={(e) => setTxNotes(e.target.value)} />
              </div>

              <Button className="w-full" onClick={handleAddTransaction}>{t('saveTransaction')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isAuto && assetValue.currentPriceExchange > 0 && (
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal">{t('currentPricePerUnit')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {(() => {
                const isGram = asset.type === 'commodity' && asset.commodity_unit === 'g'
                const unit = asset.type === 'commodity'
                  ? (isGram ? `${assetValue.priceCurrency}/g` : `${assetValue.priceCurrency}/oz`)
                  : assetValue.priceCurrency
                return (
                  <p className="text-lg font-bold">
                    {assetValue.currentPriceExchange.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
                  </p>
                )
              })()}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">{t('currentValue')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-lg font-bold">{formatCurrency(assetValue.currentValueDisplay, settings.displayCurrency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-normal">{t('totalReturn')}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex items-center gap-1">
              {returnPositive
                ? <TrendingUp className="h-4 w-4 text-green-500" />
                : <TrendingDown className="h-4 w-4 text-red-500" />}
              <p className={`text-lg font-bold ${returnPositive ? 'text-green-600' : 'text-red-600'}`}>
                {returnPositive ? '+' : ''}{formatCurrency(assetValue.totalReturnDisplay, settings.displayCurrency)}
              </p>
            </div>
          </CardContent>
        </Card>
        {isAuto && assetValue.totalQuantity > 0 && (
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal">{t('quantityCard')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold">
                {assetValue.totalQuantity.toLocaleString('cs-CZ', { maximumFractionDigits: 6 })} {quantityLabel}
              </p>
            </CardContent>
          </Card>
        )}
        {assetValue.totalDividendsDisplay > 0 && (
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal">{t('dividendAmount')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-lg font-bold text-blue-600">
                +{formatCurrency(assetValue.totalDividendsDisplay, settings.displayCurrency)}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Celkový výnos s dividendami */}
      {assetValue.totalDividendsDisplay > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-3 px-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('priceAppreciation')}</span>
              <span className={returnPositive ? 'text-green-600' : 'text-red-600'}>
                {returnPositive ? '+' : ''}{formatCurrency(assetValue.totalReturnDisplay, settings.displayCurrency)}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">{t('receivedDividends')}</span>
              <span className="text-blue-600">+{formatCurrency(assetValue.totalDividendsDisplay, settings.displayCurrency)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium">
              <span>{t('totalReturn')}</span>
              <span className="text-green-600">
                +{formatCurrency(assetValue.totalReturnDisplay + assetValue.totalDividendsDisplay, settings.displayCurrency)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog editace transakce */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingTx(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editTransaction')}</DialogTitle>
          </DialogHeader>
          {editingTx && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{tCommon('type')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {txTypes.map((txT) => (
                    <button
                      key={txT}
                      onClick={() => setEditType(txT)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                        ${editType === txT ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      {tEnum(`transactionTypes.${txT}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tCommon('date')}</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>

              {editType !== 'update' && editType !== 'dividend' && (
                <div className="space-y-2">
                  <Label>
                    {asset?.type === 'commodity'
                      ? (asset.commodity_unit === 'g' ? t('quantityGrams') : t('quantityOz'))
                      : t('quantityPcs')}
                  </Label>
                  <Input
                    type="number" min="0" step="any" placeholder="0"
                    value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    {editType === 'update' ? t('currentValue') :
                     editType === 'dividend' ? t('dividendAmount') : t('pricePerUnit')}
                  </Label>
                  <Input
                    type="number" min="0" step="any" placeholder="0"
                    value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tCommon('currency')}</Label>
                  <Select value={editCurrency} onValueChange={(v) => setEditCurrency(v as Currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tCommon('notes')}</Label>
                <Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>

              <Button className="w-full" onClick={handleSaveEdit}>{t('saveChanges')}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TradingView graf */}
      {asset.ticker && isAuto && (
        <div className="space-y-2">
          <TradingViewChart
            ticker={asset.ticker}
            tvSymbol={asset.tradingview_symbol}
            theme="dark"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            {tvSymbolEditing ? (
              <>
                <span className="shrink-0">{t('tvSymbolLabel')}</span>
                <input
                  autoFocus
                  value={tvSymbolEdit}
                  onChange={(e) => setTvSymbolEdit(e.target.value)}
                  placeholder={t('tvSymbolAuto', { ticker: asset.ticker })}
                  className="flex-1 max-w-xs rounded border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTvSymbol(); if (e.key === 'Escape') setTvSymbolEditing(false) }}
                />
                <button onClick={handleSaveTvSymbol} className="text-green-500 hover:text-green-400">{t('tvSymbolSave')}</button>
                <button onClick={() => setTvSymbolEditing(false)} className="hover:text-foreground">{t('tvSymbolCancel')}</button>
              </>
            ) : (
              <>
                <span>
                  {t('tvChartLabel')} <span className="font-mono">{asset.tradingview_symbol ?? t('tvChartAutoSymbol', { ticker: asset.ticker })}</span>
                </span>
                <button
                  onClick={() => { setTvSymbolEdit(asset.tradingview_symbol ?? ''); setTvSymbolEditing(true) }}
                  className="underline hover:text-foreground"
                >
                  {t('tvChartChange')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Historie transakcí */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t('transactionHistory')}</h2>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noTransactions')}</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Badge
                    variant={
                      tx.type === 'buy' ? 'default' :
                      tx.type === 'sell' ? 'destructive' :
                      tx.type === 'dividend' ? 'secondary' : 'outline'
                    }
                    className="shrink-0"
                  >
                    {tEnum(`transactionTypes.${tx.type}`)}
                  </Badge>
                  <div className="flex-1 text-sm">
                    <span className="font-medium">
                      {tx.type === 'update' || tx.type === 'dividend'
                        ? `${tx.price.toLocaleString('cs-CZ')} ${tx.currency}`
                        : `${tx.quantity.toLocaleString('cs-CZ', { maximumFractionDigits: 6 })} ${quantityLabel} @ ${tx.price.toLocaleString('cs-CZ')} ${tx.currency}`}
                    </span>
                    {tx.notes && <span className="text-muted-foreground ml-2">· {tx.notes}</span>}
                  </div>
                  <span className="text-sm text-muted-foreground shrink-0">{formatDate(tx.date)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleEditTransaction(tx)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteTransaction(tx.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
