'use client'

import { useEffect, useState } from 'react'
import { Database, RefreshCw, TriangleAlert } from 'lucide-react'

type RedisKey = { key: string; page: string; type: string; ttlSeconds: number; bytes: number | null }
type RedisData = { configured: boolean; connected: boolean; latencyMs: number | null; keyCount: number; keys: RedisKey[] }

const formatBytes = (bytes: number | null) => bytes == null ? '—' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
const formatTtl = (ttl: number) => ttl < 0 ? (ttl === -1 ? 'Không hết hạn' : 'Đã hết hạn') : `${ttl}s`

export function RedisMonitoringCard() {
  const [data, setData] = useState<RedisData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); fetch('/api/v1/admin/monitoring/redis', { cache: 'no-store' }).then(async response => { const payload = await response.json(); if (response.ok) setData(payload.data) }).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const status = !data?.configured ? 'Chưa cấu hình' : data.connected ? 'Đã kết nối' : 'Fallback về Supabase'
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Database size={19} className="text-[#b88a08]"/><div><h2 className="font-semibold text-slate-900">Redis cache</h2><p className="text-sm text-slate-500">Chi tiết các trang và dữ liệu đang được lưu trong bộ nhớ đệm</p></div></div><button type="button" onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Làm mới Redis"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Trạng thái</p><p className={`mt-1 font-semibold ${data?.connected ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Độ trễ PING</p><p className="mt-1 font-semibold text-slate-900">{data?.latencyMs == null ? '—' : `${data.latencyMs} ms`}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Key fastlane</p><p className="mt-1 font-semibold text-slate-900">{data?.keyCount ?? '—'}</p></div></div>
    {data?.connected && <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Trang / module</th><th className="px-3 py-2">Cache key</th><th className="px-3 py-2">Kiểu</th><th className="px-3 py-2">TTL</th><th className="px-3 py-2">Dung lượng</th></tr></thead><tbody className="divide-y divide-slate-100">{data.keys.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Chưa có cache key nào.</td></tr> : data.keys.map(item => <tr key={item.key} className="text-slate-700"><td className="px-3 py-2 font-medium">{item.page}</td><td className="max-w-[320px] truncate px-3 py-2 font-mono text-xs" title={item.key}>{item.key}</td><td className="px-3 py-2">{item.type}</td><td className="px-3 py-2">{formatTtl(item.ttlSeconds)}</td><td className="px-3 py-2">{formatBytes(item.bytes)}</td></tr>)}</tbody></table></div>}
    {data && !data.connected && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert size={17} className="shrink-0"/>Redis không khả dụng; hệ thống vẫn dùng Supabase làm nguồn chính.</div>}
  </section>
}
