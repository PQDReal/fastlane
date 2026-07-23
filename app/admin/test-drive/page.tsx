'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CalendarDays, Loader2, RefreshCw, Search } from 'lucide-react'
import { getAdminTestDriveRequests, transitionAdminTestDriveRequest } from '@/lib/api/admin-test-drive-client'
import type { AdminTestDriveRequest, TestDriveStatus } from '@/lib/services/admin-test-drive-service'

const LABEL: Record<TestDriveStatus, string> = { REQUESTED: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', DECLINED: 'Từ chối', CANCELLED: 'Đã hủy', COMPLETED: 'Hoàn thành', NO_SHOW: 'Không đến' }
const STYLE: Record<TestDriveStatus, string> = { REQUESTED: 'bg-amber-100 text-amber-700', CONFIRMED: 'bg-blue-100 text-blue-700', DECLINED: 'bg-slate-200 text-slate-700', CANCELLED: 'bg-red-100 text-red-700', COMPLETED: 'bg-green-100 text-green-700', NO_SHOW: 'bg-orange-100 text-orange-700' }
const ACTIONS: Partial<Record<TestDriveStatus, { action: string; label: string }[]>> = {
  REQUESTED: [{ action: 'CONFIRM', label: 'Xác nhận' }, { action: 'DECLINE', label: 'Từ chối' }, { action: 'CANCEL', label: 'Hủy' }],
  CONFIRMED: [{ action: 'COMPLETE', label: 'Hoàn thành' }, { action: 'MARK_NO_SHOW', label: 'Không đến' }, { action: 'CANCEL', label: 'Hủy' }],
}

export default function AdminTestDrivePage() {
  const [requests, setRequests] = useState<AdminTestDriveRequest[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRequests(await getAdminTestDriveRequests({ query: query.trim() || undefined, status: status || undefined })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải lịch lái thử') }
    finally { setLoading(false) }
  }, [query, status])

  useEffect(() => { void loadRequests() }, [status, loadRequests])

  async function handleSearch(event: FormEvent) { event.preventDefault(); await loadRequests() }

  async function changeStatus(item: AdminTestDriveRequest, action: string) {
    const needsReason = action === 'DECLINE' || action === 'CANCEL'
    const reason = needsReason ? window.prompt('Nhập lý do:') : undefined
    if (needsReason && !reason?.trim()) return
    setUpdatingId(item.id); setError(null)
    try {
      const updated = await transitionAdminTestDriveRequest({ id: item.id, action, expectedCurrentStatus: item.status, reason: reason?.trim() })
      setRequests((current) => current.map((row) => row.id === updated.id ? updated : row))
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể cập nhật trạng thái') }
    finally { setUpdatingId(null) }
  }

  const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Lịch lái thử</h1><p className="mt-1 text-sm text-slate-500">Quản lý yêu cầu, xác nhận và cập nhật kết quả lái thử.</p></div>
        <button onClick={() => void loadRequests()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Làm mới</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row">
          <form onSubmit={handleSearch} className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm mã yêu cầu, tên, số điện thoại hoặc email..." className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none" /></form>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"><option value="">Tất cả trạng thái</option>{Object.entries(LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {error && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500"><tr><th className="px-5 py-4">Mã yêu cầu</th><th className="px-5 py-4">Khách hàng</th><th className="px-5 py-4">Mẫu xe</th><th className="px-5 py-4">Lịch mong muốn</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4">Cập nhật</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-6 py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-600" /></td></tr> : requests.length === 0 ? <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-500"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-300" />Chưa có yêu cầu lái thử phù hợp.</td></tr> : requests.map((item) => {
                const actions = ACTIONS[item.status] ?? []
                return <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-900">{item.referenceNumber}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{item.fullName}</p><p className="text-xs text-slate-500">{item.phoneNumber}</p>{item.email && <p className="text-xs text-slate-500">{item.email}</p>}</td><td className="px-5 py-4 text-slate-700">{item.productName}</td><td className="px-5 py-4 text-slate-700">{dateTime(item.scheduledAt)}</td><td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase ${STYLE[item.status]}`}>{LABEL[item.status]}</span></td><td className="px-5 py-4">{actions.length ? <select value="" disabled={updatingId === item.id} onChange={(e) => { if (e.target.value) void changeStatus(item, e.target.value) }} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-60"><option value="">{updatingId === item.id ? 'Đang cập nhật...' : 'Chọn thao tác'}</option>{actions.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}</select> : <span className="text-xs text-slate-400">Đã kết thúc</span>}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}