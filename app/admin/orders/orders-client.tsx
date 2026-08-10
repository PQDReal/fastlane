'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Filter, Search } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { AdminOrderDetailDrawer } from './order-detail-drawer'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

export type AdminOrderRow = {
  id: string
  orderNumber: string
  customerName: string
  vehicle: string
  amount: number
  status: string
  payment: string
  refundStatus: 'NONE' | 'PENDING' | 'COMPLETED'
  kyc_status?: string | null
  kyc_session_id?: string | null
  createdAt: string
  isCar: boolean
  vehicleType?: string
  rawDeposit?: any
}

const ORDERS_PER_PAGE = 20

export function AdminOrdersClient({
  orders,
  debugActionsEnabled,
}: {
  orders: AdminOrderRow[]
  debugActionsEnabled: boolean
}) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRow | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15_000)
    return () => window.clearInterval(timer)
  }, [router])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, vehicleTypeFilter])
  
  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>, duration = 4500) => {
    const id = Date.now()
    setToasts((items) => [...items, { ...toast, id }])
    if (duration > 0) setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), duration)
  }, [])

  const filteredOrders = orders.filter(o => {
    if (!o.isCar) return false;
    if (vehicleTypeFilter !== 'All' && o.vehicleType !== vehicleTypeFilter) return false;
    const matchesSearch = o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          o.customerName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE))
  const activePage = Math.min(currentPage, pageCount)
  const pageStart = (activePage - 1) * ORDERS_PER_PAGE
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + ORDERS_PER_PAGE)
  const pageEnd = Math.min(pageStart + ORDERS_PER_PAGE, filteredOrders.length)

  const formatMoney = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'Pending': 
      case 'PENDING_DEPOSIT': return 'bg-amber-100 text-amber-700'
      case 'PENDING_CONFIRMATION': return 'bg-blue-100 text-blue-700'
      case 'Confirmed':
      case 'CONFIRMED': return 'bg-blue-100 text-blue-700'
      case 'PENDING_CONTRACT': return 'bg-indigo-100 text-indigo-700'
      case 'CONTRACT_SIGNED': return 'bg-emerald-100 text-emerald-700'
      case 'WAITING_VEHICLE': return 'bg-sky-100 text-sky-700'
      case 'Preparing':
      case 'PREPARING_DELIVERY': return 'bg-purple-100 text-purple-700'
      case 'DELIVERED': return 'bg-teal-100 text-teal-700'
      case 'Completed':
      case 'COMPLETED': return 'bg-green-100 text-green-700'
      case 'Cancelled':
      case 'CANCELLED': return 'bg-red-100 text-red-700'
      case 'Shipped': return 'bg-teal-100 text-teal-700'
      case 'PENDING':
      case 'Pending': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const translateAdminStatus = (status: string, isCar: boolean, vehicleType?: string) => {
    if (isCar) {
      return {
        'PENDING_DEPOSIT': 'Chờ cọc',
        'PENDING_CONFIRMATION': 'Chờ xét duyệt cọc',
        'CONFIRMED': 'Đã xác nhận',
        'PENDING_CONTRACT': vehicleType === 'motorbike' ? 'Chờ xác nhận đặt mua' : 'Chờ ký HĐ',
        'CONTRACT_SIGNED': 'Chờ nhận xe',
        'WAITING_VEHICLE': 'Chờ xe sẵn sàng',
        'PREPARING_DELIVERY': 'Chờ giao xe',
        'DELIVERED': 'Đã giao xe',
        'COMPLETED': 'Hoàn thành',
        'CANCELLED': 'Đã hủy cọc',
        'PENDING': 'Chờ xác nhận cọc',
        'Pending': 'Chờ xác nhận cọc',
      }[status] || status
    }
    return {
      'Pending': 'Chờ xác nhận',
      'Confirmed': 'Đã xác nhận',
      'Preparing': 'Đang chuẩn bị',
      'Shipped': 'Đang giao hàng',
      'Completed': 'Giao thành công',
      'Cancelled': 'Đã hủy',
    }[status] || status
  }

  const combinedStatus = (order: AdminOrderRow) => {
    if (order.status === 'CANCELLED' && order.refundStatus === 'COMPLETED') {
      return { label: 'Đã hủy, đã hoàn tiền', style: 'bg-green-100 text-green-700 border border-green-200' }
    }
    if (order.status === 'CANCELLED' && order.payment === 'Paid') {
      return { label: 'Đã hủy, chờ hoàn tiền', style: 'bg-orange-100 text-orange-700 border border-orange-200' }
    }
    if (['CANCELLED', 'COMPLETED', 'DELIVERED', 'PREPARING_DELIVERY', 'CONTRACT_SIGNED', 'WAITING_VEHICLE', 'PENDING_CONTRACT', 'CONFIRMED'].includes(order.status)) {
      return { label: translateAdminStatus(order.status, order.isCar, order.vehicleType), style: getStatusStyle(order.status) }
    }
    if (order.payment === 'Paid') {
      return { label: 'Đã đặt cọc', style: 'bg-green-100 text-green-700 border border-green-200' }
    }
    return { label: 'Chờ đặt cọc', style: 'bg-amber-100 text-amber-700 border border-amber-200' }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Đơn đặt xe</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi các đơn đặt cọc xe ô tô và xe máy điện.</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 rounded-lg bg-slate-100 p-1 sm:w-max">
        <button 
          type="button"
          onClick={() => setVehicleTypeFilter('All')} 
          aria-pressed={vehicleTypeFilter === 'All'}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${vehicleTypeFilter === 'All' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}
        >
          Tất cả
        </button>
        <button 
          type="button"
          onClick={() => setVehicleTypeFilter('car')} 
          aria-pressed={vehicleTypeFilter === 'car'}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${vehicleTypeFilter === 'car' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}
        >
          Ô tô điện
        </button>
        <button 
          type="button"
          onClick={() => setVehicleTypeFilter('motorbike')} 
          aria-pressed={vehicleTypeFilter === 'motorbike'}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${vehicleTypeFilter === 'motorbike' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}
        >
          Xe máy điện
        </button>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm mã đơn hoặc khách hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-md px-3 h-10 text-sm font-medium text-slate-700 w-full sm:w-auto">
              <Filter size={16} className="text-slate-400"/>
              <select 
                aria-label="Lọc đơn theo trạng thái"
                className="w-full bg-transparent focus:outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Tất cả trạng thái</option>
                <optgroup label="Đơn Xe Ô tô">
                  <option value="PENDING_DEPOSIT">Chờ cọc</option>
                  <option value="PENDING_CONFIRMATION">Chờ xét duyệt cọc</option>
                  <option value="CONFIRMED">Đã xác nhận</option>
                  <option value="PENDING_CONTRACT">Chờ ký HĐ</option>
                  <option value="CONTRACT_SIGNED">Đã ký HĐ</option>
                  <option value="WAITING_VEHICLE">Chờ xe sẵn sàng</option>
                  <option value="PREPARING_DELIVERY">Chờ giao xe</option>
                  <option value="DELIVERED">Đã giao xe</option>
                  <option value="COMPLETED">Hoàn thành (Xe)</option>
                  <option value="CANCELLED">Đã hủy cọc</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)_minmax(115px,.65fr)_minmax(170px,.85fr)] gap-6 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span>Đơn hàng</span>
          <span>Khách hàng / sản phẩm</span>
          <span>Tiền cọc</span>
          <span>Trạng thái</span>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleOrders.map((order) => {
            const displayStatus = combinedStatus(order)
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrder(order)}
                aria-label={`Xem chi tiết đơn ${order.orderNumber}`}
                className="group grid w-full grid-cols-1 gap-4 px-5 py-4 text-left transition-[background-color,transform] hover:bg-slate-50 active:scale-[0.998] active:bg-slate-100 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)_minmax(115px,.65fr)_minmax(170px,.85fr)] lg:items-center lg:gap-6"
              >
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Đơn hàng</span>
                  <p className="truncate font-semibold text-brand-700" title={order.orderNumber}>{order.orderNumber}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span>{order.vehicleType === 'motorbike' ? 'Xe máy điện' : 'Ô tô điện'}</span>
                    <span aria-hidden="true">•</span>
                    <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
                  </p>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Khách hàng / sản phẩm</span>
                  <p className="truncate font-medium text-slate-800" title={order.customerName}>{order.customerName}</p>
                  <p className="mt-1 truncate text-sm text-slate-500" title={order.vehicle}>{order.vehicle}</p>
                </div>

                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Tiền cọc</span>
                  <p className="whitespace-nowrap font-semibold text-brand-700">{formatMoney(order.amount)}</p>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Trạng thái</span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${displayStatus.style}`}>
                        {displayStatus.label}
                      </span>
                      {order.kyc_status === 'REVIEW' && (
                        <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-800">
                          Cần duyệt KYC
                        </span>
                      )}
                    </div>
                    <ChevronRight aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                </div>
              </button>
            )
          })}

          {filteredOrders.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              Không tìm thấy đơn hàng nào.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>{filteredOrders.length > 0 ? `Hiển thị ${pageStart + 1}–${pageEnd} trong ${filteredOrders.length} kết quả` : 'Không có kết quả'}</div>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" disabled={activePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Trước</Button>
            <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" disabled={activePage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>Sau</Button>
          </div>
        </div>
      </div>

      <AdminOrderDetailDrawer 
        order={selectedOrder}
        debugActionsEnabled={debugActionsEnabled}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onOrderUpdated={() => {
          setSelectedOrder(null)
          router.refresh()
        }}
        onShowToast={showToast}
      />
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  )
}
