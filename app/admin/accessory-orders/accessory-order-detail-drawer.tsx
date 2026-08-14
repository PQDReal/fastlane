'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, LoaderCircle, Mail, MapPin, Package, Phone, ReceiptText, X } from 'lucide-react'

import { OrderCancellationAuditCard } from '@/components/admin/order-cancellation-audit'
import { AdminOrderStatusBadge } from '@/components/admin/order-status-badge'
import { ProductOptionSummary } from '@/components/product-option-summary'
import { Button } from '@/components/ui/button'
import {
  accessoryOrderStatusPresentation,
  refundStatusPresentation,
} from '@/lib/orders/admin-status-presentation'
import type { AdminAccessoryOrder } from './accessory-orders-client'

type AccessoryOrderDetailDrawerProps = {
  order: AdminAccessoryOrder | null
  isOpen: boolean
  statusHint?: string
  actions?: ReactNode
  detailLoading: boolean
  detailLoadError: string | null
  onRetry: () => void
  onClose: () => void
}

const money = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value)

const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value))

export function AccessoryOrderDetailDrawer({
  order,
  isOpen,
  statusHint,
  actions,
  detailLoading,
  detailLoadError,
  onRetry,
  onClose,
}: AccessoryOrderDetailDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const orderStatus = order
    ? accessoryOrderStatusPresentation(order.status, order.refundStatus, order.paymentAttemptStatus)
    : null
  const refundStatus = order ? refundStatusPresentation(order.refundStatus) : null

  useEffect(() => {
    if (!isOpen) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [isOpen, onClose])

  const address = order?.shippingAddress
    ? [
      order.shippingAddress.line1,
      order.shippingAddress.line2,
      order.shippingAddress.communeLevel.name,
      order.shippingAddress.province.name,
    ].filter(Boolean).join(', ')
    : 'Chưa cập nhật địa chỉ nhận hàng'
  return (
    <AnimatePresence>
      {isOpen && order && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessory-order-detail-title"
            initial={{ x: '100%', opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.9 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-slate-50 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
              <div className="min-w-0">
                <h2 id="accessory-order-detail-title" className="text-lg font-bold text-slate-900">Chi tiết đơn phụ kiện</h2>
                <p className="mt-1 truncate text-sm font-semibold text-brand-700" title={order.orderNumber}>{order.orderNumber}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 aria-hidden="true" size={14} />{dateTime(order.createdAt)}</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Đóng chi tiết đơn phụ kiện"
                className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {detailLoadError ? (
                <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                  <p className="font-semibold">Không thể tải chi tiết đơn phụ kiện</p>
                  <p className="mt-1 text-red-700">{detailLoadError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-4 border-red-200 bg-white text-red-700 hover:bg-red-100">
                    Thử tải lại
                  </Button>
                </section>
              ) : !order.detailsLoaded ? (
                <section aria-live="polite" className="flex min-h-40 items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  <LoaderCircle aria-hidden="true" size={18} className={detailLoading ? 'mr-2 animate-spin' : 'mr-2'} />
                  Đang tải chi tiết đơn phụ kiện...
                </section>
              ) : (
                <>
              <section className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trạng thái</p>
                  {orderStatus && <AdminOrderStatusBadge presentation={orderStatus} className="mt-2" />}
                  {statusHint && <p className="mt-1 text-xs text-slate-500">{statusHint}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tổng thanh toán</p>
                  <p className="mt-2 whitespace-nowrap text-lg font-bold text-brand-700">{money(order.totalAmount)}</p>
                </div>
              </section>

              {order.status === 'CANCELLED' && order.cancellation && <OrderCancellationAuditCard audit={order.cancellation} />}

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><MapPin aria-hidden="true" size={18} /></div>
                  <h3 className="font-semibold text-slate-800">Khách hàng và nhận hàng</h3>
                </div>
                <div className="space-y-2.5 text-sm text-slate-600">
                  <p className="flex items-start gap-2"><Mail aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-slate-400" /><span className="break-all">{order.customerEmail}</span></p>
                  {order.shippingAddress && <p className="font-semibold text-slate-900">{order.shippingAddress.recipientName}</p>}
                  {order.shippingAddress && <p className="flex items-center gap-2"><Phone aria-hidden="true" size={16} className="shrink-0 text-slate-400" />{order.shippingAddress.phoneNumber}</p>}
                  <p className="leading-6">{address}</p>
                  {order.note && <p className="border-t border-slate-100 pt-3"><span className="font-semibold text-slate-700">Ghi chú:</span> {order.note}</p>}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Package aria-hidden="true" size={18} /></div>
                  <h3 className="font-semibold text-slate-800">Sản phẩm</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {order.items.map((item) => <article key={item.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{item.product_name_snapshot}</p>
                        {item.variantName && item.variantName !== 'Mặc định' && <p className="mt-1 text-xs text-slate-500">Phiên bản: {item.variantName}</p>}
                        <ProductOptionSummary options={item.selectedOptions ?? []} className="mt-1" />
                        <p className="mt-1.5 text-xs text-slate-400">SKU: {item.sku || 'Không có'} · Số lượng: {item.quantity}</p>
                      </div>
                      <p className="shrink-0 whitespace-nowrap text-sm font-bold text-brand-700">{money(item.lineSubtotal ?? 0)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Đơn giá: {money(item.unitPrice ?? 0)}</p>
                  </article>)}
                  {order.items.length === 0 && <p className="py-3 text-sm text-slate-500">Không có dữ liệu sản phẩm.</p>}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ReceiptText aria-hidden="true" size={18} /></div>
                  <h3 className="font-semibold text-slate-800">Thanh toán</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Tạm tính</dt><dd className="whitespace-nowrap font-medium text-slate-800">{money(order.subtotal ?? order.totalAmount)}</dd></div>
                  {(order.discountAmount ?? 0) > 0 && <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Giảm giá</dt><dd className="whitespace-nowrap font-semibold text-emerald-700">-{money(order.discountAmount ?? 0)}</dd></div>}
                  <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3"><dt className="font-semibold text-slate-700">Tổng thanh toán</dt><dd className="whitespace-nowrap text-base font-bold text-brand-700">{money(order.totalAmount)}</dd></div>
                  <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">Hoàn tiền</dt><dd>{refundStatus && <AdminOrderStatusBadge presentation={refundStatus} />}</dd></div>
                </dl>
              </section>
                </>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="whitespace-nowrap">Đóng</Button>
              {actions}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
