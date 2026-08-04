'use client'

import { useState, useRef, useCallback } from 'react'
import { Search, Filter, MoreHorizontal, Eye, Truck, CheckCircle2, FileText, XCircle } from 'lucide-react'
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
  kyc_status?: string | null
  kyc_session_id?: string | null
  createdAt: string
  isCar: boolean
  vehicleType?: string
  rawDeposit?: any
}

export function AdminOrdersClient({ orders }: { orders: AdminOrderRow[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRow | null>(null)
  
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  
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
      case 'PENDING_PAYMENT': return 'bg-yellow-100 text-yellow-700'
      case 'PAID': return 'bg-emerald-100 text-emerald-700'
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

  const translateAdminStatus = (status: string, isCar: boolean) => {
    if (isCar) {
      return {
        'PENDING_DEPOSIT': 'Chờ cọc',
        'PENDING_CONFIRMATION': 'Chờ xét duyệt cọc',
        'CONFIRMED': 'Đã xác nhận',
        'PENDING_CONTRACT': 'Chờ tạo HĐ',
        'CONTRACT_SIGNED': 'Đã ký HĐ',
        'PENDING_PAYMENT': 'Chờ thanh toán',
        'PAID': 'Đã thanh toán',
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

  const renderActions = (order: any) => {
    if (!order.isCar) {
      return (
        <div className="flex justify-end gap-2 items-center">
          <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="Xem chi tiết"><Eye size={16}/></button>
          <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Cập nhật trạng thái"><Truck size={16}/></button>
        </div>
      )
    }

    return (
      <div className="flex justify-end items-center gap-2">
        <button 
          onClick={() => setSelectedOrder(order)}
          className="whitespace-nowrap px-3 py-1.5 text-xs font-semibold border border-slate-200 text-slate-700 hover:text-brand-700 hover:border-brand-200 hover:bg-brand-50 rounded-md transition-colors shadow-sm" 
          title="Xem chi tiết"
        >
          Xem chi tiết
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Đơn đặt xe</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi các đơn đặt cọc xe ô tô và xe máy điện.</p>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-lg w-max">
        <button 
          onClick={() => setVehicleTypeFilter('All')} 
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${vehicleTypeFilter === 'All' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
        >
          Tất cả
        </button>
        <button 
          onClick={() => setVehicleTypeFilter('car')} 
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${vehicleTypeFilter === 'car' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
        >
          Ô tô điện
        </button>
        <button 
          onClick={() => setVehicleTypeFilter('motorbike')} 
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${vehicleTypeFilter === 'motorbike' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
        >
          Xe máy điện
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm theo Mã Đơn hoặc Khách Hàng..." 
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Tất cả trạng thái</option>
                <optgroup label="Đơn Xe Ô tô">
                  <option value="PENDING_DEPOSIT">Chờ cọc</option>
                  <option value="PENDING_CONFIRMATION">Chờ xét duyệt cọc</option>
                  <option value="CONFIRMED">Đã xác nhận</option>
                  <option value="PENDING_CONTRACT">Chờ tạo HĐ</option>
                  <option value="CONTRACT_SIGNED">Đã ký HĐ</option>
                  <option value="PENDING_PAYMENT">Chờ thanh toán</option>
                  <option value="PAID">Đã thanh toán</option>
                  <option value="PREPARING_DELIVERY">Chờ giao xe</option>
                  <option value="DELIVERED">Đã giao xe</option>
                  <option value="COMPLETED">Hoàn thành (Xe)</option>
                  <option value="CANCELLED">Đã hủy cọc</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Mã đơn hàng</th>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Sản phẩm</th>
                <th className="px-6 py-4">Tổng tiền</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Thanh toán</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="relative w-28 px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    <div>{order.orderNumber}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{order.vehicleType === 'motorbike' ? 'Xe máy điện' : 'Ô tô điện'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 max-w-[200px] truncate" title={order.customerName}>{order.customerName}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-[250px] truncate" title={order.vehicle}>{order.vehicle}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMoney(order.amount)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${getStatusStyle(order.status)}`}>
                      {translateAdminStatus(order.status, order.isCar)}
                    </span>
                    {order.kyc_status === 'REVIEW' && (
                      <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                        ⚠️ Cần duyệt KYC
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      order.payment === 'Paid' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {order.payment === 'Paid' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-50-50 text-xs">{formatDate(order.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    {renderActions(order)}
                  </td>
                </tr>
              ))}
              
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Không tìm thấy đơn hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination mock */}
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between text-sm text-slate-500">
          <div>Hiển thị 1 đến {filteredOrders.length > 20 ? 20 : filteredOrders.length} của {filteredOrders.length} kết quả</div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Trước</Button>
            <Button variant="outline" size="sm">Sau</Button>
          </div>
        </div>
      </div>

      <AdminOrderDetailDrawer 
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onOrderUpdated={() => {
          // You could optionally trigger a router.refresh() here 
          // or let the actions.ts revalidatePath handle it (it does).
        }}
        onShowToast={showToast}
      />
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  )
}
