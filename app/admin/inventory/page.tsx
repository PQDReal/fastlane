'use client'

import { AdminModalPortal } from '@/components/admin/admin-modal-portal'
import { InventoryProductCombobox } from '@/components/admin/inventory-product-combobox'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArchiveX, Ban, Boxes, ChevronLeft, ChevronRight, Filter, Layers3, Loader2, Pencil, RotateCcw, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import {
  canonicalInventoryProductType,
  filterAdminInventoryItems,
  inventoryProductTypeLabel,
  inventoryStatus,
  inventoryVariantFilterValue,
  sortedInventoryValues,
  type AdminInventoryActivity,
  type AdminInventoryProductType,
  type AdminInventoryStatus,
} from '@/lib/admin-inventory-filter'

type InventoryStatus = AdminInventoryStatus
type InventoryItem = {
  variantId: string
  productId: string | null
  sku: string
  productName: string
  variantName: string
  productType: string
  categoryName: string | null
  version: string | null
  color: string | null
  interiorColor: string | null
  inventoryKey: string | null
  onHandQuantity: number
  updatedAt: string | null
  variantIsActive: boolean
  productIsActive: boolean
  isActive: boolean
}
type InventoryUpdate = { variantId: string; onHandQuantity: number; updatedAt: string; variantIsActive: boolean }

const TEXT = {
  title: 'T\u1ed3n kho', subtitle: 'S\u1ed1 l\u01b0\u1ee3ng t\u1ed3n th\u1ef1c t\u1ebf theo t\u1eebng SKU v\u00e0 phi\u00ean b\u1ea3n s\u1ea3n ph\u1ea9m.', totalSku: 'T\u1ed5ng m\u00e3 SKU', totalQuantity: 'T\u1ed5ng s\u1ed1 l\u01b0\u1ee3ng t\u1ed3n', lowStock: 'S\u1eafp h\u1ebft h\u00e0ng', outOfStock: 'H\u1ebft h\u00e0ng', search: 'T\u00ecm theo SKU, s\u1ea3n ph\u1ea9m, phi\u00ean b\u1ea3n ho\u1eb7c m\u00e0u...', allStatuses: 'T\u1ea5t c\u1ea3 tr\u1ea1ng th\u00e1i t\u1ed3n', allTypes: 'T\u1ea5t c\u1ea3', allProducts: 'T\u1ea5t c\u1ea3 s\u1ea3n ph\u1ea9m', allVariants: 'T\u1ea5t c\u1ea3 phi\u00ean b\u1ea3n', allColors: 'T\u1ea5t c\u1ea3 m\u00e0u ngo\u1ea1i th\u1ea5t', allInteriors: 'T\u1ea5t c\u1ea3 m\u00e0u n\u1ed9i th\u1ea5t', allActivities: 'T\u1ea5t c\u1ea3 tr\u1ea1ng th\u00e1i kinh doanh', sku: 'M\u00e3 SKU', product: 'S\u1ea3n ph\u1ea9m', variant: 'Phi\u00ean b\u1ea3n', type: 'Lo\u1ea1i', quantity: 'T\u1ed3n', updatedAt: 'C\u1eadp nh\u1eadt', status: 'Tr\u1ea1ng th\u00e1i', action: 'Thao t\u00e1c', adjust: '\u0110i\u1ec1u ch\u1ec9nh', adjustTitle: '\u0110i\u1ec1u ch\u1ec9nh s\u1ed1 l\u01b0\u1ee3ng t\u1ed3n', currentQuantity: 'S\u1ed1 l\u01b0\u1ee3ng hi\u1ec7n t\u1ea1i', newQuantity: 'S\u1ed1 l\u01b0\u1ee3ng m\u1edbi', cancel: 'H\u1ee7y', save: 'L\u01b0u thay \u0111\u1ed5i', noData: 'Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u t\u1ed3n kho ph\u00f9 h\u1ee3p.', loadError: 'T\u1ea3i d\u1eef li\u1ec7u t\u1ed3n kho th\u1ea5t b\u1ea1i', updateError: 'C\u1eadp nh\u1eadt t\u1ed3n kho th\u1ea5t b\u1ea1i', updateSuccess: 'C\u1eadp nh\u1eadt t\u1ed3n kho th\u00e0nh c\u00f4ng', neverUpdated: 'Ch\u01b0a c\u00f3 b\u1ea3n ghi', page: 'Trang', of: 'tr\u00ean', rowsPerPage: 'S\u1ed1 d\u00f2ng', showing: 'Hi\u1ec3n th\u1ecb', results: 'k\u1ebft qu\u1ea3', inactive: 'Ng\u1eebng kinh doanh', resetFilters: 'X\u00f3a b\u1ed9 l\u1ecdc',
}

function statusLabel(status: InventoryStatus) { if (status === 'IN_STOCK') return 'C\u00f2n h\u00e0ng'; if (status === 'LOW_STOCK') return 'S\u1eafp h\u1ebft'; return 'H\u1ebft h\u00e0ng' }
async function responseError(response: Response) { try { const body = await response.json(); return typeof body.error === 'string' ? body.error : body.error?.message || TEXT.loadError } catch { return TEXT.loadError } }

const PRODUCT_TYPE_FILTERS: Array<{ value: AdminInventoryProductType; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'CAR', label: 'Ô tô điện' },
  { value: 'BIKE', label: 'Xe máy điện' },
  { value: 'ACCESSORY', label: 'Phụ kiện' },
]

export default function AdminInventoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | InventoryStatus>('ALL')
  const [activityFilter, setActivityFilter] = useState<AdminInventoryActivity>('ALL')
  const [typeFilter, setTypeFilter] = useState<AdminInventoryProductType>('ALL')
  const [productFilter, setProductFilter] = useState('ALL')
  const [variantFilter, setVariantFilter] = useState('ALL')
  const [colorFilter, setColorFilter] = useState('ALL')
  const [interiorFilter, setInteriorFilter] = useState('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [quantityInput, setQuantityInput] = useState('0')
  const [variantActive, setVariantActive] = useState(true)
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

  const summary = useMemo(() => ({ skuCount: items.length, totalQuantity: items.reduce((total, item) => total + item.onHandQuantity, 0), lowStockCount: items.filter((item) => inventoryStatus(item.onHandQuantity) === 'LOW_STOCK').length, outOfStockCount: items.filter((item) => inventoryStatus(item.onHandQuantity) === 'OUT_OF_STOCK').length, inactiveCount: items.filter((item) => !item.isActive).length }), [items])
  const typeCounts = useMemo(() => ({
    ALL: items.length,
    CAR: items.filter((item) => canonicalInventoryProductType(item.productType) === 'CAR').length,
    BIKE: items.filter((item) => canonicalInventoryProductType(item.productType) === 'BIKE').length,
    ACCESSORY: items.filter((item) => canonicalInventoryProductType(item.productType) === 'ACCESSORY').length,
  }), [items])
  const typeScopedItems = useMemo(() => items.filter((item) => (
    typeFilter === 'ALL' || canonicalInventoryProductType(item.productType) === typeFilter
  )), [items, typeFilter])
  const productOptions = useMemo(() => sortedInventoryValues(typeScopedItems.map((item) => item.productName)), [typeScopedItems])
  const productScopedItems = useMemo(() => typeScopedItems.filter((item) => (
    productFilter === 'ALL' || item.productName === productFilter
  )), [productFilter, typeScopedItems])
  const variantOptions = useMemo(() => sortedInventoryValues(productScopedItems.map(inventoryVariantFilterValue)), [productScopedItems])
  const variantScopedItems = useMemo(() => productScopedItems.filter((item) => (
    variantFilter === 'ALL' || inventoryVariantFilterValue(item) === variantFilter
  )), [productScopedItems, variantFilter])
  const colorOptions = useMemo(() => sortedInventoryValues(variantScopedItems.map((item) => item.color)), [variantScopedItems])
  const colorScopedItems = useMemo(() => variantScopedItems.filter((item) => (
    colorFilter === 'ALL' || item.color === colorFilter
  )), [colorFilter, variantScopedItems])
  const interiorOptions = useMemo(() => sortedInventoryValues(colorScopedItems.map((item) => item.interiorColor)), [colorScopedItems])
  const filteredItems = useMemo(() => {
    return filterAdminInventoryItems(items, {
      search: searchTerm,
      status: statusFilter,
      productType: typeFilter,
      product: productFilter,
      variant: variantFilter,
      color: colorFilter,
      interiorColor: interiorFilter,
      category: 'ALL',
      activity: activityFilter,
    })
  }, [activityFilter, colorFilter, interiorFilter, items, productFilter, searchTerm, statusFilter, typeFilter, variantFilter])

  const activeFilterCount = [
    searchTerm.trim() !== '', statusFilter !== 'ALL', activityFilter !== 'ALL', typeFilter !== 'ALL',
    productFilter !== 'ALL', variantFilter !== 'ALL', colorFilter !== 'ALL',
    interiorFilter !== 'ALL',
  ].filter(Boolean).length
  const showVehicleFilters = typeFilter === 'CAR' || typeFilter === 'BIKE'
  const showInteriorFilter = typeFilter === 'CAR'
  const versionFilterDisabled = productFilter === 'ALL'
  const versionFilterPrompt = 'Chọn sản phẩm trước'

  useEffect(() => { setCurrentPage(1) }, [activityFilter, colorFilter, interiorFilter, searchTerm, statusFilter, typeFilter, productFilter, variantFilter, pageSize])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize)
  const parsedQuantity = Number(quantityInput)
  const canSaveAdjustment = Boolean(adjustingItem) && Number.isInteger(parsedQuantity) && parsedQuantity >= 0 && parsedQuantity <= 1_000_000 && (parsedQuantity !== adjustingItem?.onHandQuantity || variantActive !== adjustingItem?.variantIsActive)

  function selectProductType(nextType: AdminInventoryProductType) {
    setTypeFilter(nextType)
    setProductFilter('ALL')
    setVariantFilter('ALL')
    setColorFilter('ALL')
    setInteriorFilter('ALL')
  }

  function selectProduct(nextProduct: string) {
    setProductFilter(nextProduct)
    setVariantFilter('ALL')
    setColorFilter('ALL')
    setInteriorFilter('ALL')
  }

  function selectVariant(nextVariant: string) {
    setVariantFilter(nextVariant)
    setColorFilter('ALL')
    setInteriorFilter('ALL')
  }

  function resetFilters() {
    setSearchTerm('')
    setStatusFilter('ALL')
    setActivityFilter('ALL')
    selectProductType('ALL')
  }

  function isVehicleInventoryItem(item: InventoryItem) {
    return (item.productType === 'CAR' || item.productType === 'BIKE') && Boolean(item.productId)
  }

  function openAdjustmentModal(item: InventoryItem) {
    setAdjustingItem(item)
    setQuantityInput(String(item.onHandQuantity))
    setVariantActive(item.variantIsActive)
  }

  function openAdjustment(item: InventoryItem) {
    if (isVehicleInventoryItem(item)) {
      const editorPath = item.productType === 'BIKE'
        ? `/admin/products/motorbikes/edit/${item.productId}`
        : `/admin/products/cars/edit/${item.productId}`
      const params = new URLSearchParams({ variantId: item.variantId })
      if (item.inventoryKey) params.set('inventoryKey', item.inventoryKey)
      router.push(`${editorPath}?${params.toString()}`)
      return
    }
    openAdjustmentModal(item)
  }
  function closeAdjustment() { if (!isSaving) setAdjustingItem(null) }

  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adjustingItem) return
    const quantity = Number(quantityInput)
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) { notify('error', TEXT.updateError, 'S\u1ed1 l\u01b0\u1ee3ng ph\u1ea3i l\u00e0 s\u1ed1 nguy\u00ean t\u1eeb 0 \u0111\u1ebfn 1.000.000.'); return }
    setIsSaving(true)
    try {
      const response = await fetch(`/api/v1/admin/variants/${adjustingItem.variantId}/inventory`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ availableQuantity: quantity, expectedUpdatedAt: adjustingItem.updatedAt, isActive: variantActive }) })
      if (!response.ok) throw new Error(await responseError(response))
      const updated: InventoryUpdate = await response.json()
      setItems((current) => current.map((item) => item.variantId === updated.variantId ? { ...item, onHandQuantity: updated.onHandQuantity, updatedAt: updated.updatedAt, variantIsActive: updated.variantIsActive, isActive: updated.variantIsActive && item.productIsActive } : item))
      setAdjustingItem(null)
      notify('success', TEXT.updateSuccess)
    } catch (cause) { notify('error', TEXT.updateError, cause instanceof Error ? cause.message : TEXT.updateError) } finally { setIsSaving(false) }
  }

  const cards = [{ label: TEXT.totalSku, value: summary.skuCount, Icon: Layers3, color: 'bg-blue-50 text-blue-600', filter: null }, { label: TEXT.totalQuantity, value: summary.totalQuantity, Icon: Boxes, color: 'bg-emerald-50 text-emerald-600', filter: null }, { label: TEXT.lowStock, value: summary.lowStockCount, Icon: AlertTriangle, color: 'bg-amber-50 text-amber-600', filter: 'LOW_STOCK' as const }, { label: TEXT.outOfStock, value: summary.outOfStockCount, Icon: ArchiveX, color: 'bg-red-50 text-red-600', filter: 'OUT_OF_STOCK' as const }, { label: TEXT.inactive, value: summary.inactiveCount, Icon: Ban, color: 'bg-slate-100 text-slate-600', filter: 'INACTIVE' as const }]

  return (
    <div className="min-w-0 space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{TEXT.title}</h1><p className="mt-1 text-sm text-slate-500">{TEXT.subtitle}</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(({ label, value, Icon, color, filter }) => {
        const content = <><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${color}`}><Icon size={23} /></div><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value.toLocaleString('vi-VN')}</p></div></>
        if (!filter) return <div key={label} className="flex min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{content}</div>
        const active = filter === 'INACTIVE' ? activityFilter === 'INACTIVE' : activityFilter !== 'INACTIVE' && statusFilter === filter
        const applyFilter = () => {
          if (filter === 'INACTIVE') { setActivityFilter(active ? 'ALL' : 'INACTIVE'); setStatusFilter('ALL'); return }
          setActivityFilter('ALL')
          setStatusFilter(active ? 'ALL' : filter)
        }
        return <button key={label} type="button" aria-pressed={active} onClick={applyFilter} className={`flex min-w-0 items-center gap-4 rounded-xl border bg-white p-5 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'}`}>{content}</button>
      })}</div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" placeholder={TEXT.search} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:shrink-0">
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"><Filter size={16} className="shrink-0 text-slate-400" /><span className="sr-only">Trạng thái tồn kho</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | InventoryStatus)} className="min-w-0 flex-1 bg-transparent focus:outline-none"><option value="ALL">{TEXT.allStatuses}</option><option value="IN_STOCK">{statusLabel('IN_STOCK')}</option><option value="LOW_STOCK">{statusLabel('LOW_STOCK')}</option><option value="OUT_OF_STOCK">{statusLabel('OUT_OF_STOCK')}</option></select></label>
              <label className="flex h-10 min-w-0 items-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"><span className="sr-only">Trạng thái kinh doanh</span><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as AdminInventoryActivity)} className="min-w-0 flex-1 bg-transparent focus:outline-none"><option value="ALL">{TEXT.allActivities}</option><option value="ACTIVE">Đang kinh doanh</option><option value="INACTIVE">Ngừng kinh doanh</option></select></label>
            </div>
            {activeFilterCount > 0 && <button type="button" onClick={resetFilters} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><RotateCcw size={15} />{TEXT.resetFilters}<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{activeFilterCount}</span></button>}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Loại sản phẩm</p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {PRODUCT_TYPE_FILTERS.map((option) => {
                const active = typeFilter === option.value
                return <button key={option.value} type="button" aria-pressed={active} onClick={() => selectProductType(option.value)} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100'}`}><span>{option.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{typeCounts[option.value]}</span></button>
              })}
            </div>
          </div>

          <div className={`grid gap-3 sm:grid-cols-2 ${showInteriorFilter ? 'xl:grid-cols-4' : showVehicleFilters ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
            <div className="min-w-0 text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Sản phẩm</span><InventoryProductCombobox options={productOptions} value={productFilter} onChange={selectProduct} allLabel={TEXT.allProducts} ariaLabel="Tìm và chọn sản phẩm" /></div>
            <label className={`min-w-0 text-xs font-semibold transition ${versionFilterDisabled ? 'text-slate-400' : 'text-slate-600'}`}><span className="mb-1.5 block">Phiên bản / lựa chọn</span><select disabled={versionFilterDisabled} value={variantFilter} onChange={(event) => selectVariant(event.target.value)} title={versionFilterDisabled ? `${versionFilterPrompt}.` : undefined} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-70"><option value="ALL">{versionFilterDisabled ? versionFilterPrompt : TEXT.allVariants}</option>{!versionFilterDisabled && variantOptions.map((variant) => <option key={variant} value={variant}>{variant}</option>)}</select></label>
            {showVehicleFilters && <label className="min-w-0 text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Màu ngoại thất</span><select value={colorFilter} onChange={(event) => { setColorFilter(event.target.value); setInteriorFilter('ALL') }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"><option value="ALL">{TEXT.allColors}</option>{colorOptions.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>}
            {showInteriorFilter && <label className="min-w-0 text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Màu nội thất</span><select value={interiorFilter} onChange={(event) => setInteriorFilter(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"><option value="ALL">{TEXT.allInteriors}</option>{interiorOptions.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>}
          </div>

          <p className="text-xs text-slate-500">Đang hiển thị <span className="font-bold text-slate-700">{filteredItems.length}</span> trên {items.length} SKU. Các bộ lọc được kết hợp đồng thời.</p>
        </div>

        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500"><tr>
            <th className="w-[14%] px-3 py-4">{TEXT.sku}</th><th className="w-[18%] px-3 py-4">{TEXT.product}</th><th className="w-[17%] px-3 py-4">{TEXT.variant}</th>
            <th className="hidden w-[12%] px-3 py-4 xl:table-cell">{TEXT.type}</th>
            <th className="w-[9%] px-2 py-4 text-center">{TEXT.quantity}</th><th className="hidden w-[14%] px-3 py-4 2xl:table-cell">{TEXT.updatedAt}</th><th className="w-[13%] px-3 py-4">{TEXT.status}</th><th className="w-[10%] px-3 py-4 text-right">{TEXT.action}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td colSpan={8} className="px-6 py-14 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></td></tr> : paginatedItems.map((item) => { const status = inventoryStatus(item.onHandQuantity); const badge = status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : status === 'LOW_STOCK' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'; return <tr key={item.variantId} role="button" tabIndex={0} aria-label={`Điều chỉnh tồn kho ${item.productName} ${item.variantName}`} onClick={() => openAdjustment(item)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAdjustment(item) } }} className="cursor-pointer transition duration-150 hover:bg-slate-50 active:scale-[0.997] active:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
              <td className="px-3 py-4"><span className="block truncate font-medium text-slate-500" title={item.sku}>{item.sku}</span></td><td className="px-3 py-4"><span className="block truncate font-semibold text-slate-900" title={item.productName}>{item.productName}</span></td><td className="px-3 py-4"><span className="block truncate text-slate-600" title={item.variantName}>{item.variantName}</span></td><td className="hidden truncate px-3 py-4 text-slate-600 xl:table-cell">{inventoryProductTypeLabel(item)}</td>
              <td className={`px-2 py-4 text-center text-lg font-bold ${status === 'OUT_OF_STOCK' ? 'text-red-600' : status === 'LOW_STOCK' ? 'text-amber-600' : 'text-slate-900'}`}>{item.onHandQuantity}</td><td className="hidden px-3 py-4 text-xs text-slate-500 2xl:table-cell">{item.updatedAt ? new Date(item.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : TEXT.neverUpdated}</td><td className="px-3 py-4"><span className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase ${badge}`}><span className="truncate">{statusLabel(status)}</span></span>{!item.isActive && <span className="mt-1 block truncate text-[10px] text-slate-400">{TEXT.inactive}</span>}</td>
              <td className="px-3 py-4 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); openAdjustment(item) }} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100" title={isVehicleInventoryItem(item) ? 'Mở CRUD biến thể' : TEXT.adjust}><Pencil size={13} /><span className="hidden 2xl:inline">{TEXT.adjust}</span></button></td>
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

      <AdminModalPortal><AnimatePresence>
        {adjustingItem && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeAdjustment() }} role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title">
          <motion.div className="w-full max-w-md rounded-xl bg-white shadow-2xl" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div className="min-w-0"><h2 id="inventory-adjust-title" className="font-bold text-slate-900">{TEXT.adjustTitle}</h2><p className="truncate text-xs text-slate-500">{adjustingItem.sku} · {adjustingItem.variantName}</p></div><button type="button" onClick={closeAdjustment} disabled={isSaving} className="rounded p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <form onSubmit={saveAdjustment} className="space-y-5 p-6"><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">{TEXT.currentQuantity}</p><p className="mt-1 text-2xl font-bold text-slate-900">{adjustingItem.onHandQuantity}</p></div><label className="block text-sm font-medium text-slate-700">{TEXT.newQuantity}<input autoFocus required type="number" min={0} max={1000000} step={1} value={quantityInput} onChange={(event) => setQuantityInput(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 px-3 text-lg font-semibold focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" /></label><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-800">Trạng thái kinh doanh</p><p className="mt-1 text-xs text-slate-500">Áp dụng cho phiên bản sản phẩm này.</p></div><button type="button" role="switch" aria-checked={variantActive} onClick={() => setVariantActive((active) => !active)} className="inline-flex items-center gap-2 text-xs font-semibold"><span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${variantActive ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${variantActive ? 'translate-x-5' : 'translate-x-0'}`} /></span><span className={variantActive ? 'text-emerald-700' : 'text-slate-500'}>{variantActive ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}</span></button></div>{!adjustingItem.productIsActive && <p className="mt-3 text-xs font-medium text-amber-700">Sản phẩm cha đang ngừng kinh doanh. Cần kích hoạt lại sản phẩm để phiên bản này được bán.</p>}</div><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={closeAdjustment} disabled={isSaving} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{TEXT.cancel}</button><button type="submit" disabled={isSaving || !canSaveAdjustment} className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{isSaving && <Loader2 size={15} className="mr-2 animate-spin" />}{TEXT.save}</button></div></form>
          </motion.div>
        </motion.div>}
      </AnimatePresence></AdminModalPortal>
    </div>
  )
}
