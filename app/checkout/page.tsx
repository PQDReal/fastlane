'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { ArrowLeft, Loader2, LockKeyhole, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import type { AccessoryOrder } from '@/lib/cart/types'
import { useAppStore } from '@/lib/store'

type CheckoutFailure = {
  error?: { code?: string; message?: string }
}

type PromotionQuote = {
  promotionId: string
  code: string

  name: string
  description: string | null
  type: 'PERCENT' | 'FIXED'
  value: number
  discountAmount: number
  subtotal: number
  grandTotal: number
  isBest?: boolean
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

export default function CheckoutPage() {
  const router = useRouter()
  const { user, isLoading: userLoading } = useUser()
  const {
    cartItems,
    cartVersion,
    cartLoading,
    cartLoaded,
    cartError,
    loadCart,
    clearCartCache,
  } = useAppStore()
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [promotionCode, setPromotionCode] = useState('')
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionQuote | null>(null)
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [applyingPromotion, setApplyingPromotion] = useState(false)
  const [availablePromotions, setAvailablePromotions] = useState<PromotionQuote[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [line1, setLine1] = useState('')
  const [ward, setWard] = useState('')
  const [province, setProvince] = useState('')
  const [note, setNote] = useState('')
  const idempotencyKey = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSelectedCartItemIds([...new Set(params.getAll('item'))])
  }, [])

  useEffect(() => {
    if (!userLoading && !user) {
      window.location.assign(
        `/auth/login?returnTo=${encodeURIComponent('/checkout')}`,
      )
    }
  }, [user, userLoading])

  useEffect(() => {
    if (user && !cartLoaded) void loadCart()
  }, [cartLoaded, loadCart, user])

  useEffect(() => {
    if (user?.name && !recipientName) setRecipientName(user.name)
  }, [recipientName, user?.name])

  const selectedItems = useMemo(() => {
    if (!selectedCartItemIds) return []
    const selected = new Set(selectedCartItemIds)
    return cartItems.filter((item) => selected.has(item.id))
  }, [cartItems, selectedCartItemIds])
  const selectionIsValid =
    selectedCartItemIds !== null &&
    selectedCartItemIds.length > 0 &&
    selectedItems.length === selectedCartItemIds.length
  const selectedTotal = selectedItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  )
  const grandTotal = appliedPromotion?.grandTotal ?? selectedTotal

  useEffect(() => {
    setAppliedPromotion(null)
    setPromotionError(null)
    if (!selectionIsValid || !selectedCartItemIds) {
      setAvailablePromotions([])
      setPromotionCode('')
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams()
    selectedCartItemIds.forEach((id) => params.append('item', id))
    setPromotionsLoading(true)
    fetch(`/api/v1/cart/promotion?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải mã giảm giá.')
        const promotions = (payload.data ?? []) as PromotionQuote[]
        setAvailablePromotions(promotions)
        setPromotionCode(promotions[0]?.code ?? '')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setAvailablePromotions([])
        setPromotionCode('')
        setPromotionError(error instanceof Error ? error.message : 'Không thể tải mã giảm giá.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setPromotionsLoading(false)
      })

    return () => controller.abort()
  }, [selectedTotal, selectedCartItemIds, selectionIsValid])

  const handleApplyPromotion = async (selectedCode: string) => {
    const code = selectedCode.trim().toUpperCase()
    if (!code || applyingPromotion || !selectionIsValid) return

    setApplyingPromotion(true)
    setPromotionError(null)
    setAppliedPromotion(null)
    try {
      const response = await fetch('/api/v1/cart/promotion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, cartItemIds: selectedCartItemIds }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error?.message || 'Không thể áp dụng mã giảm giá.')
      }
      setPromotionCode(payload.data.code)
      setAppliedPromotion(payload.data as PromotionQuote)
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : 'Không thể áp dụng mã giảm giá.')
    } finally {
      setApplyingPromotion(false)
    }
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || !selectionIsValid) return

    setSubmitting(true)
    setSubmitError(null)
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID()

    const total = String(Math.round(grandTotal))
    const response = await fetch('/api/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey.current,
      },
      body: JSON.stringify({
        cartItemIds: selectedCartItemIds,
        expectedCartVersion: cartVersion,
        acceptedGrandTotal: total,
        acceptedAmountDueNow: total,
        ...(appliedPromotion ? { promotionCode: appliedPromotion.code } : {}),
        shippingAddress: {
          recipientName,
          phoneNumber,
          line1,
          communeLevel: { name: ward, type: 'WARD' },
          province: { name: province },
          countryCode: 'VN',
        },
        ...(note.trim() ? { note } : {}),
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as
      | { data: AccessoryOrder }
      | CheckoutFailure

    if (!response.ok) {
      const failure = payload as CheckoutFailure
      const code = failure.error?.code || 'CHECKOUT_FAILED'
      if (code === 'PROMOTION_NOT_APPLICABLE') {
        setAppliedPromotion(null)
        setPromotionError(failure.error?.message || 'Mã giảm giá không còn hợp lệ.')
      }
      setSubmitError(
        failure.error?.message || 'Không thể hoàn tất đơn hàng.',
      )
      if (['CART_CHANGED', 'PRICE_CHANGED', 'OUT_OF_STOCK'].includes(code)) {
        idempotencyKey.current = null
        await loadCart()
      }
      setSubmitting(false)
      return
    }

    const order = (payload as { data: AccessoryOrder }).data
    clearCartCache()
    router.push(`/checkout/success?orderId=${encodeURIComponent(order.id)}`)
  }

  if (
    userLoading ||
    selectedCartItemIds === null ||
    (user && !cartLoaded && cartLoading)
  ) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#836100]" />
      </main>
    )
  }

  if (!user) return null

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col pt-[74px]">
      <Header />
      <div className="flex-1 mx-auto w-full max-w-6xl px-5 py-12 lg:px-8">
        <Link href="/cart" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#836100]">
          <ArrowLeft size={16} /> Quay lại giỏ hàng
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900">Thanh toán đơn phụ kiện</h1>
          <p className="mt-2 text-slate-500">Giá và tồn kho sẽ được hệ thống kiểm tra lại khi đặt hàng.</p>
        </div>

        {cartItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <ShoppingBag className="mx-auto h-12 w-12 text-slate-300" />
            <h2 className="mt-5 text-xl font-bold text-slate-900">Giỏ hàng đang trống</h2>
            <p className="mt-2 text-sm text-slate-500">Hãy chọn ít nhất một phụ kiện trước khi thanh toán.</p>
            <Link href="/cart" className="mt-6 inline-flex rounded-full bg-[#836100] px-6 py-3 font-semibold text-white hover:bg-[#6a4e00]">
              Quay lại giỏ hàng
            </Link>
          </div>
        ) : !selectionIsValid ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center shadow-sm">
            <ShoppingBag className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-5 text-xl font-bold text-slate-900">Chưa có sản phẩm hợp lệ để thanh toán</h2>
            <p className="mt-2 text-sm text-slate-600">Hãy quay lại giỏ hàng và chọn ít nhất một sản phẩm. Giỏ hàng có thể đã thay đổi ở một phiên khác.</p>
            <Link href="/cart" className="mt-6 inline-flex rounded-full bg-[#836100] px-6 py-3 font-semibold text-white hover:bg-[#6a4e00]">
              Chọn lại sản phẩm
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1fr_420px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold text-slate-900">Thông tin nhận hàng</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                  Họ và tên
                  <input required maxLength={120} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
                <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                  Số điện thoại
                  <input required inputMode="tel" pattern="\+?[0-9]{9,15}" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="0901234567" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
                <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                  Địa chỉ
                  <input required maxLength={255} value={line1} onChange={(event) => setLine1(event.target.value)} placeholder="Số nhà, tên đường" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Phường/Xã
                  <input required maxLength={120} value={ward} onChange={(event) => setWard(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Tỉnh/Thành phố
                  <input required maxLength={120} value={province} onChange={(event) => setProvince(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
                <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                  Ghi chú (không bắt buộc)
                  <textarea maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#836100]" />
                </label>
              </div>
            </section>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
              <h2 className="text-xl font-bold text-slate-900">Đơn hàng</h2>
              <ul className="mt-6 max-h-80 space-y-5 overflow-y-auto pr-1">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-50 p-2">
                      <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatPrice(item.price)}</p>
                    </div>
                    <p className="text-sm font-bold text-[#836100]">{formatPrice(item.price * item.quantity)}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Chọn mã giảm giá</p>
                  {availablePromotions[0]?.isBest && (
                    <span className="text-xs font-semibold text-emerald-700">Đã xếp theo mức giảm tốt nhất</span>
                  )}
                </div>

                {promotionsLoading ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm mã phù hợp...
                  </div>
                ) : availablePromotions.length > 0 ? (
                  <div role="radiogroup" aria-label="Danh sách mã giảm giá" className="mt-3 space-y-2">
                    {availablePromotions.map((promotion) => {
                      const selected = promotionCode === promotion.code
                      return (
                        <button
                          key={promotion.promotionId}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={applyingPromotion}
                          onClick={() => {
                            setPromotionCode(promotion.code)
                            void handleApplyPromotion(promotion.code)
                          }}
                          className={`w-full rounded-xl border p-4 text-left transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] disabled:cursor-wait disabled:opacity-70 ${selected ? 'border-[#836100] bg-[#836100]/5' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900">{promotion.code}</span>
                                {promotion.isBest && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Tốt nhất</span>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-slate-600">{promotion.name}</p>
                              {promotion.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{promotion.description}</p>}
                            </div>
                            <span className="flex shrink-0 items-center gap-2 text-sm font-bold text-emerald-700">
                              {applyingPromotion && selected && <Loader2 className="h-4 w-4 animate-spin" />}
                              −{formatPrice(promotion.discountAmount)}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    Chưa có mã giảm giá phù hợp với đơn hàng này.
                  </p>
                )}

                {promotionError && (
                  <p id="promotion-code-error" role="alert" className="mt-2 text-sm text-red-600">
                    {promotionError}
                  </p>
                )}
                {appliedPromotion && (
                  <p className="mt-2 text-sm font-medium text-emerald-700">
                    Đã áp dụng mã {appliedPromotion.code}.
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Tạm tính</span>
                  <span className="font-semibold text-slate-800">{formatPrice(selectedTotal)}</span>
                </div>
                {appliedPromotion && (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-emerald-700">Giảm giá</span>
                    <span className="font-semibold text-emerald-700">−{formatPrice(appliedPromotion.discountAmount)}</span>
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="font-semibold text-slate-700">Tổng cộng</span>
                  <span className="text-xl font-bold text-[#836100]">{formatPrice(grandTotal)}</span>
                </div>
                {/* <p className="mt-2 text-xs text-slate-500">Đã bao gồm giá bán hiện tại; hệ thống sẽ reprice trước khi tạo đơn.</p> */}
              </div>

              {(submitError || cartError) && (
                <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError || cartError}
                </div>
              )}

              <button type="submit" disabled={submitting || cartLoading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#836100] px-6 py-4 font-bold text-white transition-colors hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                {submitting ? 'Đang tạo đơn...' : 'Thanh toán'}
              </button>
            </aside>
          </form>
        )}
      </div>
      <Footer />
    </main>
  )
}
