'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, RotateCcw, Search, ShoppingBag, Truck, XCircle } from 'lucide-react'
import { AdminOrderStatusBadge } from '@/components/admin/order-status-badge'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type { SelectedProductOption, ShippingAddress } from '@/lib/cart/types'
import type { OrderCancellationAudit } from '@/lib/orders/cancellation-audit'
import {
  accessoryOrderStatusPresentation,
  type AccessoryAdminOrderStatus,
  type AdminOrderRefundStatus,
} from '@/lib/orders/admin-status-presentation'
import { AccessoryOrderDetailDrawer } from './accessory-order-detail-drawer'

export type AdminAccessoryOrder = {
  id: string; orderNumber: string; customerEmail: string
  items: {
    id: string
    sku: string
    product_name_snapshot: string
    variantName: string
    selectedOptions: SelectedProductOption[]
    unitPrice: number
    quantity: number
    lineSubtotal: number
  }[]
  subtotal: number
  discountAmount: number
  totalAmount: number
  shippingAddress: ShippingAddress | null
  note: string | null
  cancellation: OrderCancellationAudit | null
  status: AccessoryAdminOrderStatus
  refundStatus: AdminOrderRefundStatus
  refundAttemptStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null
  refundNextCheckAt: string | null
  createdAt: string
}

const statusLabel: Record<AdminAccessoryOrder['status'], string> = {
  PENDING: 'Chưa thanh toán', PAID: 'Đã thanh toán', CONFIRMED: 'Đã xác nhận',
  READY: 'Đang giao hàng', DELIVERED: 'Hoàn thành', CANCELLED: 'Đã hủy',
}
const statusHint: Partial<Record<AdminAccessoryOrder['status'], string>> = {
  CONFIRMED: 'Chờ lấy hàng',
}
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export function AccessoryOrdersClient({ initialOrders, loadError }: { initialOrders: AdminAccessoryOrder[]; loadError: string | null }) {
  const [orders, setOrders] = useState(initialOrders)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | AdminAccessoryOrder['status']>('ALL')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const busyRef = useRef<string | null>(null)
  const pollCursorRef = useRef(0)
  const [toasts, setToasts] = useState<ToastMessage[]>(loadError ? [{ id: 1, kind: 'error', title: 'Tải đơn hàng thất bại', message: loadError }] : [])
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi')
    return orders.filter((order) => (status === 'ALL' || order.status === status) && (!normalized || [order.orderNumber, order.customerEmail, ...order.items.map((item) => item.product_name_snapshot)].some((value) => value.toLocaleLowerCase('vi').includes(normalized))))
  }, [orders, query, status])
  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId])
  const closeOrderDetail = useCallback(() => setSelectedOrderId(null), [])
  const notify = (toast: Omit<ToastMessage, 'id'>) => setToasts((current) => [...current, { id: Date.now(), ...toast }])

  async function confirmOrder(order: AdminAccessoryOrder) {
    if (busyRef.current) return
    busyRef.current = order.id
    setBusy(order.id)
    try {
      const response = await fetch(`/api/v1/admin/orders/${order.id}/confirm`, { method: 'POST' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error?.message ?? body?.error ?? 'Không thể xác nhận đơn hàng.')
      }
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: 'CONFIRMED' } : item))
      notify({ kind: 'success', title: 'Đã xác nhận đơn phụ kiện', message: order.orderNumber })
    } catch (error) {
      notify({ kind: 'error', title: 'Xác nhận đơn hàng thất bại', message: error instanceof Error ? error.message : undefined })
    } finally { busyRef.current = null; setBusy(null) }
  }

  async function runAction(order: AdminAccessoryOrder, action: 'cancel' | 'ship' | 'complete' | 'refund' | 'refund-status', silent = false) {
    if (busyRef.current) return
    busyRef.current = order.id
    setBusy(order.id)
    try {
      const response = await fetch(`/api/v1/admin/orders/${order.id}/actions/${action}`, { method: 'POST' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message ?? 'Không thể cập nhật đơn hàng.')
      setOrders((current) => current.map((item) => item.id !== order.id ? item : {
        ...item,
        status: body.data.status ?? item.status,
        refundStatus: body.data.refundStatus ?? item.refundStatus,
        refundAttemptStatus: body.data.attemptStatus ?? item.refundAttemptStatus,
        refundNextCheckAt: body.data.nextCheckAt === undefined ? item.refundNextCheckAt : body.data.nextCheckAt,
        cancellation: action === 'cancel'
          ? body.data.cancellation ?? item.cancellation
          : item.cancellation,
      }))
      const title = action === 'cancel' ? 'Đã hủy đơn phụ kiện' : action === 'ship' ? 'Đơn hàng đang được giao' : action === 'complete' ? 'Đã hoàn thành đơn phụ kiện' : body.data.attemptStatus === 'COMPLETED' ? 'Hoàn tiền thành công' : body.data.attemptStatus === 'FAILED' ? 'Hoàn tiền thất bại' : 'VNPay đang xử lý hoàn tiền'
      if (!silent || body.data.attemptStatus === 'COMPLETED' || body.data.attemptStatus === 'FAILED') {
        notify({ kind: body.data.attemptStatus === 'FAILED' ? 'error' : 'success', title, message: order.orderNumber })
      }
    } catch (error) {
      if (!silent) notify({ kind: 'error', title: 'Cập nhật đơn hàng thất bại', message: error instanceof Error ? error.message : undefined })
    } finally { busyRef.current = null; setBusy(null) }
  }

  useEffect(() => {
    const processingOrders = orders.filter((order) => order.status === 'CANCELLED'
      && order.refundStatus === 'PENDING'
      && ['PENDING', 'PROCESSING'].includes(order.refundAttemptStatus ?? ''))
    if (!processingOrders.length) return
    const now = Date.now()
    const eligibleOrders = processingOrders.filter((order) => !order.refundNextCheckAt || new Date(order.refundNextCheckAt).getTime() <= now)
    const processingOrder = eligibleOrders.length
      ? eligibleOrders[pollCursorRef.current % eligibleOrders.length]
      : [...processingOrders].sort((a, b) => new Date(a.refundNextCheckAt ?? 0).getTime() - new Date(b.refundNextCheckAt ?? 0).getTime())[0]
    const eligibleTime = new Date(processingOrder.refundNextCheckAt ?? 0).getTime()
    const delay = eligibleOrders.length ? 500 : Math.max(1_000, eligibleTime - now)
    const timer = window.setTimeout(() => {
      if (!busyRef.current) {
        pollCursorRef.current += 1
        void runAction(processingOrder, 'refund-status', true)
      }
    }, delay)
    return () => window.clearTimeout(timer)
  }, [orders, busy])

  function requestCancellation(order: AdminAccessoryOrder) {
    const toastId = Date.now()
    setToasts((current) => [...current, {
      id: toastId,
      kind: 'warning',
      title: 'Hủy đơn phụ kiện?',
      message: `${order.orderNumber} sẽ bị hủy${order.status !== 'PENDING' ? ' và chuyển sang chờ hoàn tiền' : ''}.`,
      secondaryAction: { label: 'Giữ đơn', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== toastId)) },
      action: { label: 'Hủy đơn hàng', variant: 'danger', onClick: () => { setToasts((current) => current.filter((toast) => toast.id !== toastId)); void runAction(order, 'cancel') } },
    }])
  }

  function requestRefund(order: AdminAccessoryOrder) {
    const toastId = Date.now()
    setToasts((current) => [...current, {
      id: toastId,
      kind: 'warning',
      title: 'Hoàn tiền qua VNPay?',
      message: `Hoàn toàn bộ ${money(order.totalAmount)} cho đơn ${order.orderNumber}. Thao tác có thể không thể thu hồi.`,
      secondaryAction: { label: 'Để sau', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== toastId)) },
      action: { label: 'Gửi yêu cầu hoàn tiền', variant: 'danger', onClick: () => { setToasts((current) => current.filter((toast) => toast.id !== toastId)); void runAction(order, 'refund') } },
    }])
  }

  function orderActions(order: AdminAccessoryOrder) {
    if (order.status === 'PENDING') return <Button variant="outline" size="sm" onClick={() => requestCancellation(order)} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap border-red-200 text-red-700 hover:bg-red-50"><XCircle size={15} />Hủy đơn hàng</Button>
    if (order.status === 'PAID') return <><Button size="sm" onClick={() => confirmOrder(order)} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap"><CheckCircle2 size={15} />{busy === order.id ? 'Đang xử lý...' : 'Xác nhận'}</Button><Button variant="outline" size="sm" onClick={() => requestCancellation(order)} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap border-red-200 text-red-700 hover:bg-red-50"><XCircle size={15} />Hủy đơn hàng</Button></>
    if (order.status === 'CONFIRMED') return <><Button size="sm" onClick={() => runAction(order, 'ship')} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap"><Truck size={15} />Giao hàng</Button><Button variant="outline" size="sm" onClick={() => requestCancellation(order)} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap border-red-200 text-red-700 hover:bg-red-50"><XCircle size={15} />Hủy đơn hàng</Button></>
    if (order.status === 'READY') return <Button size="sm" onClick={() => runAction(order, 'complete')} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap"><CheckCircle2 size={15} />Đã giao hàng</Button>
    if (order.status === 'CANCELLED' && order.refundStatus === 'PENDING' && ['PENDING', 'PROCESSING'].includes(order.refundAttemptStatus ?? '')) return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600"><RotateCcw size={15} className="animate-spin" />Đang tự động kiểm tra</span>
    if (order.status === 'CANCELLED' && order.refundStatus === 'PENDING') return <Button size="sm" onClick={() => requestRefund(order)} disabled={busy === order.id} className="shrink-0 gap-1.5 whitespace-nowrap"><RotateCcw size={15} />{order.refundAttemptStatus === 'FAILED' ? 'Thử hoàn tiền lại' : 'Hoàn tiền'}</Button>
    if (order.status === 'CANCELLED') return <span className="text-xs font-medium text-slate-400">Đã hủy</span>
    return null
  }

  return <div className="space-y-6">
    <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Đơn phụ kiện</h1><p className="mt-1 text-sm text-slate-500">Dữ liệu đơn mua phụ kiện được tải trực tiếp từ database.</p></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã đơn, email hoặc sản phẩm..." className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" /></div>
        <select aria-label="Lọc đơn phụ kiện theo trạng thái" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-500 sm:w-auto"><option value="ALL">Tất cả trạng thái</option>{Object.entries(statusLabel).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      </div>

      <div className="hidden grid-cols-[minmax(0,.9fr)_minmax(0,1.55fr)_minmax(120px,.65fr)_minmax(185px,.9fr)] gap-5 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid">
        <span>Đơn hàng</span>
        <span>Khách hàng / sản phẩm</span>
        <span>Tổng tiền</span>
        <span>Trạng thái</span>
      </div>

      <div className="divide-y divide-slate-100">
        {filteredOrders.map((order) => <button
          key={order.id}
          type="button"
          onClick={() => setSelectedOrderId(order.id)}
          aria-label={`Xem chi tiết đơn phụ kiện ${order.orderNumber}`}
          className="group grid w-full grid-cols-1 gap-4 px-5 py-4 text-left transition-[background-color,transform] hover:bg-slate-50 active:scale-[0.998] active:bg-slate-100 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:grid-cols-2 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.55fr)_minmax(120px,.65fr)_minmax(185px,.9fr)] xl:items-center xl:gap-5"
        >
          <div className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Đơn hàng</span>
            <p className="truncate font-semibold text-brand-700" title={order.orderNumber}>{order.orderNumber}</p>
            <time dateTime={order.createdAt} className="mt-1 block whitespace-nowrap text-xs text-slate-500">{date(order.createdAt)}</time>
          </div>

          <div className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Khách hàng / sản phẩm</span>
            <p className="truncate font-medium text-slate-700" title={order.customerEmail}>{order.customerEmail}</p>
            <div className="mt-1 space-y-0.5 text-sm text-slate-500">
              {order.items.slice(0, 2).map((item, index) => <p key={`${item.product_name_snapshot}-${index}`} className="truncate" title={item.product_name_snapshot}>{item.product_name_snapshot} × {item.quantity}</p>)}
              {order.items.length > 2 && <p className="text-xs font-medium text-slate-400">+{order.items.length - 2} sản phẩm khác</p>}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Tổng tiền</span>
            <p className="whitespace-nowrap font-semibold text-brand-700">{money(order.totalAmount)}</p>
          </div>

          <div className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Trạng thái</span>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <AdminOrderStatusBadge presentation={accessoryOrderStatusPresentation(order.status, order.refundStatus)} />
                {statusHint[order.status] && <p className="mt-1 text-xs text-slate-500">{statusHint[order.status]}</p>}
              </div>
              <ChevronRight aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </div>
          </div>
        </button>)}

        {!filteredOrders.length && <div className="px-6 py-14 text-center text-slate-500"><ShoppingBag className="mx-auto mb-3 text-slate-300" size={30} /><p>{loadError ? 'Không thể tải đơn phụ kiện.' : 'Không có đơn phụ kiện phù hợp.'}</p></div>}
      </div>

      <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">Hiển thị {filteredOrders.length} / {orders.length} đơn hàng</div>
    </div>

    <AccessoryOrderDetailDrawer
      order={selectedOrder}
      isOpen={Boolean(selectedOrder)}
      statusHint={selectedOrder ? statusHint[selectedOrder.status] : undefined}
      actions={selectedOrder ? orderActions(selectedOrder) : undefined}
      onClose={closeOrderDetail}
    />
  </div>
}
