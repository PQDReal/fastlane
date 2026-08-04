import Link from 'next/link'
import {
  Archive, ArrowUpRight, CalendarDays, CircleDollarSign, Clock3, Database,
  Package, ShoppingCart, Tags, Ticket, TrendingUp, Users,
} from 'lucide-react'

import { RevenueChart } from '@/components/admin/revenue-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAdminDashboardData } from '@/lib/services/admin-dashboard-service'

export const dynamic = 'force-dynamic'

const MODULES = {
  categories: { name: 'Danh mục', description: 'Phân nhóm ô tô, xe máy điện và phụ kiện.', href: '/admin/categories', icon: Tags },
  products: { name: 'Sản phẩm', description: 'Sản phẩm, phiên bản và thông tin bán hàng.', href: '/admin/products', icon: Package },
  orders: { name: 'Đơn phụ kiện', description: 'Đơn mua phụ kiện và dữ liệu thanh toán.', href: '/admin/accessory-orders', icon: ShoppingCart },
  testDrive: { name: 'Lịch lái thử', description: 'Yêu cầu đăng ký và lịch hẹn lái thử.', href: '/admin/test-drive', icon: CalendarDays },
  inventory: { name: 'Tồn kho', description: 'Số lượng tồn theo từng phiên bản sản phẩm.', href: '/admin/inventory', icon: Archive },
  promotions: { name: 'Khuyến mãi', description: 'Mã giảm giá, điều kiện và lượt sử dụng.', href: '/admin/promotions', icon: Ticket },
  costPolicies: { name: 'Chính sách chi phí', description: 'Phí đăng ký, biển số, đường bộ và bảo hiểm.', href: '/admin/cost-policies', icon: CircleDollarSign },
  customers: { name: 'Tài khoản', description: 'Khách hàng và tài khoản quản trị hệ thống.', href: '/admin/customers', icon: Users },
} as const

const ORDER_STATUS: Record<string, string> = {
  PENDING: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận', READY: 'Sẵn sàng giao', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy',
}
const TEST_DRIVE_STATUS: Record<string, string> = {
  REQUESTED: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', DECLINED: 'Từ chối', CANCELLED: 'Đã hủy', COMPLETED: 'Hoàn thành', NO_SHOW: 'Không đến',
}

const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const formatMoney = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export default async function AdminDashboard() {
  const { modules, metrics, recentOrders, recentTestDrives, revenueOrders } = await getAdminDashboardData()
  const availableCount = modules.filter((module) => module.available).length
  const totalRecords = modules.reduce((total, module) => total + (module.count ?? 0), 0)
  const operationalStats = [
    { label: 'Doanh thu hôm nay', value: formatMoney(metrics.todayRevenue), detail: `${metrics.todayOrders} đơn hàng hôm nay`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Đơn chờ xử lý', value: formatNumber(metrics.pendingOrders), detail: 'Đơn hàng trạng thái chờ', icon: ShoppingCart, color: 'text-amber-600 bg-amber-50' },
    { label: 'Tồn kho thấp', value: formatNumber(metrics.lowStockItems), detail: 'Phiên bản còn ít hơn 5 sản phẩm', icon: Archive, color: 'text-red-600 bg-red-50' },
    { label: 'Lịch lái thử mới', value: formatNumber(metrics.pendingTestDrives), detail: '', icon: CalendarDays, color: 'text-blue-600 bg-blue-50' },
  ]

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tổng quan hệ thống</h1>
          <p className="mt-1 text-sm text-slate-500">Dữ liệu vận hành được cập nhật trực tiếp từ database.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><Database size={15} className="text-emerald-600" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {operationalStats.map((stat) => <Card key={stat.label} className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color}`}><stat.icon size={19} /></div></div><p className="mt-3 text-xs text-slate-500">{stat.detail}</p></CardContent></Card>)}
      </div>

      <RevenueChart orders={revenueOrders} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Đơn phụ kiện gần đây</CardTitle><Link href="/admin/accessory-orders" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Xem tất cả <ArrowUpRight size={14} /></Link></CardHeader>
          <CardContent>
            {recentOrders.length ? <div className="divide-y divide-slate-100">{recentOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.customerName}</p><p className="mt-1 text-xs text-slate-500">{order.orderNumber} · {formatDate(order.createdAt)}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-slate-900">{formatMoney(order.totalAmount)}</p><p className="mt-1 text-xs text-slate-500">{ORDER_STATUS[order.status] ?? order.status}</p></div></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">Chưa có đơn hàng trong database.</p>}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Lịch lái thử gần đây</CardTitle><Link href="/admin/test-drive" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Xem tất cả <ArrowUpRight size={14} /></Link></CardHeader>
          <CardContent>
            {recentTestDrives.length ? <div className="divide-y divide-slate-100">{recentTestDrives.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.customerName}</p><p className="mt-1 truncate text-xs text-slate-500">{item.referenceNumber} · {item.productName}</p></div><div className="shrink-0 text-right"><p className="flex items-center justify-end gap-1 text-xs font-medium text-slate-700"><Clock3 size={13} />{formatDate(item.scheduledAt)}</p><p className="mt-1 text-xs text-slate-500">{TEST_DRIVE_STATUS[item.status] ?? item.status}</p></div></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">Chưa có lịch lái thử trong database.</p>}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-4"><h2 className="text-lg font-bold text-slate-900">Module dữ liệu</h2><p className="mt-1 text-sm text-slate-500">Truy cập nhanh các khu vực quản trị và theo dõi số bản ghi.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((summary) => { const module = MODULES[summary.key as keyof typeof MODULES]; const Icon = module.icon; return <Link key={summary.key} href={module.href} className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Card className="h-full border-slate-200 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-200 group-hover:shadow-md group-active:scale-[0.99]"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon size={19} /></div><p className="text-2xl font-bold text-slate-900">{summary.count === null ? '—' : formatNumber(summary.count)}</p></div><h3 className="mt-4 font-bold text-slate-900">{module.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="font-mono text-[10px] text-slate-400">{summary.table}</span><span className={`text-[11px] font-medium ${summary.available ? 'text-emerald-600' : 'text-red-600'}`}>{summary.available ? 'Hoạt động' : 'Lỗi truy vấn'}</span></div></CardContent></Card></Link> })}
        </div>
      </section>
    </div>
  )
}
