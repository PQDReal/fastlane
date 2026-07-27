'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AdminSidebar } from './sidebar'
import { AdminTopbar } from './topbar'

type AdminIdentity = { fullName: string; email: string }

export function AdminShell({ children, user }: { children: React.ReactNode; user: AdminIdentity }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

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

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-50">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      {sidebarOpen && <button type="button" aria-label="Đóng menu quản trị" className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] md:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <AdminTopbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}