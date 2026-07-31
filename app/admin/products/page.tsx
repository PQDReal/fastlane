'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { Search, Plus, Filter, MoreHorizontal, Edit, Trash2, Loader2, ChevronLeft, ChevronRight, Wrench, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ProductCreateDialog } from '../../../components/admin/product-create/product-create-dialog'
import { Button } from '../../../components/ui/button'
import { ToastViewport, type ToastMessage } from '../../../components/ui/toast'
import type { AdminRootCategory } from '../../../lib/catalog/admin-accessory-draft'
import type { CatalogServiceLabel } from '../../../lib/catalog/service-labels'
import type { AdminAccessoryEditorData } from '../../../lib/catalog/admin-accessory-write'

type AdminProduct = {
  id: string
  name: string
  product_type: string | null
  image_urls: string[] | null
  displayed_price: number | null
  is_active: boolean
  created_at: string
  category: string
  sku?: string
  service_label_assignments?: Array<{ service_label_id: string }>
}

async function responseError(response: Response) {
  try {
    const body = await response.json()
    if (typeof body.error === 'string') return body.error
    if (body.error && typeof body.error === 'object' && typeof body.error.message === 'string') {
      return body.error.message
    }
    return 'Có lỗi xảy ra.'
  } catch {
    return 'Có lỗi xảy ra.'
  }
}

export default function AdminProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [categories, setCategories] = useState<AdminRootCategory[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [serviceLabels, setServiceLabels] = useState<CatalogServiceLabel[]>([])
  const [assignmentProduct, setAssignmentProduct] = useState<AdminProduct | null>(null)
  const [selectedServiceLabelIds, setSelectedServiceLabelIds] = useState<string[]>([])
  const [savingLabels, setSavingLabels] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingAccessory, setEditingAccessory] = useState<AdminAccessoryEditorData | undefined>()
  const [loadingEditProductId, setLoadingEditProductId] = useState<string | null>(null)
  const [productsReloadKey, setProductsReloadKey] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const assignmentCloseRef = useRef<HTMLButtonElement>(null)

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setDebouncedSearch(searchTerm.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    fetch('/api/v1/admin/categories', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    fetch('/api/v1/admin/service-labels', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        return response.json()
      })
      .then((data) => setServiceLabels(Array.isArray(data) ? data : []))
      .catch((error) => notify('error', 'Tải nhãn dịch vụ thất bại', error instanceof Error ? error.message : undefined))
  }, [notify])

  useEffect(() => {
    if (!assignmentProduct) return
    const timer = window.setTimeout(() => assignmentCloseRef.current?.focus(), 80)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingLabels) setAssignmentProduct(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [assignmentProduct, savingLabels])

  useEffect(() => {
    const controller = new AbortController()
    const fetchProducts = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10' })
        if (debouncedSearch) params.set('q', debouncedSearch)
        if (categoryFilter !== 'All') params.set('categoryId', categoryFilter)
        const res = await fetch(`/api/v1/admin/products?${params}`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) throw new Error('Không thể tải sản phẩm')
        const payload = await res.json()
        setProducts(Array.isArray(payload.data) ? payload.data : [])
        setMeta(payload.meta ?? { page, limit: 10, total: 0, totalPages: 1 })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error('Failed to fetch products:', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void fetchProducts()
    return () => controller.abort()
  }, [categoryFilter, debouncedSearch, page, productsReloadKey])
  const formatMoney = (val: number | null) => val === null ? '—' : new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN')

  function openServiceLabels(product: AdminProduct) {
    setAssignmentProduct(product)
    setSelectedServiceLabelIds((product.service_label_assignments ?? []).map((item) => item.service_label_id))
  }

  function toggleServiceLabel(id: string) {
    setSelectedServiceLabelIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id])
  }

  async function saveServiceLabels() {
    if (!assignmentProduct) return
    setSavingLabels(true)
    try {
      const response = await fetch(`/api/v1/admin/products/${assignmentProduct.id}/service-labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceLabelIds: selectedServiceLabelIds }),
      })
      if (!response.ok) throw new Error(await responseError(response))
      const body = await response.json()
      const savedIds = Array.isArray(body.serviceLabelIds) ? body.serviceLabelIds : []
      setProducts((items) => items.map((product) => product.id === assignmentProduct.id
        ? { ...product, service_label_assignments: savedIds.map((id: string) => ({ service_label_id: id })) }
        : product))
      setAssignmentProduct(null)
      notify('success', 'Cập nhật nhãn phụ kiện thành công')
    } catch (error) {
      notify('error', 'Cập nhật nhãn phụ kiện thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setSavingLabels(false)
    }
  }

  async function openProductEditor(product: AdminProduct) {
    if (product.product_type !== 'ACCESSORY') {
      notify('warning', 'Chưa hỗ trợ loại sản phẩm này', 'Hiện form chỉnh sửa đầy đủ chỉ áp dụng cho phụ kiện.')
      return
    }
    setLoadingEditProductId(product.id)
    try {
      const response = await fetch(`/api/v1/admin/products/${encodeURIComponent(product.id)}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseError(response))
      const payload: unknown = await response.json()
      const data = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).data
        : null
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Dữ liệu chỉnh sửa sản phẩm không hợp lệ.')
      }
      setEditingAccessory(data as AdminAccessoryEditorData)
      setIsCreateOpen(true)
    } catch (error) {
      notify('error', 'Tải phụ kiện thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setLoadingEditProductId(null)
    }
  }

  return (
    <div className="space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý xe, phụ kiện và bảng giá.</p>
        </div>
        <Button onClick={() => { setEditingAccessory(undefined); setIsCreateOpen(true) }} className="bg-slate-900 text-white hover:bg-slate-800 shrink-0">
          <Plus size={16} className="mr-2" /> Thêm sản phẩm
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm sản phẩm..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-md border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-md px-3 h-10 text-sm font-medium text-slate-700 w-full sm:w-auto">
              <Filter size={16} className="text-slate-400"/>
              <select 
                className="bg-transparent focus:outline-none w-full"
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
              >
                <option value="All">Tất cả danh mục</option>
                {/* Dynamically generate categories if needed, but for now hardcoded based on known values is ok, or unique from data */}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Sản phẩm</th>
                <th className="px-6 py-4">Mã (SKU)</th>
                <th className="px-6 py-4">Danh mục</th>
                <th className="px-6 py-4">Giá</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="relative w-28 px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  </td>
                </tr>
              ) : products.map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                        {product.image_urls && product.image_urls[0] && product.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? (
                          <img src={product.image_urls[0]} alt={product.name} className="w-8 h-auto object-contain" />
                        ) : (
                          <span className="text-xs text-slate-400">No img</span>
                        )}
                      </div>
                      <span className="font-semibold text-slate-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{product.sku}</td>
                  <td className="px-6 py-4 text-slate-600">{product.category}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMoney(product.displayed_price)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase ${
                      product.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {product.is_active ? 'Hoạt động' : 'Bản nháp'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(product.created_at)}</td>
                  <td className="relative w-28 px-6 py-4 text-right">
                    <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      {product.product_type === 'ACCESSORY' && <button type="button" onClick={() => openServiceLabels(product)} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-brand-50 hover:text-brand-600" aria-label={`Gán nhãn dịch vụ cho ${product.name}`}><Wrench size={16}/></button>}
                      <button type="button" disabled={loadingEditProductId === product.id} onClick={() => void openProductEditor(product)} className="rounded p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50" aria-label={`Sửa ${product.name}`}>{loadingEditProductId === product.id ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16}/>}</button>
                      <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                    </div>
                    <button className="absolute right-6 top-1/2 inline-block -translate-y-1/2 p-2 text-slate-400 transition-opacity group-hover:pointer-events-none group-hover:opacity-0"><MoreHorizontal size={16}/></button>
                  </td>
                </tr>
              ))}
              
              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Không tìm thấy sản phẩm nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && meta.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Hiển thị {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} / {meta.total} sản phẩm</span>
            <div className="flex items-center gap-3">
              <span>Trang {meta.page} / {meta.totalPages}</span>
              <button type="button" aria-label="Trang trước" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={meta.page <= 1} className="rounded-md border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Trang sau" onClick={() => setPage((value) => Math.min(meta.totalPages, value + 1))} disabled={meta.page >= meta.totalPages} className="rounded-md border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}      </div>

      <ProductCreateDialog
        open={isCreateOpen}
        categories={categories}
        serviceLabels={serviceLabels}
        initialAccessory={editingAccessory}
        onClose={() => {
          setIsCreateOpen(false)
        }}
        onAfterClose={() => setEditingAccessory(undefined)}
        onSaved={() => {
          const wasEditing = Boolean(editingAccessory)
          setIsCreateOpen(false)
          setProductsReloadKey((value) => value + 1)
          notify('success', wasEditing ? 'Đã cập nhật sản phẩm phụ kiện' : 'Đã tạo sản phẩm phụ kiện')
        }}
      />

      <AnimatePresence>
        {assignmentProduct && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !savingLabels) setAssignmentProduct(null) }}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="product-service-label-dialog-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 id="product-service-label-dialog-title" className="text-lg font-bold">Gán nhãn dịch vụ</h2><p className="mt-1 text-sm text-slate-500">{assignmentProduct.name}</p></div><button ref={assignmentCloseRef} type="button" onClick={() => setAssignmentProduct(null)} disabled={savingLabels} className="rounded p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Đóng"><X size={18} /></button></div>
              <div className="space-y-3 p-6">
                {serviceLabels.filter((label) => label.isActive).map((label) => <label key={label.id} className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition active:scale-[0.99] hover:bg-slate-50"><input type="checkbox" checked={selectedServiceLabelIds.includes(label.id)} onChange={() => toggleServiceLabel(label.id)} className="mt-0.5 h-4 w-4 accent-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500" /><span><span className="block text-sm font-semibold text-slate-800">{label.name}</span>{label.description && <span className="mt-1 block text-xs text-slate-500">{label.description}</span>}</span></label>)}
                {serviceLabels.filter((label) => label.isActive).length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">Chưa có nhãn dịch vụ đang hoạt động.</p>}
              </div>
              <div className="flex justify-end gap-3 border-t px-6 py-4"><Button type="button" variant="outline" onClick={() => setAssignmentProduct(null)} disabled={savingLabels}>Hủy</Button><Button type="button" onClick={() => void saveServiceLabels()} disabled={savingLabels} className="bg-slate-900 text-white">{savingLabels && <Loader2 size={16} className="mr-2 animate-spin" />}Lưu nhãn</Button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

