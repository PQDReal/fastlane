'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CalendarDays, FileDown, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { getAdminTestDriveRequests, transitionAdminTestDriveRequest } from '@/lib/api/admin-test-drive-client'
import type { AdminTestDriveRequest, TestDriveStatus } from '@/lib/services/admin-test-drive-service'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

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
  const [sort, setSort] = useState('CREATED_DESC')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reasonRequest, setReasonRequest] = useState<{ item: AdminTestDriveRequest; action: string } | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<AdminTestDriveRequest | null>(null)
  const [reason, setReason] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const closeToast = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), [])
  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => closeToast(id), 4500)
  }, [closeToast])

  const loadRequests = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRequests(await getAdminTestDriveRequests({ query: query.trim() || undefined, status: status || undefined, sort })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải lịch lái thử') }
    finally { setLoading(false) }
  }, [query, sort, status])

  useEffect(() => { void loadRequests() }, [sort, status, loadRequests])

  async function handleSearch(event: FormEvent) { event.preventDefault(); await loadRequests() }

  async function updateStatus(item: AdminTestDriveRequest, action: string, reasonValue?: string) {
    setUpdatingId(item.id); setError(null)
    try {
      const updated = await transitionAdminTestDriveRequest({ id: item.id, action, expectedCurrentStatus: item.status, reason: reasonValue })
      setRequests((current) => current.map((row) => row.id === updated.id ? updated : row))
      setSelectedRequest((current) => current?.id === updated.id ? updated : current)
      setReasonRequest(null)
      setReason('')
      notify('success', 'Cập nhật trạng thái thành công', `Yêu cầu ${item.referenceNumber} đã được cập nhật.`)
    } catch (e) {
      notify('error', 'Cập nhật trạng thái thất bại', e instanceof Error ? e.message : 'Không thể cập nhật trạng thái')
    } finally { setUpdatingId(null) }
  }

  function changeStatus(item: AdminTestDriveRequest, action: string) {
    if (action === 'DECLINE' || action === 'CANCEL') {
      setReasonRequest({ item, action })
      setReason('')
      return
    }
    void updateStatus(item, action)
  }

  async function submitReason(event: FormEvent) {
    event.preventDefault()
    if (!reasonRequest || !reason.trim()) return
    await updateStatus(reasonRequest.item, reasonRequest.action, reason.trim())
  }

  const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

  function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character)
  }

  function exportPdf() {
    if (loading || requests.length === 0) return
    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) {
      setError('Kh\u00f4ng th\u1ec3 m\u1edf c\u1eeda s\u1ed5 xu\u1ea5t PDF. Vui l\u00f2ng cho ph\u00e9p popup v\u00e0 th\u1eed l\u1ea1i.')
      return
    }
    printWindow.opener = null

    const rows = requests.map((item, index) => `<tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.referenceNumber)}</strong></td>
      <td>${escapeHtml(item.fullName)}<br><small>${escapeHtml(item.phoneNumber)}${item.email ? `<br>${escapeHtml(item.email)}` : ''}</small></td>
      <td>${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(dateTime(item.scheduledAt))}</td>
      <td>${escapeHtml(LABEL[item.status])}</td>
    </tr>`).join('')

    const generatedAt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
    const statusText = status ? LABEL[status as TestDriveStatus] : 'T\u1ea5t c\u1ea3 tr\u1ea1ng th\u00e1i'
    const title = `lich-lai-thu-${new Date().toISOString().slice(0, 10)}`
    printWindow.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, "Helvetica Neue", sans-serif; font-size: 11px; }
      h1 { margin: 0 0 6px; font-size: 22px; }
      .meta { margin-bottom: 16px; color: #475569; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
      th:nth-child(1), td:nth-child(1) { width: 4%; text-align: center; }
      th:nth-child(2), td:nth-child(2) { width: 15%; }
      th:nth-child(3), td:nth-child(3) { width: 25%; }
      th:nth-child(4), td:nth-child(4) { width: 18%; }
      th:nth-child(5), td:nth-child(5) { width: 20%; }
      th:nth-child(6), td:nth-child(6) { width: 18%; }
      tr { break-inside: avoid; }
      small { color: #64748b; }
      .footer { margin-top: 10px; color: #64748b; font-size: 9px; text-align: right; }
    </style></head><body>
      <h1>L\u1ecbch l\u00e1i th\u1eed</h1>
      <div class="meta">Ng\u00e0y xu\u1ea5t: ${escapeHtml(generatedAt)}<br>B\u1ed9 l\u1ecdc: ${escapeHtml(statusText)}${query.trim() ? ` · T\u00ecm ki\u1ebfm: “${escapeHtml(query.trim())}”` : ''}<br>T\u1ed5ng s\u1ed1 y\u00eau c\u1ea7u: ${requests.length}</div>
      <table><thead><tr><th>STT</th><th>M\u00e3 y\u00eau c\u1ea7u</th><th>Kh\u00e1ch h\u00e0ng</th><th>M\u1eabu xe</th><th>L\u1ecbch mong mu\u1ed1n</th><th>Tr\u1ea1ng th\u00e1i</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Xu\u1ea5t l\u00fac ${escapeHtml(generatedAt)}</div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script>
    </body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <ToastViewport toasts={toasts} onClose={closeToast} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Lịch lái thử</h1><p className="mt-1 text-sm text-slate-500">Quản lý yêu cầu, xác nhận và cập nhật kết quả lái thử.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={exportPdf} disabled={loading || requests.length === 0} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><FileDown size={16} />Xuất PDF</button>
          <button type="button" onClick={() => void loadRequests()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Làm mới</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row">
          <form onSubmit={handleSearch} className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm mã yêu cầu, tên, số điện thoại hoặc email..." className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none" /></form>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"><option value="">Tất cả trạng thái</option>{Object.entries(LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp lịch lái thử" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"><option value="CREATED_DESC">Ngày tạo: mới nhất</option><option value="SCHEDULED_ASC">Lịch mong muốn: gần nhất</option><option value="SCHEDULED_DESC">Lịch mong muốn: xa nhất</option></select>
        </div>
        {error && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500"><tr><th className="px-5 py-4">Mã yêu cầu</th><th className="px-5 py-4">Khách hàng</th><th className="px-5 py-4">Mẫu xe</th><th className="px-5 py-4">Lịch mong muốn</th><th className="px-5 py-4">Trạng thái</th><th className="px-5 py-4">Cập nhật</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-6 py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-600" /></td></tr> : requests.length === 0 ? <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-500"><CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-300" />Chưa có yêu cầu lái thử phù hợp.</td></tr> : requests.map((item) => {
                const actions = ACTIONS[item.status] ?? []
                return <tr key={item.id} role="button" tabIndex={0} onClick={() => setSelectedRequest(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRequest(item) } }} className="cursor-pointer transition duration-150 hover:bg-slate-50 active:scale-[0.995] active:bg-brand-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><td className="px-5 py-4 font-semibold text-slate-900">{item.referenceNumber}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{item.fullName}</p><p className="text-xs text-slate-500">{item.phoneNumber}</p>{item.email && <p className="text-xs text-slate-500">{item.email}</p>}</td><td className="px-5 py-4 text-slate-700">{item.productName}</td><td className="px-5 py-4 text-slate-700">{dateTime(item.scheduledAt)}</td><td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase ${STYLE[item.status]}`}>{LABEL[item.status]}</span></td><td className="px-5 py-4">{actions.length ? <select value="" disabled={updatingId === item.id} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(e) => { if (e.target.value) void changeStatus(item, e.target.value) }} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs focus:border-brand-500 focus:outline-none disabled:opacity-60"><option value="">{updatingId === item.id ? 'Đang cập nhật...' : 'Chọn thao tác'}</option>{actions.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}</select> : <span className="text-xs text-slate-400">Đã kết thúc</span>}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
      {selectedRequest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRequest(null) }}>
          <motion.section initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.97 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} role="dialog" aria-modal="true" aria-labelledby="test-drive-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 id="test-drive-detail-title" className="text-xl font-bold text-slate-900">Chi tiết lịch lái thử</h2>
                <p className="mt-1 font-mono text-sm font-semibold text-brand-600">{selectedRequest.referenceNumber}</p>
              </div>
              <button type="button" onClick={() => setSelectedRequest(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Đóng"><X size={19} /></button>
            </header>
            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-500">Trạng thái</span>
                <span className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase ${STYLE[selectedRequest.status]}`}>{LABEL[selectedRequest.status]}</span>
              </div>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Khách hàng</dt><dd className="mt-1 font-semibold text-slate-900">{selectedRequest.fullName}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mẫu xe</dt><dd className="mt-1 font-semibold text-slate-900">{selectedRequest.productName}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Số điện thoại</dt><dd className="mt-1 text-slate-700">{selectedRequest.phoneNumber}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt><dd className="mt-1 break-all text-slate-700">{selectedRequest.email || 'Không có'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lịch mong muốn</dt><dd className="mt-1 text-slate-700">{dateTime(selectedRequest.scheduledAt)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Thời gian xác nhận</dt><dd className="mt-1 text-slate-700">{selectedRequest.confirmedAt ? dateTime(selectedRequest.confirmedAt) : 'Chưa xác nhận'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ngày tạo</dt><dd className="mt-1 text-slate-700">{dateTime(selectedRequest.createdAt)}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cập nhật gần nhất</dt><dd className="mt-1 text-slate-700">{dateTime(selectedRequest.updatedAt)}</dd></div>
              </dl>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-800">Ghi chú khách hàng</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedRequest.note || 'Không có ghi chú.'}</p></div>
                <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-800">Ghi chú quản trị</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedRequest.adminNote || 'Không có ghi chú.'}</p></div>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>

      {reasonRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !updatingId) setReasonRequest(null) }}>
          <form onSubmit={submitReason} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Nhập lý do</h2>
                <p className="mt-1 text-sm text-slate-500">Yêu cầu {reasonRequest.item.referenceNumber}</p>
              </div>
              <button type="button" onClick={() => setReasonRequest(null)} disabled={Boolean(updatingId)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Đóng"><X size={18} /></button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700">Lý do
              <textarea autoFocus required maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do từ chối hoặc hủy..." className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setReasonRequest(null)} disabled={Boolean(updatingId)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={Boolean(updatingId) || !reason.trim()} className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{updatingId && <Loader2 size={15} className="mr-2 animate-spin" />}Xác nhận</button>
            </div>
          </form>
        </div>
      )}    </div>
  )
}