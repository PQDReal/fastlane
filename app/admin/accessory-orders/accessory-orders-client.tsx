'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, RotateCcw, Search, ShoppingBag, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

export type AdminAccessoryOrder = {
  id: string; orderNumber: string; customerEmail: string
  items: { product_name_snapshot: string; quantity: number }[]
  totalAmount: number
  status: 'PENDING' | 'PAID' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED'
  refundStatus: 'NONE' | 'PENDING' | 'COMPLETED'
  createdAt: string
}

const statusLabel: Record<AdminAccessoryOrder['status'], string> = {
  PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', CONFIRMED: 'Đã xác nhận',
  READY: 'Sẵn sàng giao', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy',
}
const statusStyle: Record<AdminAccessoryOrder['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700', PAID: 'bg-emerald-100 text-emerald-700',
  CONFIRMED: 'bg-blue-100 text-blue-700', READY: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-teal-100 text-teal-700', CANCELLED: 'bg-red-100 text-red-700',
}
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export function AccessoryOrdersClient({ initialOrders, loadError }: { initialOrders: AdminAccessoryOrder[]; loadError: string | null }) {
  const [orders, setOrders] = useState(initialOrders)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ALL' | AdminAccessoryOrder['status']>('ALL')
  const [busy, setBusy] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>(loadError ? [{ id: 1, kind: 'error', title: 'Tải đơn hàng thất bại', message: loadError }] : [])
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi')
    return orders.filter((order) => (status === 'ALL' || order.status === status) && (!normalized || [order.orderNumber, order.customerEmail, ...order.items.map((item) => item.product_name_snapshot)].some((value) => value.toLocaleLowerCase('vi').includes(normalized))))
  }, [orders, query, status])
  const notify = (toast: Omit<ToastMessage, 'id'>) => setToasts((current) => [...current, { id: Date.now(), ...toast }])

  async function confirmOrder(order: AdminAccessoryOrder) {
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
    } finally { setBusy(null) }
  }

  async function runAction(order: AdminAccessoryOrder, action: 'cancel' | 'complete' | 'refund') {
    setBusy(order.id)
    try {
      const response = await fetch(`/api/v1/admin/orders/${order.id}/actions/${action}`, { method: 'POST' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error?.message ?? 'Không thể cập nhật đơn hàng.')
      setOrders((current) => current.map((item) => item.id !== order.id ? item : {
        ...item,
        status: body.data.status ?? item.status,
        refundStatus: body.data.refundStatus ?? item.refundStatus,
      }))
      const title = action === 'cancel' ? 'Đã hủy đơn phụ kiện' : action === 'complete' ? 'Đã hoàn thành đơn phụ kiện' : 'Đã xác nhận hoàn tiền'
      notify({ kind: 'success', title, message: order.orderNumber })
    } catch (error) {
      notify({ kind: 'error', title: 'Cập nhật đơn hàng thất bại', message: error instanceof Error ? error.message : undefined })
    } finally { setBusy(null) }
  }

  function requestCancellation(order: AdminAccessoryOrder) {
    const toastId = Date.now()
    setToasts((current) => [...current, {
      id: toastId,
      kind: 'warning',
      title: 'Hủy đơn phụ kiện?',
      message: `${order.orderNumber} sẽ bị hủy${order.status === 'CONFIRMED' ? ' và chuyển sang chờ hoàn tiền' : ''}.`,
      secondaryAction: { label: 'Giữ đơn', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== toastId)) },
      action: { label: 'Hủy đơn hàng', variant: 'danger', onClick: () => { setToasts((current) => current.filter((toast) => toast.id !== toastId)); void runAction(order, 'cancel') } },
    }])
  }

  function orderActions(order: AdminAccessoryOrder) {
    if (order.status === 'PENDING') return <Button variant="outline" size="sm" onClick={() => requestCancellation(order)} disabled={busy === order.id} className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"><XCircle size={15} />Hủy đơn hàng</Button>
    if (order.status === 'PAID') return <Button size="sm" onClick={() => confirmOrder(order)} disabled={busy === order.id} className="gap-1.5"><CheckCircle2 size={15} />{busy === order.id ? 'Đang xử lý...' : 'Xác nhận'}</Button>
    if (order.status === 'CONFIRMED') return <div className="flex justify-end gap-2"><Button size="sm" onClick={() => runAction(order, 'complete')} disabled={busy === order.id} className="gap-1.5"><CheckCircle2 size={15} />Đã hoàn thành</Button><Button variant="outline" size="sm" onClick={() => requestCancellation(order)} disabled={busy === order.id} className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"><XCircle size={15} />Hủy đơn hàng</Button></div>
    if (order.status === 'CANCELLED' && order.refundStatus === 'PENDING') return <Button size="sm" onClick={() => runAction(order, 'refund')} disabled={busy === order.id} className="gap-1.5"><RotateCcw size={15} />Đã hoàn tiền</Button>
    if (order.status === 'CANCELLED') return <span className="text-xs font-medium text-slate-400">Đã hủy</span>
    return null
  }

  return <div className="space-y-6">
    <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Đơn phụ kiện</h1><p className="mt-1 text-sm text-slate-500">Dữ liệu đơn mua phụ kiện được tải trực tiếp từ database.</p></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã đơn, email hoặc sản phẩm..." className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-500"><option value="ALL">Tất cả trạng thái</option>{Object.entries(statusLabel).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Mã đơn</th><th className="px-5 py-4">Khách hàng</th><th className="px-5 py-4">Sản phẩm</th><th className="px-5 py-4">Tổng tiền</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4">Ngày tạo</th><th className="px-5 py-4 text-right">Thao tác</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{filteredOrders.map((order) => <tr key={order.id} className="transition-colors hover:bg-slate-50">
          <td className="px-5 py-4 font-semibold text-slate-900">{order.orderNumber}</td><td className="px-5 py-4 text-slate-700">{order.customerEmail}</td>
          <td className="max-w-xs px-5 py-4 text-slate-600"><div className="space-y-1">{order.items.map((item, index) => <p key={`${item.product_name_snapshot}-${index}`} className="truncate" title={item.product_name_snapshot}>{item.product_name_snapshot} × {item.quantity}</p>)}</div></td>
          <td className="px-5 py-4 font-semibold text-slate-900">{money(order.totalAmount)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${statusStyle[order.status]}`}>{order.status === 'CANCELLED' && order.refundStatus === 'PENDING' ? 'Đã hủy · Chờ hoàn tiền' : statusLabel[order.status]}</span></td><td className="px-5 py-4 text-xs text-slate-500">{date(order.createdAt)}</td>
          <td className="px-5 py-4 text-right">{orderActions(order)}</td>
        </tr>)}{!filteredOrders.length && <tr><td colSpan={7} className="px-6 py-14 text-center text-slate-500"><ShoppingBag className="mx-auto mb-3 text-slate-300" size={30} /><p>{loadError ? 'Không thể tải đơn phụ kiện.' : 'Không có đơn phụ kiện phù hợp.'}</p></td></tr>}</tbody>
      </table></div><div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">Hiển thị {filteredOrders.length} / {orders.length} đơn hàng</div>
    </div>
  </div>
}
