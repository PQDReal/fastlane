'use client'

import { Bell, Search, Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'

export function AdminTopbar() {
  const pathname = usePathname()
  
  // Format breadcrumb from pathname
  const segments = pathname.split('/').filter(p => p && p !== 'admin')
  const title = segments.length > 0 
    ? segments[segments.length - 1].charAt(0).toUpperCase() + segments[segments.length - 1].slice(1) 
    : 'Tổng quan'

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button className="md:hidden text-slate-500 hover:text-slate-900">
          <Menu size={20} />
        </button>
        
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
        <div className="relative hidden md:block w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Tìm kiếm..." 
            className="w-full h-9 pl-9 pr-4 rounded-md bg-slate-100 border-transparent focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm transition-all outline-none"
          />
        </div>
        
        <button className="relative text-slate-400 hover:text-slate-900 transition-colors">
          <Bell size={20} />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
      </div>
    </header>
  )
}
