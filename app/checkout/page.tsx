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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || !selectionIsValid) return

    setSubmitting(true)
    setSubmitError(null)
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID()

    const total = String(Math.round(selectedTotal))
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
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Tổng cộng</span>
                  <span className="text-xl font-bold text-[#836100]">{formatPrice(selectedTotal)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Đã bao gồm giá bán hiện tại; hệ thống sẽ reprice trước khi tạo đơn.</p>
              </div>

              {(submitError || cartError) && (
                <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError || cartError}
                </div>
              )}

              <button type="submit" disabled={submitting || cartLoading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#836100] px-6 py-4 font-bold text-white transition-colors hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                {submitting ? 'Đang tạo đơn...' : 'Xác nhận đặt hàng'}
              </button>
            </aside>
          </form>
        )}
      </div>
      <Footer />
    </main>
  )
}
