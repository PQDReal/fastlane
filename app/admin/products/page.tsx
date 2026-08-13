'use client'

import { useCallback, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Plus, Filter, Edit, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { ToastViewport, type ToastMessage } from '../../../components/ui/toast'
import type { AdminRootCategory } from '../../../lib/catalog/admin-accessory-draft'
import { consumeAdminFlashToast } from '../../../lib/admin-flash-toast'

function ProductActionButton({
  label,
  onClick,
  disabled = false,
  destructive = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`group/action relative rounded p-2 text-slate-400 transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 ${destructive ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-brand-50 hover:text-brand-600'}`}
    >
      {children}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover/action:opacity-100 group-focus-visible/action:opacity-100">
        {label}
      </span>
    </button>
  )
}

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
  specifications?: any
}

function isVehicleImage(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.endsWith('.svg') || lower.endsWith('.mp4')) return false
  
  const excludeKeywords = [
    'logo',
    'separate-line',
    'line',
    'icon',
    'tvc',
    'banner',
    'charging',
    'station',
    'compare',
    'support',
    'urgent',
    'vip',
    'gia',
    'price',
    'table',
    'spec',
    'mb.webp',
    'hero-mb',
    'canvas',
    'tag-line',
    'naturel',
    'interior-first-sight',
    'video'
  ]
  
  for (const kw of excludeKeywords) {
    if (lower.includes(kw)) return false
  }
  if (lower.endsWith('/vf3.jpg')) return false
  return true
}

function getProductThumbnail(product: AdminProduct): string | null {
  const specs = product.specifications
  if (specs && typeof specs === 'object') {
    const isWhiteColor = (name: string | null | undefined): boolean => {
      if (!name) return false
      const lower = name.toLowerCase()
      return lower.includes('trắng') || 
             lower.includes('white') || 
             lower.includes('blanc') || 
             lower.includes('brahminy') || 
             lower.includes('infinity')
    }

    // 1. Try color details first (prioritizing white color!)
    if (specs.color_details?.length > 0) {
      const whiteCol = specs.color_details.find((c: any) => c.image_url && isWhiteColor(c.color_name) && isVehicleImage(c.image_url))
      if (whiteCol) return whiteCol.image_url
      const colImg = specs.color_details.find((c: any) => c.image_url && isVehicleImage(c.image_url))
      if (colImg) return colImg.image_url
    }
    // 2. Try fallback colors (prioritizing white color!)
    if (specs.fallback_colors?.length > 0) {
      const whiteCol = specs.fallback_colors.find((c: any) => c.image && isWhiteColor(c.name) && isVehicleImage(c.image))
      if (whiteCol) return whiteCol.image
      const fbCol = specs.fallback_colors.find((c: any) => c.image && isVehicleImage(c.image))
      if (fbCol) return fbCol.image
    }
    // 3. Try representative image
    if (specs.representative_image && isVehicleImage(specs.representative_image)) {
      return specs.representative_image
    }
    // 4. Try exterior images for cars
    if (specs.gallery?.exterior_images?.length > 0) {
      const whiteImg = specs.gallery.exterior_images.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
      if (whiteImg) return whiteImg
      const extImg = specs.gallery.exterior_images.find((img: string) => isVehicleImage(img))
      if (extImg) return extImg
    }
    // 5. Try all images but filter out logos/svgs
    if (specs.gallery?.all_images?.length > 0) {
      const whiteImg = specs.gallery.all_images.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
      if (whiteImg) return whiteImg
      const allImg = specs.gallery.all_images.find((img: string) => isVehicleImage(img))
      if (allImg) return allImg
    }
    // 6. Try fallback color images
    if (specs.fallback_color_images?.length > 0) {
      const whiteImg = specs.fallback_color_images.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
      if (whiteImg) return whiteImg
      const fbcImg = specs.fallback_color_images.find((img: string) => isVehicleImage(img))
      if (fbcImg) return fbcImg
    }
  }

  // Fallback to standard product.image_urls
  if (product.image_urls && product.image_urls.length > 0) {
    const isWhiteColor = (name: string): boolean => {
      const lower = name.toLowerCase()
      return lower.includes('trắng') || 
             lower.includes('white') || 
             lower.includes('blanc') || 
             lower.includes('brahminy') || 
             lower.includes('infinity')
    }
    const whiteImg = product.image_urls.find((img: string) => isWhiteColor(img) && isVehicleImage(img))
    if (whiteImg) return whiteImg
    const cleanImg = product.image_urls.find((img: string) => isVehicleImage(img))
    if (cleanImg) return cleanImg
    return product.image_urls[0]
  }

  return null
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
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [categories, setCategories] = useState<AdminRootCategory[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [productsReloadKey, setProductsReloadKey] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }, [])

  useEffect(() => {
    const toast = consumeAdminFlashToast(window.sessionStorage)
    if (toast) notify(toast.kind, toast.title, toast.message)
  }, [notify])

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
    const controller = new AbortController()
    const fetchProducts = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10' })
        if (debouncedSearch) params.set('q', debouncedSearch)
        if (categoryFilter !== 'All') params.set('categoryId', categoryFilter)
        const res = await fetch(`/api/v1/admin/products?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) throw new Error(await responseError(res))
        const payload = await res.json()
        setProducts(Array.isArray(payload.data) ? payload.data : [])
        setMeta(payload.meta ?? { page, limit: 10, total: 0, totalPages: 1 })
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to fetch products:', error)
          notify('error', 'Không thể tải sản phẩm', (error as Error).message)
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void fetchProducts()
    return () => controller.abort()
  }, [categoryFilter, debouncedSearch, page, productsReloadKey])
  const formatMoney = (val: number | null) => val === null ? '—' : new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN')

  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)

  async function handleDeleteProduct(productId: string, productType: string | null) {
    setDeletingProductId(productId)
    try {
      const endpoint = productType === 'BIKE'
        ? `/api/v1/admin/motorbikes/${productId}`
        : productType === 'CAR'
        ? `/api/v1/admin/cars/${productId}`
        : `/api/v1/admin/products/${productId}`

      const response = await fetch(endpoint, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(await responseError(response))
      }

      notify('success', 'Xóa sản phẩm thành công', 'Sản phẩm đã được xóa khỏi hệ thống.')
      setProductsReloadKey((current) => current + 1)
    } catch (error) {
      notify('error', 'Xóa sản phẩm thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setDeletingProductId(null)
    }
  }

  const confirmDeleteProduct = (product: AdminProduct) => {
    if (product.product_type !== 'BIKE' && product.product_type !== 'ACCESSORY' && product.product_type !== 'CAR') {
      notify('warning', 'Chưa hỗ trợ xóa loại sản phẩm này')
      return
    }
    const toastId = Date.now() + Math.random()
    setToasts((items) => [
      ...items,
      {
        id: toastId,
        kind: 'warning',
        title: 'Xác nhận xóa sản phẩm?',
        message: `Bạn có chắc chắn muốn xóa sản phẩm "${product.name}"? Thao tác này không thể hoàn tác.`,
        action: {
          label: 'Xóa vĩnh viễn',
          variant: 'danger',
          onClick: () => {
            setToasts((current) => current.filter((item) => item.id !== toastId))
            void handleDeleteProduct(product.id, product.product_type)
          },
        },
        secondaryAction: {
          label: 'Hủy',
          onClick: () => {
            setToasts((current) => current.filter((item) => item.id !== toastId))
          },
        },
      },
    ])
  }

  function openProductEditor(product: AdminProduct) {
    if (product.product_type === 'BIKE') {
      router.push(`/admin/products/motorbikes/edit/${product.id}`)
      return
    }
    if (product.product_type === 'CAR') {
      router.push(`/admin/products/cars/edit/${product.id}`)
      return
    }
    if (product.product_type !== 'ACCESSORY') {
      notify('warning', 'Chưa hỗ trợ loại sản phẩm này', 'Hiện form chỉnh sửa đầy đủ chỉ áp dụng cho phụ kiện, xe ô tô và xe máy điện.')
      return
    }
    router.push(`/admin/products/accessories/edit/${product.id}`)
  }

  return (
    <div className="space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý xe, phụ kiện và bảng giá.</p>
        </div>
        <div className="relative shrink-0">
          <Button type="button" onClick={() => setCreateMenuOpen((value) => !value)} className="bg-slate-900 text-white hover:bg-slate-800">
            <Plus size={16} className="mr-2" /> Thêm sản phẩm
          </Button>
          {createMenuOpen && <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
            <Link href="/admin/products/accessories/new" onClick={() => setCreateMenuOpen(false)} className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Phụ kiện</Link>
            <Link href="/admin/products/cars/new" onClick={() => setCreateMenuOpen(false)} className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Ô tô điện</Link>
            <Link href="/admin/products/motorbikes/new" onClick={() => setCreateMenuOpen(false)} className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Xe máy điện</Link>
          </div>}
        </div>
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
              suppressHydrationWarning
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-md px-3 h-10 text-sm font-medium text-slate-700 w-full sm:w-auto">
              <Filter size={16} className="text-slate-400"/>
              <select 
                className="bg-transparent focus:outline-none w-full"
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
                suppressHydrationWarning
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

        {/* Responsive list: reuse the minmax(0, ...) layout used by order lists. */}
        <div className="max-h-[calc(100vh-340px)] overflow-x-hidden overflow-y-auto">
          <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1.35fr)_minmax(0,1.05fr)_minmax(120px,.9fr)_minmax(112px,.9fr)_minmax(116px,.9fr)_minmax(88px,.55fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:sticky xl:top-0 xl:z-10 xl:grid xl:gap-5">
            <span>Sản phẩm</span>
            <span>Mã (SKU)</span>
            <span>Danh mục</span>
            <span>Giá</span>
            <span>Trạng thái</span>
            <span>Ngày tạo</span>
            <span className="text-right">Thao tác</span>
          </div>

          <div className="divide-y divide-slate-100">
            {isLoading ? (
              <div className="flex min-h-32 items-center justify-center px-6 py-12 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : products.map((product) => (
              <div key={product.id} className="group grid w-full grid-cols-1 gap-4 px-5 py-4 text-sm transition-colors hover:bg-slate-50 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1.35fr)_minmax(0,1.05fr)_minmax(120px,.9fr)_minmax(112px,.9fr)_minmax(116px,.9fr)_minmax(88px,.55fr)] xl:items-center xl:gap-5">
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Sản phẩm</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100">
                      {getProductThumbnail(product) ? (
                        <img src={getProductThumbnail(product)!} alt={product.name} className="h-auto w-8 object-contain animate-fade-in" />
                      ) : (
                        <span className="text-xs text-slate-400">No img</span>
                      )}
                    </div>
                    <p className="min-w-0 truncate font-semibold text-slate-900" title={product.name}>{product.name}</p>
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Mã (SKU)</span>
                  <p className="truncate font-medium text-slate-500" title={product.sku}>{product.sku}</p>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Danh mục</span>
                  <p className="truncate text-slate-600" title={product.category}>{product.category}</p>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Giá</span>
                  <p className="whitespace-nowrap font-semibold text-slate-900">{formatMoney(product.displayed_price)}</p>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Trạng thái</span>
                  <span className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-bold uppercase ${
                    product.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <span className="truncate">{product.is_active ? 'Hoạt động' : 'Bản nháp'}</span>
                  </span>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Ngày tạo</span>
                  <time dateTime={product.created_at} className="whitespace-nowrap text-slate-500">{formatDate(product.created_at)}</time>
                </div>

                <div className="min-w-0 xl:text-right">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Thao tác</span>
                  <div className="flex items-center gap-2 xl:justify-end xl:opacity-0 xl:transition-opacity xl:group-focus-within:opacity-100 xl:group-hover:opacity-100">
                    <ProductActionButton label="Chỉnh sửa sản phẩm" onClick={() => openProductEditor(product)}><Edit size={16}/></ProductActionButton>
                    <ProductActionButton label="Xóa sản phẩm" destructive disabled={deletingProductId === product.id} onClick={() => confirmDeleteProduct(product)}>{deletingProductId === product.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16}/>}</ProductActionButton>
                  </div>
                </div>
              </div>
            ))}

            {!isLoading && products.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-500">
                Không tìm thấy sản phẩm nào.
              </div>
            )}
          </div>
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

    </div>
  )
}

