'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AdminSidebar } from './sidebar'
import { AdminTopbar } from './topbar'

type AdminIdentity = { fullName: string; email: string }

export function AdminShell({ children, user }: { children: React.ReactNode; user: AdminIdentity }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('fastlane-admin-sidebar-collapsed') === 'true')
  }, [])
  useEffect(() => setSidebarOpen(false), [pathname])
  useEffect(() => {
    if (!sidebarOpen) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setSidebarOpen(false)
    document.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', close)
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value
      window.localStorage.setItem('fastlane-admin-sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-50">
      <AdminSidebar open={sidebarOpen} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onClose={() => setSidebarOpen(false)} user={user} />
      {sidebarOpen && <button type="button" aria-label="Đóng menu quản trị" className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] md:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${collapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        <AdminTopbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}