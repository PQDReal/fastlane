'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, ShoppingCart, Archive, Users, LogOut, Ticket, Tags, CalendarDays, CircleDollarSign, X } from 'lucide-react'

const navigation = [
  { name: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { name: 'Danh mục', href: '/admin/categories', icon: Tags },
  { name: 'Sản phẩm', href: '/admin/products', icon: Package },
  { name: 'Đơn hàng', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Lịch lái thử', href: '/admin/test-drive', icon: CalendarDays },
  { name: 'Tồn kho', href: '/admin/inventory', icon: Archive },
  { name: 'Khuyến mãi', href: '/admin/promotions', icon: Ticket },
  { name: 'Chính sách chi phí', href: '/admin/cost-policies', icon: CircleDollarSign },
  { name: 'Khách hàng', href: '/admin/customers', icon: Users },
]

export function AdminSidebar({ open = false, onClose, user }: { open?: boolean; onClose?: () => void; user: { fullName: string; email: string } }) {
  const nameParts = user.fullName.trim().split(/\s+/).filter(Boolean)
  const initials = (nameParts.length > 1 ? nameParts.slice(0, 2).map((part) => part[0]).join('') : nameParts[0]?.slice(0, 2)).toUpperCase() || 'AD'
  const pathname = usePathname()

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-transform duration-300 ease-out md:translate-x-0 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <Link href="/admin" className="group flex items-center gap-2.5" aria-label="FASTLANE Admin">
          <img src="/images/fastlane-logo.png" alt="Logo FASTLANE" className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
          <span className="font-display mt-0.5 text-xl font-bold tracking-[0.06em] text-[#b88a08] transition-opacity group-hover:opacity-80">FASTLANE</span>
        </Link>
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-label="Đóng menu"><X size={20} /></button>
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
        <a href="/auth/logout" className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors">
          <LogOut size={18} className="text-slate-500" />
          Đăng xuất
        </a>
      </div>

      {/* Profile Snippet */}
      <div className="p-4 bg-slate-950 flex items-center gap-3 border-t border-slate-900">
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
      </div>
    </aside>
  )
}
