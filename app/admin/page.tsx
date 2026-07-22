'use client'

import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Package, ShoppingCart, DollarSign, TrendingUp, AlertCircle, ArrowUpRight } from 'lucide-react'
import { mockOrders, mockProducts, mockInventory } from '../../lib/mock-db'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { useMemo } from 'react'
import Link from 'next/link'

export default function AdminDashboard() {
  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0,0,0,0)
    
    const todayOrders = mockOrders.filter(o => new Date(o.createdAt) >= today)
    const revenue = todayOrders.reduce((acc, o) => acc + o.amount, 0)
    
    const lowStock = mockInventory.filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock').length
    const pendingOrders = mockOrders.filter(o => o.status === 'Pending').length

    return {
      revenue,
      todayOrders: todayOrders.length,
      totalOrders: mockOrders.length,
      products: mockProducts.length,
      lowStock,
      pendingOrders
    }
  }, [])

  const chartData = useMemo(() => {
    // Group orders by day for the last 7 days
    const data = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
      
      const dayOrders = mockOrders.filter(o => {
        const od = new Date(o.createdAt)
        return od.getDate() === d.getDate() && od.getMonth() === d.getMonth()
      })
      
      data.push({
        name: dateStr,
        revenue: dayOrders.reduce((sum, o) => sum + o.amount, 0),
        orders: dayOrders.length
      })
    }
    return data
  }, [])

  const formatMoney = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const compactMoney = (val: number) => (val / 1000000).toFixed(1) + 'M'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tổng quan hệ thống</h1>
        <div className="flex gap-3">
          <Link href="/admin/orders" className="px-4 py-2 bg-white border border-slate-200 text-sm font-medium rounded-md shadow-sm hover:bg-slate-50 transition-colors">
            Xem đơn hàng
          </Link>
          <Link href="/admin/products/new" className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md shadow-sm hover:bg-slate-800 transition-colors">
            Thêm sản phẩm
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Doanh thu hôm nay</CardTitle>
            <DollarSign size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{formatMoney(stats.revenue)}</div>
            <p className="text-xs text-green-600 mt-1 flex items-center"><TrendingUp size={12} className="mr-1"/> +12.5% so với hôm qua</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Đơn hàng hôm nay</CardTitle>
            <ShoppingCart size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">+{stats.todayOrders}</div>
            <p className="text-xs text-slate-500 mt-1">{stats.totalOrders} đơn hàng trong tháng</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Cần xử lý</CardTitle>
            <AlertCircle size={16} className="text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.pendingOrders}</div>
            <p className="text-xs text-amber-600 mt-1 font-medium">Đơn hàng đang chờ xử lý</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Sắp hết hàng</CardTitle>
            <Package size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats.lowStock}</div>
            <p className="text-xs text-slate-500 mt-1">Trong tổng số {stats.products} mã sản phẩm</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">Doanh thu (7 ngày qua)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis tickFormatter={compactMoney} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip 
                    formatter={(value: any) => [formatMoney(value), 'Doanh thu']}
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="revenue" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900">Đơn hàng gần đây</CardTitle>
            <Link href="/admin/orders" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center">
              Xem tất cả <ArrowUpRight size={14} className="ml-1"/>
            </Link>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-5">
              {mockOrders.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{order.customerName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{order.orderNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(order.amount)}</p>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                      order.status === 'Completed' ? 'bg-green-100 text-green-700' :
                      order.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                      order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {order.status === 'Completed' ? 'Hoàn thành' : order.status === 'Pending' ? 'Chờ xử lý' : order.status === 'Cancelled' ? 'Đã hủy' : 'Đang xử lý'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
