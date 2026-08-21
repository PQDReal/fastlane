'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, Gauge, Monitor, RefreshCw, Server, TriangleAlert } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { LatencySummary, MonitoringPeriod, MonitoringTrend, SentryMonitoringData, SlowTransaction } from '@/lib/monitoring/sentry-types'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

const periods: Array<{ value: MonitoringPeriod; label: string }> = [
  { value: '1h', label: '1 giờ' },
  { value: '24h', label: '24 giờ' },
  { value: '7d', label: '7 ngày' },
  { value: '14d', label: '14 ngày' },
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

function count(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value)
}

function latencyStatus(value: number | null) {
  if (value === null) return { label: 'Chưa có dữ liệu', style: 'bg-slate-100 text-slate-600' }
  if (value < 500) return { label: 'Tốt', style: 'bg-emerald-50 text-emerald-700' }
  if (value < 1500) return { label: 'Ổn định', style: 'bg-blue-50 text-blue-700' }
  if (value < 3000) return { label: 'Chậm', style: 'bg-amber-50 text-amber-700' }
  return { label: 'Rất chậm', style: 'bg-red-50 text-red-700' }
}

function relativeChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

function DeltaBadge({
  current,
  previous,
  lowerIsBetter = false,
  neutral = false,
}: {
  current: number | null
  previous: number | null
  lowerIsBetter?: boolean
  neutral?: boolean
}) {
  const change = relativeChange(current, previous)
  if (change === null) return null
  const rounded = Math.abs(change) < 0.1 ? 0 : change
  const favorable = neutral ? false : lowerIsBetter ? rounded < 0 : rounded > 0
  const Icon = rounded === 0 ? null : rounded > 0 ? ArrowUp : ArrowDown
  const color = neutral
    ? 'bg-slate-100 text-slate-600'
    : favorable
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`} title="So với cùng khoảng thời gian trước">
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {rounded === 0 ? 'Không đổi' : `${Math.abs(rounded).toFixed(1)}%`}
    </span>
  )
}

function SummaryCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
  comparison,
}: {
  title: string
  value: string
  detail: string
  icon: typeof Activity
  tone?: 'blue' | 'amber' | 'red' | 'emerald'
  comparison?: { current: number | null; previous: number | null; lowerIsBetter?: boolean; neutral?: boolean }
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500">{detail}</p>
            {comparison && <DeltaBadge {...comparison} />}
          </div>
        </div>
        <span className={`shrink-0 rounded-lg p-2.5 ${colors[tone]}`}><Icon size={20} /></span>
      </div>
    </div>
  )
}

function LatencyPanel({
  title,
  summary,
  previous,
  icon: Icon,
}: {
  title: string
  summary: LatencySummary
  previous: LatencySummary | null
  icon: typeof Monitor
}) {
  const status = latencyStatus(summary.p95Ms)
  const metrics = [
    ['Trung bình', summary.avgMs],
    ['p50', summary.p50Ms],
    ['p95', summary.p95Ms],
    ['p99', summary.p99Ms],
  ] as const

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Icon size={18} className="text-[#b88a08]" /><h2 className="font-semibold text-slate-900">{title}</h2></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.style}`}>{status.label}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-lg bg-slate-50 py-4 text-center sm:grid-cols-4">
        {metrics.map(([label, value]) => <div key={label}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{latency(value)}</p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>{count(summary.requestCount)} request</span>
        <span className="flex items-center gap-2">Lỗi: <strong className="text-slate-700">{percentage(summary.failureRate)}</strong><DeltaBadge current={summary.failureRate} previous={previous?.failureRate ?? null} lowerIsBetter /></span>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>p95 so với kỳ trước</span>
        <DeltaBadge current={summary.p95Ms} previous={previous?.p95Ms ?? null} lowerIsBetter />
      </div>
    </section>
  )
}

function trendDate(timestamp: number, period: MonitoringPeriod) {
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat('vi-VN', period === '1h' || period === '24h'
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit' }).format(date)
}

function TrendPanel({ title, trend, period, icon: Icon }: { title: string; trend: MonitoringTrend; period: MonitoringPeriod; icon: typeof Monitor }) {
  const chartData = useMemo(() => trend.points.map((point, index) => ({
    ...point,
    label: trendDate(point.timestamp, period),
    previousP95Ms: trend.previousPoints[index]?.p95Ms ?? null,
  })), [period, trend.points, trend.previousPoints])

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2"><Icon size={18} className="text-[#b88a08]" /><div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">p50, p95 và p99 theo thời gian</p></div></div>
        {trend.intervalSeconds && <span className="whitespace-nowrap text-xs text-slate-500">Mỗi {trend.intervalSeconds >= 3600 ? `${trend.intervalSeconds / 3600} giờ` : `${trend.intervalSeconds / 60} phút`}</span>}
      </div>
      {chartData.length === 0 ? (
        <div className="mt-4 flex h-56 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">Chưa có chuỗi thời gian từ Sentry.</div>
      ) : (
        <div className="mt-4 h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="timestamp" tickFormatter={(value) => trendDate(Number(value), period)} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => latency(Number(value))} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={54} />
              <Tooltip labelFormatter={(value) => trendDate(Number(value), period)} formatter={(value, name) => [latency(Number(value)), String(name)]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 8px 20px rgb(15 23 42 / 0.08)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="p50Ms" name="p50 hiện tại" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="p95Ms" name="p95 hiện tại" stroke="#b88a08" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="p99Ms" name="p99 hiện tại" stroke="#dc2626" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="previousP95Ms" name="p95 kỳ trước" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function SlowTable({ title, rows }: { title: string; rows: SlowTransaction[] }) {
  const statusFor = (row: SlowTransaction) => latencyStatus(row.p95Ms)

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-900">{title}</h2></div>
      {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Chưa có request phù hợp trong khoảng thời gian này.</p> : <>
        <div className="space-y-3 p-3 md:hidden">
          {rows.map((row, index) => {
            const status = statusFor(row)
            return <article key={`${row.name}-${row.method}-${index}`} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">{row.method || '—'}</span><p className="truncate font-medium text-slate-800" title={row.name}>{row.name}</p></div><p className="mt-1 truncate text-xs text-slate-400">{row.operation || '—'}</p></div>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${status.style}`}>{status.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-50 p-2"><p className="text-slate-500">p95</p><p className="mt-1 font-bold text-slate-900">{latency(row.p95Ms)}</p></div>
                <div className="rounded bg-slate-50 p-2"><p className="text-slate-500">p99</p><p className="mt-1 font-bold text-slate-900">{latency(row.p99Ms)}</p></div>
                <div className="rounded bg-slate-50 p-2"><p className="text-slate-500">Request</p><p className="mt-1 font-semibold text-slate-700">{count(row.requestCount)}</p></div>
                <div className="rounded bg-slate-50 p-2"><p className="text-slate-500">Tỷ lệ lỗi</p><p className="mt-1 font-semibold text-slate-700">{percentage(row.failureRate)}</p></div>
              </div>
            </article>
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-50 px-5 py-3">Method / route</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Requests</th><th scope="col" className="px-3 py-3">Trung bình</th><th scope="col" className="px-3 py-3">p50</th><th scope="col" className="px-3 py-3">p95</th><th scope="col" className="px-3 py-3">p99</th><th scope="col" className="px-3 py-3">Tỷ lệ lỗi</th><th scope="col" className="px-3 py-3">Đánh giá</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((row, index) => { const status = statusFor(row); return <tr key={`${row.name}-${row.method}-${index}`} className="group hover:bg-slate-50"><td className="sticky left-0 z-[1] max-w-xs bg-white px-5 py-3 group-hover:bg-slate-50"><div className="flex items-center gap-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">{row.method || '—'}</span><p className="truncate font-medium text-slate-800" title={row.name}>{row.name}</p></div><p className="mt-1 text-xs text-slate-400">{row.operation || '—'}</p></td><td className="px-3 py-3 text-slate-600">{row.statusCode ?? '—'}</td><td className="px-3 py-3 text-slate-600">{count(row.requestCount)}</td><td className="px-3 py-3 text-slate-600">{latency(row.avgMs)}</td><td className="px-3 py-3 text-slate-600">{latency(row.p50Ms)}</td><td className="px-3 py-3 font-semibold text-slate-900">{latency(row.p95Ms)}</td><td className="px-3 py-3 text-slate-600">{latency(row.p99Ms)}</td><td className="px-3 py-3 text-slate-600">{percentage(row.failureRate)}</td><td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${status.style}`}>{status.label}</span></td></tr> })}</tbody>
          </table>
        </div>
      </>}
    </section>
  )
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />
}

function DashboardSkeleton() {
  return <div className="space-y-4" aria-label="Đang tải dữ liệu giám sát" aria-busy="true"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} className="h-32" />)}</div><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <SkeletonBlock key={index} className="h-52" />)}</div><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <SkeletonBlock key={index} className="h-80" />)}</div><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <SkeletonBlock key={index} className="h-96" />)}</div></div>
}

export function SentryMonitoringDashboard() {
  const [period, setPeriod] = useState<MonitoringPeriod>('24h')
  const [data, setData] = useState<SentryMonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
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

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, period])

  const isRefreshing = loading && data !== null
  const previousRequestCount = data?.frontendPrevious && data.backendPrevious
    ? data.frontendPrevious.requestCount + data.backendPrevious.requestCount
    : null
  const currentRequestCount = data ? data.frontend.requestCount + data.backend.requestCount : null

  return <>
    <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Khoảng thời gian giám sát">{periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08] ${period === item.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}</div>
        <button type="button" aria-pressed={autoRefresh} onClick={() => setAutoRefresh((value) => !value)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08] ${autoRefresh ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><span className="relative flex h-2 w-2"><span className={`absolute inline-flex h-full w-full rounded-full ${autoRefresh ? 'animate-ping bg-emerald-400' : 'bg-slate-300'}`} /><span className={`relative inline-flex h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-slate-400'}`} /></span>{autoRefresh ? 'Tự động 60 giây' : 'Tự động tắt'}</button>
      </div>
      <div className="flex items-center gap-3"><span className="text-xs text-slate-500">{data ? `Cập nhật ${new Date(data.fetchedAt).toLocaleString('vi-VN')}` : ''}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08]"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Đang tải...' : 'Làm mới'}</button></div>
    </div>

    {loading && !data ? <DashboardSkeleton /> : data ? <div className="relative" aria-busy={loading}>
      {isRefreshing && <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-4"><span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"><RefreshCw size={13} className="animate-spin" /> Đang cập nhật dữ liệu...</span></div>}
      <div className={isRefreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {!data.configured ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><TriangleAlert className="shrink-0 text-amber-600" /><div><h2 className="font-semibold text-amber-900">Chưa cấu hình quyền đọc Sentry</h2><p className="mt-1 text-sm text-amber-800">Thêm <code>SENTRY_MONITORING_TOKEN</code>, <code>SENTRY_ORG</code> và <code>SENTRY_PROJECT</code> vào biến môi trường server. Token nên chỉ có quyền <code>org:read</code>, <code>project:read</code>, <code>event:read</code>.</p></div></div></div> : !data.available ? <div className="rounded-xl border border-red-200 bg-red-50 p-6"><h2 className="font-semibold text-red-900">Không kết nối được Sentry</h2><p className="mt-1 text-sm text-red-700">{data.error}</p></div> : <>
          {data.warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><p className="font-semibold">Thông tin từ Sentry</p><ul className="mt-1 list-disc space-y-1 pl-5">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard title="Frontend p95" value={latency(data.frontend.p95Ms)} detail="Pageload và navigation" icon={Monitor} comparison={{ current: data.frontend.p95Ms, previous: data.frontendPrevious?.p95Ms ?? null, lowerIsBetter: true }} /><SummaryCard title="Backend/API p95" value={latency(data.backend.p95Ms)} detail="HTTP server transactions" icon={Server} tone="amber" comparison={{ current: data.backend.p95Ms, previous: data.backendPrevious?.p95Ms ?? null, lowerIsBetter: true }} /><SummaryCard title="Tỷ lệ lỗi API" value={percentage(data.backend.failureRate)} detail="Theo traces đã lấy mẫu" icon={TriangleAlert} tone="red" comparison={{ current: data.backend.failureRate, previous: data.backendPrevious?.failureRate ?? null, lowerIsBetter: true }} /><SummaryCard title="Tổng lượt đo" value={count(currentRequestCount ?? 0)} detail="Frontend và backend/API" icon={Gauge} tone="emerald" comparison={{ current: currentRequestCount, previous: previousRequestCount, neutral: true }} /></div>
          <div className="grid gap-4 xl:grid-cols-2"><LatencyPanel title="Độ trễ frontend" summary={data.frontend} previous={data.frontendPrevious} icon={Monitor} /><LatencyPanel title="Độ trễ backend/API" summary={data.backend} previous={data.backendPrevious} icon={Server} /></div>
          <div className="grid gap-4 xl:grid-cols-2"><TrendPanel title="Xu hướng frontend" trend={data.frontendTrend} period={data.period} icon={Monitor} /><TrendPanel title="Xu hướng backend/API" trend={data.backendTrend} period={data.period} icon={Server} /></div>
          <div className="grid gap-4 xl:grid-cols-2"><SlowTable title="Trang frontend chậm nhất" rows={data.slowFrontend} /><SlowTable title="API backend chậm nhất" rows={data.slowBackend} /></div>
          <p className="text-xs text-slate-500">Dữ liệu traces phụ thuộc tỷ lệ sampling của Sentry và được cache {data.cacheTtlSeconds} giây để tránh vượt giới hạn API. Đường nét đứt trong biểu đồ là p95 của kỳ trước.</p>
        </>}
      </div>
    </div> : null}
  </>
}
