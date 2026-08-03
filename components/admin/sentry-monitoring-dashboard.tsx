'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, ExternalLink, Gauge, Monitor, RefreshCw, Server, TriangleAlert } from 'lucide-react'

import type { LatencySummary, MonitoringPeriod, SentryMonitoringData, SlowTransaction } from '@/lib/monitoring/sentry-types'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

const periods: Array<{ value: MonitoringPeriod; label: string }> = [
  { value: '1h', label: '1 giờ' }, { value: '24h', label: '24 giờ' }, { value: '7d', label: '7 ngày' }, { value: '14d', label: '14 ngày' },
]

function latency(value: number | null) {
  if (value === null) return '—'
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`
}

function percentage(value: number | null) {
  if (value === null) return '—'
  const normalized = value <= 1 ? value * 100 : value
  return `${normalized.toFixed(normalized < 1 ? 2 : 1)}%`
}

function count(value: number) { return new Intl.NumberFormat('vi-VN').format(value) }

function SummaryCard({ title, value, detail, icon: Icon, tone = 'blue' }: { title: string; value: string; detail: string; icon: typeof Activity; tone?: 'blue' | 'amber' | 'red' | 'emerald' }) {
  const colors = { blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', emerald: 'bg-emerald-50 text-emerald-600' }
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className={`rounded-lg p-2.5 ${colors[tone]}`}><Icon size={20}/></span></div></div>
}

function LatencyPanel({ title, summary, icon: Icon }: { title: string; summary: LatencySummary; icon: typeof Monitor }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Icon size={18} className="text-[#b88a08]"/><h2 className="font-semibold text-slate-900">{title}</h2></div><div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-4 text-center">{([['p50', summary.p50Ms], ['p95', summary.p95Ms], ['p99', summary.p99Ms]] as const).map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{latency(value)}</p></div>)}</div><div className="mt-4 flex justify-between text-sm text-slate-500"><span>{count(summary.requestCount)} lượt đo</span><span>Lỗi: <strong className="text-slate-700">{percentage(summary.failureRate)}</strong></span></div></section>
}

function SlowTable({ title, rows }: { title: string; rows: SlowTransaction[] }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">{title}</h2></div>{rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Chưa có trace phù hợp trong khoảng thời gian này.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Transaction</th><th className="px-4 py-3">Số lượt</th><th className="px-4 py-3">p95</th><th className="px-4 py-3">Tỷ lệ lỗi</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={`${row.name}-${index}`} className="hover:bg-slate-50"><td className="max-w-sm px-5 py-3"><p className="truncate font-medium text-slate-800">{row.name}</p><p className="text-xs text-slate-400">{row.operation}</p></td><td className="px-4 py-3 text-slate-600">{count(row.requestCount)}</td><td className="px-4 py-3 font-semibold text-slate-800">{latency(row.p95Ms)}</td><td className="px-4 py-3 text-slate-600">{percentage(row.failureRate)}</td></tr>)}</tbody></table></div>}</section>
}

export function SentryMonitoringDashboard() {
  const [period, setPeriod] = useState<MonitoringPeriod>('24h')
  const [data, setData] = useState<SentryMonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notifyError = useCallback((message: string) => {
    const id = Date.now()
    setToasts((items) => [...items, { id, kind: 'error', title: 'Không thể tải dữ liệu giám sát', message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/v1/admin/monitoring/sentry?period=${period}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Yêu cầu thất bại.')
        setData(payload.data)
      })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') notifyError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [period, refreshKey, notifyError])

  return <>
    <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))}/>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-lg border border-slate-200 bg-white p-1">{periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08] ${period === item.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}</div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{data ? `Cập nhật ${new Date(data.fetchedAt).toLocaleString('vi-VN')}` : ''}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08]"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Làm mới</button></div></div>

    {loading && !data ? <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white"><RefreshCw className="animate-spin text-[#b88a08]"/><span className="ml-3 text-sm text-slate-500">Đang tải dữ liệu Sentry…</span></div> : data && !data.configured ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><TriangleAlert className="shrink-0 text-amber-600"/><div><h2 className="font-semibold text-amber-900">Chưa cấu hình quyền đọc Sentry</h2><p className="mt-1 text-sm text-amber-800">Thêm <code>SENTRY_MONITORING_TOKEN</code>, <code>SENTRY_ORG</code> và <code>SENTRY_PROJECT</code> vào biến môi trường server. Token nên chỉ có quyền <code>org:read</code>, <code>project:read</code>, <code>event:read</code>.</p></div></div></div> : data && !data.available ? <div className="rounded-xl border border-red-200 bg-red-50 p-6"><h2 className="font-semibold text-red-900">Không kết nối được Sentry</h2><p className="mt-1 text-sm text-red-700">{data.error}</p></div> : data ? <>
      {data.warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><p className="font-semibold">Thông tin từ Sentry</p><ul className="mt-1 list-disc space-y-1 pl-5">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard title="Frontend p95" value={latency(data.frontend.p95Ms)} detail="Pageload và navigation" icon={Monitor}/><SummaryCard title="Backend/API p95" value={latency(data.backend.p95Ms)} detail="HTTP server transactions" icon={Server} tone="amber"/><SummaryCard title="Tỷ lệ lỗi API" value={percentage(data.backend.failureRate)} detail="Theo traces đã lấy mẫu" icon={TriangleAlert} tone="red"/><SummaryCard title="Tổng lượt đo" value={count(data.frontend.requestCount + data.backend.requestCount)} detail={`${data.issues.unresolved} issue chưa xử lý`} icon={Gauge} tone="emerald"/></div>
      <div className="grid gap-4 xl:grid-cols-2"><LatencyPanel title="Độ trễ frontend" summary={data.frontend} icon={Monitor}/><LatencyPanel title="Độ trễ backend/API" summary={data.backend} icon={Server}/></div>
      <div className="grid gap-4 xl:grid-cols-2"><SlowTable title="Trang frontend chậm nhất" rows={data.slowFrontend}/><SlowTable title="API backend chậm nhất" rows={data.slowBackend}/></div>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Issues gần đây</h2><p className="text-xs text-slate-500">{data.issues.unresolved} issue chưa xử lý trong kỳ</p></div>{data.dashboardUrl && <a href={data.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">Mở Sentry <ExternalLink size={14}/></a>}</div>{data.issues.recent.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Không có issue chưa xử lý.</p> : <div className="divide-y divide-slate-100">{data.issues.recent.map((issue) => <a key={issue.id} href={issue.permalink} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100"><div className="min-w-0"><p className="truncate font-medium text-slate-800">{issue.title}</p><p className="mt-1 truncate text-xs text-slate-500">{issue.shortId} · {issue.culprit || 'Không xác định'}</p></div><div className="shrink-0 text-right text-xs text-slate-500"><p>{count(issue.count)} events</p><p>{issue.lastSeen ? new Date(issue.lastSeen).toLocaleString('vi-VN') : ''}</p></div></a>)}</div>}</section>
      <p className="text-xs text-slate-500">Dữ liệu traces phụ thuộc tỷ lệ sampling của Sentry và được cache {data.cacheTtlSeconds} giây để tránh vượt giới hạn API.</p>
    </> : null}
  </>
}
