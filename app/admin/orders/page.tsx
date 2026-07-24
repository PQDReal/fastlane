'use client'

import { useState } from 'react'
import { mockOrders } from '../../../lib/mock-db'
import { Search, Filter, MoreHorizontal, Eye, Truck } from 'lucide-react'
import { Button } from '../../../components/ui/button'

export default function AdminOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const filteredOrders = mockOrders.filter(o => {
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
      case 'Pending': return 'bg-amber-100 text-amber-700'
      case 'Confirmed': return 'bg-blue-100 text-blue-700'
      case 'Preparing': return 'bg-indigo-100 text-indigo-700'
      case 'Ready': return 'bg-purple-100 text-purple-700'
      case 'Completed': return 'bg-green-100 text-green-700'
      case 'Cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Đơn hàng</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi đơn đặt hàng của khách hàng.</p>
        </div>
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
                <option value="Pending">Chờ xử lý</option>
                <option value="Confirmed">Đã xác nhận</option>
                <option value="Preparing">Đang chuẩn bị</option>
                <option value="Ready">Sẵn sàng giao</option>
                <option value="Completed">Hoàn thành</option>
                <option value="Cancelled">Đã hủy</option>
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
                <th className="px-6 py-4">Xe</th>
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
                  <td className="px-6 py-4 font-semibold text-slate-900">{order.orderNumber}</td>
                  <td className="px-6 py-4 text-slate-700">{order.customerName}</td>
                  <td className="px-6 py-4 text-slate-600">{order.vehicle}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{formatMoney(order.amount)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${getStatusStyle(order.status)}`}>
                      {order.status === 'Completed' ? 'Hoàn thành' : order.status === 'Pending' ? 'Chờ xử lý' : order.status === 'Confirmed' ? 'Đã xác nhận' : order.status === 'Preparing' ? 'Đang chuẩn bị' : order.status === 'Ready' ? 'Sẵn sàng giao' : 'Đã hủy'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      order.payment === 'Paid' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {order.payment === 'Paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{formatDate(order.createdAt)}</td>
                  <td className="relative w-28 px-6 py-4 text-right">
                    <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded" title="View Details"><Eye size={16}/></button>
                      <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Update Status"><Truck size={16}/></button>
                    </div>
                    <button className="absolute right-6 top-1/2 inline-block -translate-y-1/2 p-2 text-slate-400 transition-opacity group-hover:pointer-events-none group-hover:opacity-0"><MoreHorizontal size={16}/></button>
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
    </div>
  )
}
