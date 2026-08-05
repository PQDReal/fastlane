'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import {
  ArrowLeft,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { ProductOptionSummary } from '@/components/product-option-summary'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { useAppStore } from '@/lib/store'

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

export default function CartPage() {
  const router = useRouter()
  const { user, isLoading: userLoading } = useUser()
  const {
    cartItems,
    cartLoading,
    cartLoaded,
    cartError,
    cartOwnerSubject,
    syncCartOwner,
    loadCart,
    removeFromCart,
    updateQuantity,
  } = useAppStore()
  const userSubject = typeof user?.sub === 'string' ? user.sub : null
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionInitialized, setSelectionInitialized] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const closeToast = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])
  const notify = useCallback((toast: Omit<ToastMessage, 'id'>, duration = 4500) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { ...toast, id }])
    if (duration > 0) window.setTimeout(() => closeToast(id), duration)
    return id
  }, [closeToast])

  useEffect(() => {
    if (!userLoading && !user) {
      window.location.assign(`/auth/login?returnTo=${encodeURIComponent('/cart')}`)
    }
  }, [user, userLoading])

  useEffect(() => {
    if (!userSubject) return

    const ownerChanged = syncCartOwner(userSubject)
    if (ownerChanged || !cartLoaded) void loadCart(userSubject)
  }, [cartLoaded, loadCart, syncCartOwner, userSubject])

  useEffect(() => {
    setSelectedIds(new Set())
    setSelectionInitialized(false)
  }, [cartOwnerSubject])

  useEffect(() => {
    if (!cartLoaded) return

    setSelectedIds((current) => {
      if (!selectionInitialized) {
        return new Set(
          cartItems
            .filter((item) => item.availableQuantity > 0)
            .map((item) => item.id),
        )
      }
      const validIds = new Set(
        cartItems
          .filter((item) => item.availableQuantity > 0)
          .map((item) => item.id),
      )
      return new Set([...current].filter((id) => validIds.has(id)))
    })
    setSelectionInitialized(true)
  }, [cartItems, cartLoaded, selectionInitialized])

  const selectedItems = useMemo(
    () => cartItems.filter(
      (item) => selectedIds.has(item.id) && item.availableQuantity > 0,
    ),
    [cartItems, selectedIds],
  )

  const availableItems = useMemo(
    () => cartItems.filter((item) => item.availableQuantity > 0),
    [cartItems],
  )
  const allSelected =
    availableItems.length > 0 && selectedIds.size === availableItems.length
  const selectedQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  )
  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(availableItems.map((item) => item.id)),
    )
  }

  const toggleItem = (itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const changeQuantity = async (itemId: string, quantity: number) => {
    setActionError(null)
    const result = await updateQuantity(itemId, quantity)
    if (!result.ok) setActionError(result.message)
  }

  const removeItem = async (itemId: string, toastId: number) => {
    closeToast(toastId)
    setActionError(null)
    const result = await removeFromCart(itemId)
    if (!result.ok) {
      notify({ kind: 'error', title: 'Xóa sản phẩm thất bại', message: result.message })
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(itemId)
      return next
    })
    notify({ kind: 'success', title: 'Đã xóa sản phẩm khỏi giỏ hàng' })
  }

  const requestRemove = (itemId: string, itemName: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, {
      id,
      kind: 'warning',
      title: 'Xóa sản phẩm?',
      message: `Bạn có chắc muốn xóa “${itemName}” khỏi giỏ hàng?`,
      secondaryAction: { label: 'Hủy', onClick: () => closeToast(id) },
      action: { label: 'Xóa', variant: 'danger', onClick: () => void removeItem(itemId, id) },
    }])
  }

  const proceedToCheckout = () => {
    if (selectedIds.size === 0) return
    const params = new URLSearchParams()
    selectedItems.forEach((item) => params.append('item', item.id))
    window.dispatchEvent(new Event('fastlane:navigation-start'))
    router.push(`/checkout?${params.toString()}`)
  }

  if (userLoading || (user && !cartLoaded && cartLoading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </main>
    )
  }

  if (!user) return null

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 pt-[74px]">
      <Header />
      <ToastViewport toasts={toasts} onClose={closeToast} />

      <div className="border-y border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-5 py-4 text-sm lg:px-8">
          <Link href="/accessories" className="font-semibold text-brand-700 hover:underline">
            Phụ kiện
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">Giỏ hàng</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Sản phẩm trong giỏ hàng</h1>
            <p className="mt-2 text-sm text-slate-500">
              {cartItems.length} dòng sản phẩm · chọn những sản phẩm bạn muốn thanh toán
            </p>
          </div>
          <Link
            href="/accessories"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-700"
          >
            <ArrowLeft size={16} /> Tiếp tục mua hàng
          </Link>
        </div>

        {(actionError || cartError) && (
          <div role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError || cartError}
          </div>
        )}

        {cartItems.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
            <ShoppingBag className="mx-auto h-14 w-14 text-slate-300" />
            <h2 className="mt-5 text-xl font-bold text-slate-900">Giỏ hàng đang trống</h2>
            <p className="mt-2 text-sm text-slate-500">Hãy thêm phụ kiện bạn yêu thích vào giỏ hàng.</p>
            <Link
              href="/accessories"
              className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Xem phụ kiện
            </Link>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 md:grid-cols-[44px_minmax(280px,1fr)_160px_180px_180px_48px] md:px-6">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả sản phẩm"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-5 w-5 accent-brand-600"
                />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Sản phẩm</span>
                <span className="hidden text-xs font-bold uppercase tracking-wide text-slate-600 md:block">Giá tiền</span>
                <span className="hidden text-center text-xs font-bold uppercase tracking-wide text-slate-600 md:block">Số lượng</span>
                <span className="hidden text-right text-xs font-bold uppercase tracking-wide text-slate-600 md:block">Thành tiền</span>
                <span className="sr-only">Xóa</span>
              </div>

              {cartItems.map((item) => {
                const outOfStock = item.availableQuantity <= 0
                return (
                <article
                  key={item.id}
                  className={`grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-slate-100 px-4 py-5 last:border-0 md:grid-cols-[44px_minmax(280px,1fr)_160px_180px_180px_48px] md:items-center md:px-6 ${outOfStock ? 'bg-slate-100/80' : ''}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${item.name}`}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    disabled={outOfStock}
                    className="mt-6 h-5 w-5 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-30 md:mt-0"
                  />

                  <div className="flex min-w-0 gap-4">
                    <Link
                      href={`/accessories/${item.productSlug}`}
                      className={`h-20 w-20 shrink-0 rounded-xl bg-slate-50 p-2 ${outOfStock ? 'opacity-40 grayscale' : ''}`}
                    >
                      <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                    </Link>
                    <div className="min-w-0 self-center">
                      <Link
                        href={`/accessories/${item.productSlug}`}
                        className={`line-clamp-2 font-semibold text-slate-900 hover:text-brand-700 ${outOfStock ? 'opacity-40' : ''}`}
                      >
                        {item.name}
                      </Link>
                      <div className={outOfStock ? 'opacity-40' : ''}>
                        <p className="mt-1 text-xs text-slate-500">SKU: {item.sku}</p>
                        <ProductOptionSummary
                          options={item.selectedOptions}
                          className="mt-2"
                        />
                      </div>
                      {outOfStock && (
                        <p className="mt-2 text-sm font-semibold text-red-600" role="status">
                          Số lượng hàng đã hết
                        </p>
                      )}
                      <p className={`mt-2 font-bold text-brand-700 md:hidden ${outOfStock ? 'opacity-30' : ''}`}>{formatPrice(item.price)}</p>
                    </div>
                  </div>

                  <p className={`hidden font-medium text-slate-700 md:block ${outOfStock ? 'opacity-30' : ''}`}>{formatPrice(item.price)}</p>

                  <div className="col-start-2 mt-2 flex items-center md:col-auto md:mt-0 md:justify-center">
                    <div className={`inline-flex items-center rounded-lg border border-slate-200 ${outOfStock ? 'pointer-events-none opacity-25' : ''}`}>
                      <button
                        type="button"
                        aria-label={`Giảm số lượng ${item.name}`}
                        disabled={cartLoading || item.quantity <= 1}
                        onClick={() => void changeQuantity(item.id, item.quantity - 1)}
                        className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="min-w-10 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Tăng số lượng ${item.name}`}
                        disabled={cartLoading || item.quantity >= item.availableQuantity || item.quantity >= 99}
                        onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                        className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <p className={`col-start-2 mt-2 text-base font-bold text-brand-700 md:col-auto md:mt-0 md:text-right ${outOfStock ? 'opacity-30' : ''}`}>
                    <span className="mr-2 font-normal text-slate-500 md:hidden">Thành tiền:</span>
                    {formatPrice(item.price * item.quantity)}
                  </p>

                  <button
                    type="button"
                    aria-label={`Xóa ${item.name}`}
                    disabled={cartLoading}
                    onClick={() => requestRemove(item.id, item.name)}
                    className={`col-start-2 mt-2 inline-flex w-fit items-center gap-2 text-sm hover:text-red-700 disabled:opacity-40 md:col-auto md:mt-0 md:grid md:h-10 md:w-10 md:place-items-center ${outOfStock ? 'font-semibold text-red-600' : 'text-slate-400'}`}
                  >
                    <Trash2 size={18} />
                    <span className="md:sr-only">Xóa</span>
                  </button>
                </article>
                )
              })}
            </section>

            <section className="mt-6 flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm text-slate-500">
                  Đã chọn <span className="font-semibold text-slate-800">{selectedItems.length}</span> dòng ({selectedQuantity} sản phẩm)
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  Tổng thanh toán: <span className="ml-2 text-2xl font-bold text-brand-700">{formatPrice(selectedTotal)}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={selectedItems.length === 0 || cartLoading}
                onClick={proceedToCheckout}
                className="min-h-12 rounded-lg bg-brand-600 px-8 py-3.5 font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Thanh toán ({selectedItems.length})
              </button>
            </section>
          </>
        )}
      </div>

      <Footer />
    </main>
  )
}
