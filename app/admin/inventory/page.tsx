'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArchiveX, Boxes, ChevronLeft, ChevronRight, Filter, Layers3, Loader2, Pencil, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
type InventoryItem = { variantId: string; sku: string; productName: string; variantName: string; productType: string; categoryName: string | null; onHandQuantity: number; updatedAt: string | null; isActive: boolean }
type InventoryUpdate = { variantId: string; onHandQuantity: number; updatedAt: string }

const LOW_STOCK_THRESHOLD = 5
const TEXT = {
  title: 'T\u1ed3n kho', subtitle: 'S\u1ed1 l\u01b0\u1ee3ng t\u1ed3n th\u1ef1c t\u1ebf theo t\u1eebng SKU v\u00e0 phi\u00ean b\u1ea3n s\u1ea3n ph\u1ea9m.', totalSku: 'T\u1ed5ng m\u00e3 SKU', totalQuantity: 'T\u1ed5ng s\u1ed1 l\u01b0\u1ee3ng t\u1ed3n', lowStock: 'S\u1eafp h\u1ebft h\u00e0ng', outOfStock: 'H\u1ebft h\u00e0ng', search: 'T\u00ecm theo SKU, s\u1ea3n ph\u1ea9m ho\u1eb7c phi\u00ean b\u1ea3n...', allStatuses: 'T\u1ea5t c\u1ea3 tr\u1ea1ng th\u00e1i', allTypes: 'T\u1ea5t c\u1ea3', sku: 'M\u00e3 SKU', product: 'S\u1ea3n ph\u1ea9m', variant: 'Phi\u00ean b\u1ea3n', type: 'Lo\u1ea1i', quantity: 'T\u1ed3n', updatedAt: 'C\u1eadp nh\u1eadt', status: 'Tr\u1ea1ng th\u00e1i', action: 'Thao t\u00e1c', adjust: '\u0110i\u1ec1u ch\u1ec9nh', adjustTitle: '\u0110i\u1ec1u ch\u1ec9nh s\u1ed1 l\u01b0\u1ee3ng t\u1ed3n', currentQuantity: 'S\u1ed1 l\u01b0\u1ee3ng hi\u1ec7n t\u1ea1i', newQuantity: 'S\u1ed1 l\u01b0\u1ee3ng m\u1edbi', cancel: 'H\u1ee7y', save: 'L\u01b0u thay \u0111\u1ed5i', noData: 'Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u t\u1ed3n kho ph\u00f9 h\u1ee3p.', loadError: 'T\u1ea3i d\u1eef li\u1ec7u t\u1ed3n kho th\u1ea5t b\u1ea1i', updateError: 'C\u1eadp nh\u1eadt t\u1ed3n kho th\u1ea5t b\u1ea1i', updateSuccess: 'C\u1eadp nh\u1eadt t\u1ed3n kho th\u00e0nh c\u00f4ng', neverUpdated: 'Ch\u01b0a c\u00f3 b\u1ea3n ghi', page: 'Trang', of: 'tr\u00ean', rowsPerPage: 'S\u1ed1 d\u00f2ng', showing: 'Hi\u1ec3n th\u1ecb', results: 'k\u1ebft qu\u1ea3', inactive: 'Ng\u1eebng kinh doanh',
}

function inventoryStatus(quantity: number): InventoryStatus { if (quantity <= 0) return 'OUT_OF_STOCK'; if (quantity <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK'; return 'IN_STOCK' }
function statusLabel(status: InventoryStatus) { if (status === 'IN_STOCK') return 'C\u00f2n h\u00e0ng'; if (status === 'LOW_STOCK') return 'S\u1eafp h\u1ebft'; return 'H\u1ebft h\u00e0ng' }
function productTypeLabel(item: Pick<InventoryItem, 'categoryName' | 'productType'>) { if (item.categoryName) return item.categoryName; if (item.productType === 'VEHICLE') return 'Xe'; if (item.productType === 'ACCESSORY') return 'Ph\u1ee5 ki\u1ec7n'; return item.productType }
async function responseError(response: Response) { try { const body = await response.json(); return typeof body.error === 'string' ? body.error : body.error?.message || TEXT.loadError } catch { return TEXT.loadError } }

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | InventoryStatus>('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [quantityInput, setQuantityInput] = useState('0')
  const [isSaving, setIsSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }, [])

  useEffect(() => {
    let active = true
    async function loadInventory() {
      try {
        const response = await fetch('/api/v1/admin/inventory', { cache: 'no-store' })
        if (!response.ok) throw new Error(await responseError(response))
        const data: InventoryItem[] = await response.json()
        if (active) setItems(data)
      } catch (cause) {
        if (active) notify('error', TEXT.loadError, cause instanceof Error ? cause.message : TEXT.loadError)
      } finally { if (active) setIsLoading(false) }
    }
    void loadInventory()
    return () => { active = false }
  }, [notify])

  const productTypes = useMemo(() => [...new Set(items.map((item) => productTypeLabel(item)))].sort(), [items])
  const summary = useMemo(() => ({ skuCount: items.length, totalQuantity: items.reduce((total, item) => total + item.onHandQuantity, 0), lowStockCount: items.filter((item) => inventoryStatus(item.onHandQuantity) === 'LOW_STOCK').length, outOfStockCount: items.filter((item) => inventoryStatus(item.onHandQuantity) === 'OUT_OF_STOCK').length }), [items])
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return items.filter((item) => (!query || [item.sku, item.productName, item.variantName].some((value) => value.toLowerCase().includes(query))) && (statusFilter === 'ALL' || (statusFilter === 'IN_STOCK' ? item.onHandQuantity > 0 : inventoryStatus(item.onHandQuantity) === statusFilter)) && (typeFilter === 'ALL' || productTypeLabel(item) === typeFilter))
  }, [items, searchTerm, statusFilter, typeFilter])

  useEffect(() => { setCurrentPage(1) }, [searchTerm, statusFilter, typeFilter, pageSize])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize)
  const parsedQuantity = Number(quantityInput)
  const canSaveAdjustment = Boolean(adjustingItem) && Number.isInteger(parsedQuantity) && parsedQuantity >= 0 && parsedQuantity <= 1_000_000 && parsedQuantity !== adjustingItem?.onHandQuantity

  function openAdjustment(item: InventoryItem) { setAdjustingItem(item); setQuantityInput(String(item.onHandQuantity)) }
  function closeAdjustment() { if (!isSaving) setAdjustingItem(null) }

  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adjustingItem) return
    const quantity = Number(quantityInput)
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) { notify('error', TEXT.updateError, 'S\u1ed1 l\u01b0\u1ee3ng ph\u1ea3i l\u00e0 s\u1ed1 nguy\u00ean t\u1eeb 0 \u0111\u1ebfn 1.000.000.'); return }
    setIsSaving(true)
    try {
      const response = await fetch(`/api/v1/admin/variants/${adjustingItem.variantId}/inventory`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ availableQuantity: quantity, expectedUpdatedAt: adjustingItem.updatedAt }) })
      if (!response.ok) throw new Error(await responseError(response))
      const updated: InventoryUpdate = await response.json()
      setItems((current) => current.map((item) => item.variantId === updated.variantId ? { ...item, onHandQuantity: updated.onHandQuantity, updatedAt: updated.updatedAt } : item))
      setAdjustingItem(null)
      notify('success', TEXT.updateSuccess)
    } catch (cause) { notify('error', TEXT.updateError, cause instanceof Error ? cause.message : TEXT.updateError) } finally { setIsSaving(false) }
  }

  const cards = [{ label: TEXT.totalSku, value: summary.skuCount, Icon: Layers3, color: 'bg-blue-50 text-blue-600' }, { label: TEXT.totalQuantity, value: summary.totalQuantity, Icon: Boxes, color: 'bg-emerald-50 text-emerald-600' }, { label: TEXT.lowStock, value: summary.lowStockCount, Icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' }, { label: TEXT.outOfStock, value: summary.outOfStockCount, Icon: ArchiveX, color: 'bg-red-50 text-red-600' }]

  return (
    <div className="min-w-0 space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{TEXT.title}</h1><p className="mt-1 text-sm text-slate-500">{TEXT.subtitle}</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, Icon, color }) => <div key={label} className="flex min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${color}`}><Icon size={23} /></div><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value.toLocaleString('vi-VN')}</p></div></div>)}</div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" placeholder={TEXT.search} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></div>
          <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"><Filter size={16} className="shrink-0 text-slate-400" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | InventoryStatus)} className="min-w-0 bg-transparent focus:outline-none"><option value="ALL">{TEXT.allStatuses}</option><option value="IN_STOCK">{statusLabel('IN_STOCK')}</option><option value="LOW_STOCK">{statusLabel('LOW_STOCK')}</option><option value="OUT_OF_STOCK">{statusLabel('OUT_OF_STOCK')}</option></select></div>
        </div>

        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500"><tr>
            <th className="w-[14%] px-3 py-4">{TEXT.sku}</th><th className="w-[18%] px-3 py-4">{TEXT.product}</th><th className="w-[17%] px-3 py-4">{TEXT.variant}</th>
            <th className="hidden w-[12%] px-3 py-3 xl:table-cell"><span className="mb-1 block text-xs">{TEXT.type}</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-medium text-slate-600 focus:outline-none"><option value="ALL">{TEXT.allTypes}</option>{productTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></th>
            <th className="w-[9%] px-2 py-4 text-center">{TEXT.quantity}</th><th className="hidden w-[14%] px-3 py-4 2xl:table-cell">{TEXT.updatedAt}</th><th className="w-[13%] px-3 py-4">{TEXT.status}</th><th className="w-[10%] px-3 py-4 text-right">{TEXT.action}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td colSpan={8} className="px-6 py-14 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></td></tr> : paginatedItems.map((item) => { const status = inventoryStatus(item.onHandQuantity); const badge = status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : status === 'LOW_STOCK' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'; return <tr key={item.variantId} className="transition-colors hover:bg-slate-50">
              <td className="px-3 py-4"><span className="block truncate font-medium text-slate-500" title={item.sku}>{item.sku}</span></td><td className="px-3 py-4"><span className="block truncate font-semibold text-slate-900" title={item.productName}>{item.productName}</span></td><td className="px-3 py-4"><span className="block truncate text-slate-600" title={item.variantName}>{item.variantName}</span></td><td className="hidden truncate px-3 py-4 text-slate-600 xl:table-cell">{productTypeLabel(item)}</td>
              <td className={`px-2 py-4 text-center text-lg font-bold ${status === 'OUT_OF_STOCK' ? 'text-red-600' : status === 'LOW_STOCK' ? 'text-amber-600' : 'text-slate-900'}`}>{item.onHandQuantity}</td><td className="hidden px-3 py-4 text-xs text-slate-500 2xl:table-cell">{item.updatedAt ? new Date(item.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : TEXT.neverUpdated}</td><td className="px-3 py-4"><span className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase ${badge}`}><span className="truncate">{statusLabel(status)}</span></span>{!item.isActive && <span className="mt-1 block truncate text-[10px] text-slate-400">{TEXT.inactive}</span>}</td>
              <td className="px-3 py-4 text-right"><button type="button" onClick={() => openAdjustment(item)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100" title={TEXT.adjust}><Pencil size={13} /><span className="hidden 2xl:inline">{TEXT.adjust}</span></button></td>
            </tr> })}
            {!isLoading && filteredItems.length === 0 && <tr><td colSpan={8} className="px-6 py-14 text-center text-slate-500">{TEXT.noData}</td></tr>}
          </tbody>
        </table>
        {!isLoading && filteredItems.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span>{TEXT.rowsPerPage}</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 focus:outline-none">
                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
              </select>
              <span className="hidden md:inline">· {TEXT.showing} {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredItems.length)} / {filteredItems.length} {TEXT.results}</span>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span>{TEXT.page} {safePage} {TEXT.of} {totalPages}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {adjustingItem && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeAdjustment() }} role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title">
          <motion.div className="w-full max-w-md rounded-xl bg-white shadow-2xl" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div className="min-w-0"><h2 id="inventory-adjust-title" className="font-bold text-slate-900">{TEXT.adjustTitle}</h2><p className="truncate text-xs text-slate-500">{adjustingItem.sku} · {adjustingItem.variantName}</p></div><button type="button" onClick={closeAdjustment} disabled={isSaving} className="rounded p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <form onSubmit={saveAdjustment} className="space-y-5 p-6"><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">{TEXT.currentQuantity}</p><p className="mt-1 text-2xl font-bold text-slate-900">{adjustingItem.onHandQuantity}</p></div><label className="block text-sm font-medium text-slate-700">{TEXT.newQuantity}<input autoFocus required type="number" min={0} max={1000000} step={1} value={quantityInput} onChange={(event) => setQuantityInput(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 px-3 text-lg font-semibold focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={closeAdjustment} disabled={isSaving} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{TEXT.cancel}</button><button type="submit" disabled={isSaving || !canSaveAdjustment} className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{isSaving && <Loader2 size={15} className="mr-2 animate-spin" />}{TEXT.save}</button></div></form>
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}