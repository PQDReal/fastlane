'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { CustomerNotifications } from '@/components/customer-notifications'

export function AdminTopbar({ onMenuClick, onToggleDesktop }: { onMenuClick?: () => void, onToggleDesktop?: () => void }) {
  const pathname = usePathname()
  
  // Format breadcrumb from pathname
  const segments = pathname.split('/').filter(p => p && p !== 'admin')
  const title = segments.length > 0 
    ? segments[segments.length - 1].charAt(0).toUpperCase() + segments[segments.length - 1].slice(1) 
    : 'Tổng quan'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onMenuClick} className="-ml-2 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden" aria-label="Mở menu quản trị">
          <Menu size={20} />
        </button>
        {onToggleDesktop && (
          <button type="button" onClick={onToggleDesktop} className="hidden -ml-2 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:block" aria-label="Thu gọn menu quản trị">
            <Menu size={20} />
          </button>
        )}
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:hidden">{title}</h1>
        <nav className="hidden sm:flex text-sm font-medium text-slate-500">
          <span>Quản trị</span>
          {segments.map((seg, i) => {
            const viNames: Record<string, string> = {
              'products': 'Sản phẩm',
              'orders': 'Đơn hàng',
              'inventory': 'Tồn kho',
              'customers': 'Khách hàng',
              'settings': 'Cài đặt'
            }
            return (
            <span key={i} className="flex items-center">
              <span className="mx-2 text-slate-300">/</span>
              <span className={i === segments.length - 1 ? "text-slate-900 font-semibold" : ""}>
                {viNames[seg] || seg.charAt(0).toUpperCase() + seg.slice(1)}
              </span>
            </span>
          )})}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        <CustomerNotifications userSubject="admin" admin />
      </div>
    </header>
  )
}
