'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@auth0/nextjs-auth0/client'
import { ArrowLeft, Check, ChevronDown, Loader2, LockKeyhole, MapPin, ShoppingBag, Star } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { CheckoutAddressModal, type CheckoutSavedAddress } from '@/components/checkout-address-modal'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { ProductOptionSummary } from '@/components/product-option-summary'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
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
  maxDiscountAmount: number | null
  discountAmount: number
  subtotal: number
  grandTotal: number
  isBest?: boolean
}

type SavedAddress = {
  id: string
  label: string
  recipientName: string
  addressLine: string
  ward: string | null
  province: string
  phoneNumber: string
  note: string | null
  isDefault: boolean
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
    syncCartOwner,
    loadCart,
    clearCartCache,
  } = useAppStore()
  const userSubject = typeof user?.sub === 'string' ? user.sub : null
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [promotionCode, setPromotionCode] = useState('')
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionQuote | null>(null)
  const [promotionError, setPromotionError] = useState<string | null>(null)
  const [applyingPromotion, setApplyingPromotion] = useState(false)
  const [availablePromotions, setAvailablePromotions] = useState<PromotionQuote[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(false)
  const [promotionListOpen, setPromotionListOpen] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [addressesLoading, setAddressesLoading] = useState(false)
  const [addressesError, setAddressesError] = useState<string | null>(null)
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [addressListOpen, setAddressListOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
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
    if (!userSubject) return

    const ownerChanged = syncCartOwner(userSubject)
    if (ownerChanged || !cartLoaded) void loadCart(userSubject)
  }, [cartLoaded, loadCart, syncCartOwner, userSubject])

  useEffect(() => {
    if (!user) return

    const controller = new AbortController()
    setAddressesLoading(true)
    setAddressesError(null)

    Promise.all([
      fetch('/api/v1/users/me/addresses', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }),
      fetch('/api/v1/users/me', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }),
    ])
      .then(async ([addressesResponse, profileResponse]) => {
        const addressesPayload = await addressesResponse.json().catch(() => ({}))
        const profilePayload = await profileResponse.json().catch(() => ({}))
        if (!addressesResponse.ok) {
          throw new Error(
            addressesPayload?.error?.message || 'Không thể tải địa chỉ đã lưu.',
          )
        }

        const addresses = (addressesPayload.data ?? []) as SavedAddress[]
        setSavedAddresses(addresses)
        setSelectedAddressId(
          addresses.find((address) => address.isDefault)?.id ??
            addresses[0]?.id ??
            '',
        )
        setRecipientName(
          (profileResponse.ok ? profilePayload?.data?.fullName : '') ||
            user.name ||
            '',
        )
        setProfilePhone(
          profileResponse.ok ? profilePayload?.data?.phoneNumber || '' : '',
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setSavedAddresses([])
        setSelectedAddressId('')
        setRecipientName(user.name || '')
        setAddressesError(
          error instanceof Error
            ? error.message
            : 'Không thể tải địa chỉ đã lưu.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setAddressesLoading(false)
      })

    return () => controller.abort()
  }, [user])

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
  const selectedAddress =
    savedAddresses.find((address) => address.id === selectedAddressId) ?? null
  const promotionOptions = useMemo(() => {
    if (!appliedPromotion || availablePromotions.some((item) => item.promotionId === appliedPromotion.promotionId)) {
      return availablePromotions
    }
    return [appliedPromotion, ...availablePromotions]
  }, [appliedPromotion, availablePromotions])
  const selectedPromotion = promotionOptions.find((item) =>
    item.promotionId === appliedPromotion?.promotionId,
  ) ?? promotionOptions[0] ?? null
  const visiblePromotions = promotionListOpen
    ? promotionOptions
    : selectedPromotion ? [selectedPromotion] : []
  const showToast = (
    kind: ToastMessage['kind'],
    title: string,
    message?: string,
  ) => {
    const id = Date.now()
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      4500,
    )
  }

  const handleAddressSaved = (saved: CheckoutSavedAddress) => {
    setSavedAddresses((current) => [
      saved,
      ...current.map((address) => ({
        ...address,
        isDefault: saved.isDefault ? false : address.isDefault,
      })),
    ])
    setSelectedAddressId(saved.id)
    setAddressesError(null)
    setAddressModalOpen(false)
    showToast('success', 'Đã thêm địa chỉ nhận hàng')
  }

  useEffect(() => {
    setPromotionListOpen(false)
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
        setAppliedPromotion(promotions[0] ?? null)
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

  const handleApplyPromotion = async (
    selectedCode: string,
    source: 'manual' | 'suggested' = 'manual',
  ) => {
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
      setPromotionListOpen(false)
      setAppliedPromotion({
        ...(payload.data as PromotionQuote),
        isBest: source === 'suggested'
          ? availablePromotions.find((promotion) => promotion.code === code)?.isBest
          : false,
      })
    } catch (error) {
      setPromotionError(error instanceof Error ? error.message : 'Không thể áp dụng mã giảm giá.')
    } finally {
      setApplyingPromotion(false)
    }
  }
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      submitting ||
      !selectionIsValid ||
      !selectedAddress ||
      !selectedAddress.ward ||
      !selectedAddress.recipientName.trim()
    ) return

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
          recipientName: selectedAddress.recipientName.trim(),
          phoneNumber: selectedAddress.phoneNumber,
          line1: selectedAddress.addressLine,
          communeLevel: { name: selectedAddress.ward, type: 'WARD' },
          province: { name: selectedAddress.province },
          countryCode: 'VN',
        },
        ...(selectedAddress.note?.trim() ? { note: selectedAddress.note.trim() } : {}),
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
        if (userSubject) await loadCart(userSubject)
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
          <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7 lg:order-2 lg:sticky lg:top-28 lg:self-start">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Địa chỉ nhận hàng</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Địa chỉ mặc định được chọn tự động. Bạn có thể chọn địa chỉ khác.
                  </p>
                </div>
                <Link
                  href="/profile?tab=addresses"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#836100] hover:text-[#836100] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]"
                >
                  Quản lý địa chỉ
                </Link>
              </div>

              {addressesLoading ? (
                <div className="mt-6 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải địa chỉ đã lưu...
                </div>
              ) : addressesError ? (
                <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {addressesError}
                </div>
              ) : savedAddresses.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                  <MapPin className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 font-semibold text-slate-800">Bạn chưa có địa chỉ nhận hàng</p>
                  <p className="mt-1 text-sm text-slate-500">Hãy thêm địa chỉ trong trang hồ sơ trước khi thanh toán.</p>
                  <button type="button" onClick={() => setAddressModalOpen(true)} className="mt-4 inline-flex rounded-full bg-[#836100] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6a4e00] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]">
                    Thêm địa chỉ
                  </button>
                </div>
              ) : (
                <div role="radiogroup" aria-label="Địa chỉ nhận hàng đã lưu" className="mt-6 -mr-3 max-h-[430px] space-y-3 overflow-y-auto pr-3 [scrollbar-gutter:stable]">
                  <AnimatePresence initial={false}>
                    {(addressListOpen ? savedAddresses : selectedAddress ? [selectedAddress] : savedAddresses.slice(0, 1)).map((address) => {
                    const selected = address.id === selectedAddressId
                    return (
                      <motion.button
                        key={address.id}
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-expanded={selected ? addressListOpen : undefined}
                        onClick={() => {
                          if (!addressListOpen) {
                            setAddressListOpen(true)
                            return
                          }
                          setSelectedAddressId(address.id)
                          setAddressListOpen(false)
                          setSubmitError(null)
                        }}
                        className={`w-full overflow-hidden rounded-2xl border p-5 text-left transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] ${
                          selected
                            ? 'border-[#836100] bg-[#836100]/5 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            selected ? 'border-[#836100] bg-[#836100] text-white' : 'border-slate-300 text-transparent'
                          }`}>
                            <Check className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900">{address.label}</span>
                              {address.isDefault && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                  <Star className="h-3 w-3 fill-current" />
                                  Mặc định
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-800">
                              {address.recipientName} · {address.phoneNumber}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {[address.addressLine, address.ward, address.province].filter(Boolean).join(', ')}
                            </p>
                            {address.note && (
                              <p className="mt-2 text-xs text-slate-500">Ghi chú: {address.note}</p>
                            )}
                            {!address.ward && (
                              <p className="mt-2 text-xs font-medium text-red-600">
                                Địa chỉ này thiếu phường/xã. Vui lòng cập nhật trước khi đặt hàng.
                              </p>
                            )}
                            {!addressListOpen && savedAddresses.length > 1 && (
                              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#836100]">
                                Chọn địa chỉ khác
                                <motion.span animate={{ rotate: addressListOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                                  <ChevronDown className="h-4 w-4" />
                                </motion.span>
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </section>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:order-1">
              <h2 className="text-xl font-bold text-slate-900">Đơn hàng</h2>
              <ul className="mt-6 max-h-80 space-y-5 overflow-y-auto pr-1">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="h-16 w-16 shrink-0 rounded-xl bg-slate-50 p-2">
                      <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</p>
                      <ProductOptionSummary
                        options={item.selectedOptions}
                        className="mt-1.5"
                      />
                      <p className="mt-1 text-xs text-slate-500">{item.quantity} × {formatPrice(item.price)}</p>
                    </div>
                    <p className="text-sm font-bold text-[#836100]">{formatPrice(item.price * item.quantity)}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Chọn mã giảm giá</p>
                  {appliedPromotion?.isBest && (
                    <span className="text-xs font-semibold text-emerald-700">Đã chọn voucher tốt nhất</span>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <label htmlFor="promotion-code" className="sr-only">Mã giảm giá</label>
                  <input
                    id="promotion-code"
                    type="text"
                    value={promotionCode}
                    onChange={(event) => {
                      setPromotionCode(event.target.value.toUpperCase())
                      setPromotionListOpen(false)
                      setAppliedPromotion(null)
                      setPromotionError(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      void handleApplyPromotion(promotionCode)
                    }}
                    placeholder="Nhập mã giảm giá"
                    autoComplete="off"
                    aria-invalid={Boolean(promotionError)}
                    aria-describedby={promotionError ? 'promotion-code-error' : undefined}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold uppercase outline-none transition placeholder:font-normal placeholder:normal-case focus:border-[#836100] focus:ring-2 focus:ring-[#836100]/15"
                  />
                  <button
                    type="button"
                    disabled={applyingPromotion || promotionsLoading || !promotionCode.trim()}
                    onClick={() => void handleApplyPromotion(promotionCode)}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#836100] px-4 text-sm font-bold text-white transition hover:bg-[#6a4e00] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {applyingPromotion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Áp dụng
                  </button>
                </div>
                {promotionsLoading ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tìm mã phù hợp...
                  </div>
                ) : promotionOptions.length > 0 ? (
                  <div role="radiogroup" aria-label="Danh sách mã giảm giá" className="mt-3 space-y-2">
                    <AnimatePresence initial={false}>
                    {visiblePromotions.map((promotion) => {
                      const selected = promotionCode === promotion.code
                      const applied = appliedPromotion?.promotionId === promotion.promotionId
                      return (
                        <motion.button
                          key={promotion.promotionId}
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: 116, y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={applyingPromotion}
                          aria-expanded={selected ? promotionListOpen : undefined}
                          onClick={() => {
                            if (!promotionListOpen && promotionOptions.length > 1) {
                              setPromotionListOpen(true)
                              return
                            }
                            setPromotionCode(promotion.code)
                            void handleApplyPromotion(promotion.code, 'suggested')
                          }}
                          className={`group relative flex h-[116px] w-full overflow-hidden rounded-r-2xl border border-l-0 bg-white text-left shadow-sm transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] disabled:cursor-wait disabled:opacity-70 ${selected ? 'border-[#836100]' : 'border-slate-200 hover:border-[#836100]/50'}`}
                        >
                          <div className="relative flex w-[31%] min-w-[112px] max-w-[180px] shrink-0 items-center justify-center overflow-hidden sm:w-[26%]">
                            <img src="/images/promotion-tag.png" alt="" className="absolute inset-0 h-full w-full object-fill" />
                            {promotion.isBest && (
                              <span className="absolute right-0 top-2 rounded-l-full bg-amber-100 py-1 pl-3 pr-2 text-[9px] font-black uppercase tracking-wide text-amber-900 shadow-sm">Tốt nhất</span>
                            )}
                            <span className="relative block w-full truncate whitespace-nowrap pl-4 pr-2 text-center text-[11px] font-black tracking-normal text-white drop-shadow-sm sm:text-xs">{promotion.code}</span>
                          </div>
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2 sm:px-5">
                            <div className="min-w-0">
                              <p className="text-xl font-black leading-none text-[rgb(255_190_39)] sm:text-2xl">
                                Giảm {promotion.type === 'PERCENT' ? `${promotion.value}%` : formatPrice(promotion.value)}
                              </p>
                              <p className="mt-1.5 line-clamp-2 min-h-8 text-sm font-medium leading-4 text-slate-900 sm:text-base">{promotion.name}</p>
                              <p className="mt-1.5 text-xs font-medium text-emerald-700 sm:text-sm">
                                Giảm tối đa: {promotion.maxDiscountAmount === null ? 'Không giới hạn' : formatPrice(promotion.maxDiscountAmount)}
                              </p>
                            </div>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center self-center">
                              {applyingPromotion && selected ? (
                                <Loader2 className="h-5 w-5 animate-spin text-[#836100]" />
                              ) : applied ? (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#967000] text-white shadow-sm">
                                  <Check className="h-5 w-5" strokeWidth={3} />
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </motion.button>
                      )
                    })}
                    </AnimatePresence>
                    {promotionOptions.length > 1 && (
                      <button type="button" onClick={() => setPromotionListOpen((open) => !open)} className="inline-flex items-center gap-1.5 px-1 pt-1 text-xs font-bold text-[#836100]">
                        {promotionListOpen ? 'Thu gọn mã giảm giá' : 'Xem thêm mã giảm giá'}
                        <motion.span animate={{ rotate: promotionListOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                          <ChevronDown className="h-4 w-4" />
                        </motion.span>
                      </button>
                    )}
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

              <button type="submit" disabled={submitting || cartLoading || addressesLoading || !selectedAddress || !selectedAddress.ward || !selectedAddress.recipientName.trim()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#836100] px-6 py-4 font-bold text-white transition-colors hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                {submitting ? 'Đang tạo đơn...' : 'Xác nhận thanh toán'}
              </button>
            </aside>
          </form>
        )}
      </div>
      <Footer />
      <AnimatePresence>
        {addressModalOpen && (
          <CheckoutAddressModal
            initialName={recipientName}
            initialPhone={profilePhone}
            onClose={() => setAddressModalOpen(false)}
            onSaved={handleAddressSaved}
            onError={(message) =>
              showToast('error', 'Không thể thêm địa chỉ', message)
            }
          />
        )}
      </AnimatePresence>
      <ToastViewport
        toasts={toasts}
        onClose={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
    </main>
  )
}
