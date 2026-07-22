import { AdminSidebar } from '../../components/admin/sidebar'
import { AdminTopbar } from '../../components/admin/topbar'
import '../../app/globals.css' // Ensure globals are imported if needed, but it's Next app router, layout nesting inherits styles

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col md:pl-64">
        <AdminTopbar />
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
