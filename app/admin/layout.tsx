import { redirect } from 'next/navigation'

import { AdminSidebar } from '../../components/admin/sidebar'
import { AdminTopbar } from '../../components/admin/topbar'
import { getCurrentUser } from '../../lib/auth/current-user'
import '../../app/globals.css'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth/login?returnTo=/admin')
  }

  if (user.role !== 'ADMIN') {
    redirect('/403')
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <div className="flex flex-1 flex-col md:pl-64">
        <AdminTopbar />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}