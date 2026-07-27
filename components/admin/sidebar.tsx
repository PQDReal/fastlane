'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Archive, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Package, ShoppingCart, Tags, Ticket, Users, X } from 'lucide-react'

const navigation = [
  { name: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { name: 'Danh mục', href: '/admin/categories', icon: Tags },
  { name: 'Sản phẩm', href: '/admin/products', icon: Package },
  { name: 'Đơn hàng', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Lịch lái thử', href: '/admin/test-drive', icon: CalendarDays },
  { name: 'Tồn kho', href: '/admin/inventory', icon: Archive },
  { name: 'Khuyến mãi', href: '/admin/promotions', icon: Ticket },
  { name: 'Chính sách chi phí', href: '/admin/cost-policies', icon: CircleDollarSign },
  { name: 'Tài khoản', href: '/admin/customers', icon: Users },
]

type Props = {
  open?: boolean
  collapsed?: boolean
  onClose?: () => void
  onToggleCollapsed?: () => void
  user: { fullName: string; email: string }
}

export function AdminSidebar({ open = false, collapsed = false, onClose, onToggleCollapsed, user }: Props) {
  const pathname = usePathname()
  const parts = user.fullName.trim().split(/\s+/).filter(Boolean)
  const initials = (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join('') : parts[0]?.slice(0, 2)).toUpperCase() || 'AD'

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-[width,transform] duration-300 ease-out md:translate-x-0 ${collapsed ? 'md:w-20' : 'md:w-64'} ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <div className={`relative flex h-16 shrink-0 items-center border-b border-slate-800 bg-slate-950 ${collapsed ? 'md:justify-center md:px-3' : 'px-6'}`}>
        <Link href="/admin" className="group flex min-w-0 items-center gap-2.5" aria-label="FASTLANE Admin">
          <img src="/images/fastlane-logo.png" alt="Logo FASTLANE" className="h-8 w-auto shrink-0 object-contain transition-transform duration-300 group-hover:scale-105" />
          <span className={`font-display mt-0.5 overflow-hidden whitespace-nowrap text-xl font-bold tracking-[0.06em] text-[#b88a08] transition-[width,opacity] duration-200 ${collapsed ? 'md:w-0 md:opacity-0' : 'w-[130px] opacity-100'}`}>FASTLANE</span>
        </Link>
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden" aria-label="Đóng menu"><X size={20} /></button>
      </div>

      <button type="button" onClick={onToggleCollapsed} className="absolute -right-3 top-20 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 shadow-lg transition-colors hover:border-brand-500 hover:text-white md:flex" aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
        <div className={`mb-4 overflow-hidden whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-opacity ${collapsed ? 'md:h-0 md:opacity-0' : ''}`}>Quản lý</div>
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return <Link key={item.name} href={item.href} title={collapsed ? item.name : undefined} aria-label={item.name} className={`flex h-10 items-center rounded-md text-sm font-medium transition-colors ${collapsed ? 'md:justify-center md:px-0' : 'gap-3 px-3'} ${active ? 'bg-brand-600/10 text-brand-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <item.icon size={19} className={`shrink-0 ${active ? 'text-brand-500' : 'text-slate-500'}`} />
            <span className={`overflow-hidden whitespace-nowrap transition-[width,opacity] duration-200 ${collapsed ? 'md:w-0 md:opacity-0' : 'w-auto opacity-100'}`}>{item.name}</span>
          </Link>
        })}
      </div>

      <div className="space-y-1 border-t border-slate-800 p-3">
        <a href="/auth/logout" title={collapsed ? 'Đăng xuất' : undefined} className={`flex h-10 w-full items-center rounded-md text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400 ${collapsed ? 'md:justify-center md:px-0' : 'gap-3 px-3'}`}><LogOut size={19} className="shrink-0 text-slate-500"/><span className={`overflow-hidden whitespace-nowrap transition-[width,opacity] duration-200 ${collapsed ? 'md:w-0 md:opacity-0' : ''}`}>Đăng xuất</span></a>
      </div>

      <div className={`flex min-h-16 items-center border-t border-slate-900 bg-slate-950 p-3 ${collapsed ? 'md:justify-center' : 'gap-3'}`} title={collapsed ? `${user.fullName} – ${user.email}` : undefined}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{initials}</div>
        <div className={`min-w-0 flex-1 overflow-hidden transition-[width,opacity] duration-200 ${collapsed ? 'md:w-0 md:flex-none md:opacity-0' : ''}`}><p className="truncate text-sm font-medium text-white">{user.fullName}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
      </div>
    </aside>
  )
}