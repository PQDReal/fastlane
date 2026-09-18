import { redirect } from 'next/navigation'

import { AdminShell } from '../../components/admin/admin-shell'
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
    <AdminShell user={{ fullName: user.full_name, email: user.email }}>{children}</AdminShell>

  )
}