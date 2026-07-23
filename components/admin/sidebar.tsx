'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ShoppingCart, Archive, Users, Settings, LogOut, CarFront, Ticket, Tags, CalendarDays } from 'lucide-react'

const navigation = [
  { name: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { name: 'Danh mục', href: '/admin/categories', icon: Tags },
  { name: 'Sản phẩm', href: '/admin/products', icon: Package },
  { name: 'Đơn hàng', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Lịch lái thử', href: '/admin/test-drive', icon: CalendarDays },
  { name: 'Tồn kho', href: '/admin/inventory', icon: Archive },
  { name: 'Khuyến mãi', href: '/admin/promotions', icon: Ticket },
  { name: 'Khách hàng', href: '/admin/customers', icon: Users },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col z-50 border-r border-slate-800">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <Link href="/admin" className="flex items-center gap-2 text-white hover:text-brand-400 transition-colors">
          <CarFront size={24} className="text-brand-500" />
          <span className="font-bold text-lg tracking-tight">Fastlane Admin</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Quản lý</div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-brand-600/10 text-brand-400' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={18} className={isActive ? 'text-brand-500' : 'text-slate-500'} />
              {item.name}
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-slate-800 space-y-1">
        <Link
          href="/admin/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname.startsWith('/admin/settings') 
              ? 'bg-brand-600/10 text-brand-400' 
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Settings size={18} className={pathname.startsWith('/admin/settings') ? 'text-brand-500' : 'text-slate-500'} />
          Cài đặt
        </Link>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors">
          <LogOut size={18} className="text-slate-500" />
          Đăng xuất
        </button>
      </div>
      
      {/* Profile Snippet */}
      <div className="p-4 bg-slate-950 flex items-center gap-3 border-t border-slate-900">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
          HN
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">Hưng Nguyễn</p>
          <p className="text-xs text-slate-500 truncate">Quản trị viên</p>
        </div>
      </div>
    </aside>
  )
}
