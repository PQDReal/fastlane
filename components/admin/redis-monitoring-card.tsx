'use client'

import { useEffect, useState } from 'react'
import { Database, Gauge, RefreshCw, TriangleAlert, Zap } from 'lucide-react'

type RedisKey = { key: string; page: string; type: string; ttlSeconds: number; bytes: number | null }
type PerformanceRow = {
  keyGroup: string
  hits: number
  misses: number
  bypasses: number
  requests: number
  hitRate: number | null
  avgCacheReadMs: number | null
  avgSourceLoadMs: number | null
  improvementPercent: number | null
}
type RedisData = {
  configured: boolean
  connected: boolean
  latencyMs: number | null
  keyCount: number
  keys: RedisKey[]
  performance: { startedAt: string; total: PerformanceRow; rows: PerformanceRow[] }
}

const formatBytes = (bytes: number | null) => bytes == null ? '—' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
const formatTtl = (ttl: number) => ttl < 0 ? (ttl === -1 ? 'Không hết hạn' : 'Đã hết hạn') : `${ttl}s`
const formatMs = (value: number | null) => value == null ? '—' : value < 10 ? `${value.toFixed(1)} ms` : `${Math.round(value)} ms`
const formatPercent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`

export function RedisMonitoringCard() {
  const [data, setData] = useState<RedisData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    fetch('/api/v1/admin/monitoring/redis', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (response.ok) setData(payload.data)
      })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const status = !data?.configured ? 'Chưa cấu hình' : data.connected ? 'Đã kết nối' : 'Fallback về Supabase'
  const total = data?.performance.total

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <Database size={19} className="text-[#b88a08]"/>
        <div><h2 className="font-semibold text-slate-900">Redis cache</h2><p className="text-sm text-slate-500">So sánh Redis HIT với đường xử lý sau Redis MISS</p></div>
      </div>
      <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88a08]" aria-label="Làm mới Redis"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Trạng thái" value={status} tone={data?.connected ? 'good' : 'warning'}/>
      <Metric label="Độ trễ PING" value={data?.latencyMs == null ? '—' : `${data.latencyMs} ms`}/>
      <Metric label="Cache hit rate" value={total?.hitRate == null ? '—' : formatPercent(total.hitRate * 100)} tone={(total?.hitRate ?? 0) >= 0.7 ? 'good' : undefined}/>
      <Metric label="Redis HIT" value={formatMs(total?.avgCacheReadMs ?? null)}/>
      <Metric label="Sau Redis MISS" value={formatMs(total?.avgSourceLoadMs ?? null)}/>
    </div>

    {total && <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <ImprovementMetric value={total.improvementPercent}/>
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><Gauge className="text-slate-600" size={21}/><div><p className="text-xs font-medium text-slate-500">Mẫu đã ghi nhận</p><p className="text-xl font-bold text-slate-900">{total.requests.toLocaleString('vi-VN')} request</p></div></div>
    </div>}

    <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Trang / module</th><th className="px-3 py-2">HIT</th><th className="px-3 py-2">MISS</th><th className="px-3 py-2">BYPASS</th><th className="px-3 py-2">Hit rate</th><th className="px-3 py-2">Redis HIT</th><th className="px-3 py-2">Sau Redis MISS</th><th className="px-3 py-2">Chênh lệch</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {!data?.performance.rows.length ? <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Chưa có request cache nào kể từ khi server khởi động.</td></tr> : data.performance.rows.map((item) => <tr key={item.keyGroup} className="text-slate-700 hover:bg-slate-50"><td className="px-3 py-2 font-medium">{item.keyGroup}</td><td className="px-3 py-2 text-emerald-700">{item.hits}</td><td className="px-3 py-2 text-amber-700">{item.misses}</td><td className="px-3 py-2 text-slate-500">{item.bypasses}</td><td className="px-3 py-2">{item.hitRate == null ? '—' : formatPercent(item.hitRate * 100)}</td><td className="px-3 py-2">{formatMs(item.avgCacheReadMs)}</td><td className="px-3 py-2">{formatMs(item.avgSourceLoadMs)}</td><td className={`px-3 py-2 font-semibold ${improvementTextTone(item.improvementPercent)}`}>{formatPercent(item.improvementPercent)}</td></tr>)}
        </tbody>
      </table>
    </div>

    {data && <p className="mt-3 text-xs text-slate-500">Số liệu được thu thập từ {new Date(data.performance.startedAt).toLocaleString('vi-VN')} và sẽ đặt lại khi tiến trình server khởi động lại. MISS là Redis không có key; BYPASS là Redis tắt hoặc không khả dụng.</p>}
    <p className="mt-2 text-xs text-slate-500">Chênh lệch ước tính = (thời gian sau Redis MISS − thời gian Redis HIT) / thời gian sau Redis MISS. Số dương nghĩa là Redis HIT nhanh hơn; số âm nghĩa là mẫu đo hiện tại cho thấy Redis HIT chậm hơn. “Sau Redis MISS” có thể vẫn dùng Next Data Cache, không phải luôn là Supabase thuần.</p>

    {data?.connected && <details className="mt-5 rounded-lg border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Chi tiết {data.keyCount} cache key</summary><div className="overflow-x-auto border-t border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Trang / module</th><th className="px-3 py-2">Cache key</th><th className="px-3 py-2">Kiểu</th><th className="px-3 py-2">TTL</th><th className="px-3 py-2">Dung lượng</th></tr></thead><tbody className="divide-y divide-slate-100">{data.keys.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Chưa có cache key nào.</td></tr> : data.keys.map(item => <tr key={item.key} className="text-slate-700"><td className="px-3 py-2 font-medium">{item.page}</td><td className="max-w-[320px] truncate px-3 py-2 font-mono text-xs" title={item.key}>{item.key}</td><td className="px-3 py-2">{item.type}</td><td className="px-3 py-2">{formatTtl(item.ttlSeconds)}</td><td className="px-3 py-2">{formatBytes(item.bytes)}</td></tr>)}</tbody></table></div></details>}
    <p className="mt-3 text-xs text-slate-500">TTL (Time To Live) là thời gian mỗi cache key được giữ trong Redis trước khi tự động hết hạn; khi hết TTL, request tiếp theo sẽ tải lại dữ liệu nguồn.</p>
    {data && !data.connected && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert size={17} className="shrink-0"/>Redis không khả dụng; hệ thống vẫn dùng Supabase làm nguồn chính và ghi nhận request là BYPASS.</div>}
  </section>
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warning' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-900'
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 font-semibold ${color}`}>{value}</p></div>
}

function improvementTextTone(value: number | null) {
  if (value == null) return 'text-slate-500'
  return value < 0 ? 'text-red-600' : 'text-emerald-700'
}

function ImprovementMetric({ value }: { value: number | null }) {
  const negative = (value ?? 0) < 0
  return <div className={`flex items-center gap-3 rounded-lg border p-4 ${negative ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
    <Zap className={negative ? 'text-red-600' : 'text-emerald-600'} size={21}/>
    <div><p className={`text-xs font-medium ${negative ? 'text-red-700' : 'text-emerald-700'}`}>Chênh lệch ước tính</p><p className={`text-xl font-bold ${negative ? 'text-red-900' : 'text-emerald-900'}`}>{formatPercent(value)}</p></div>
  </div>
}
