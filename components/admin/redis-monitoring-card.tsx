'use client'

import { useEffect, useState } from 'react'
import { Database, RefreshCw, TriangleAlert } from 'lucide-react'

type RedisData = { configured: boolean; connected: boolean; latencyMs: number | null; keyCount: number }

export function RedisMonitoringCard() {
  const [data, setData] = useState<RedisData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); fetch('/api/v1/admin/monitoring/redis').then(async (response) => { const payload = await response.json(); if (response.ok) setData(payload.data) }).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [])
  const status = !data?.configured ? 'Chưa cấu hình' : data.connected ? 'Đang kết nối' : 'Fallback về Supabase'
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Database size={19} className="text-[#b88a08]"/><div><h2 className="font-semibold text-slate-900">Redis cache</h2><p className="text-sm text-slate-500">Giám sát bộ nhớ đệm phân tán</p></div></div><button type="button" onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Làm mới Redis"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Trạng thái</p><p className={`mt-1 font-semibold ${data?.connected ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Độ trễ PING</p><p className="mt-1 font-semibold text-slate-900">{data?.latencyMs == null ? '—' : `${data.latencyMs} ms`}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Key fastlane</p><p className="mt-1 font-semibold text-slate-900">{data?.keyCount ?? '—'}</p></div></div>{data && !data.connected && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><TriangleAlert size={17} className="shrink-0"/>Redis không khả dụng; hệ thống vẫn dùng Supabase làm nguồn chính.</div>}</section>
}
