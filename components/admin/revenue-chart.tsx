'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type RevenueOrder = { createdAt: string; totalAmount: number }
type Period = 'day' | 'week' | 'month'
type Point = { key: string; label: string; revenue: number }

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Theo ngày' },
  { value: 'week', label: 'Theo tuần' },
  { value: 'month', label: 'Theo tháng' },
]

const money = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(value)
const compactMoney = (value: number) => new Intl.NumberFormat('vi-VN', {
  notation: 'compact', maximumFractionDigits: 1,
}).format(value)
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function startOfWeek(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}

function emptyPoints(period: Period): Point[] {
  const now = new Date()
  if (period === 'day') {
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(now)
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (13 - index))
      return { key: dateKey(date), label: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date), revenue: 0 }
    })
  }
  if (period === 'week') {
    const currentWeek = startOfWeek(now)
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(currentWeek)
      date.setDate(date.getDate() - 7 * (11 - index))
      return { key: dateKey(date), label: `Từ ${new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date)}`, revenue: 0 }
    })
  }
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(date), revenue: 0 }
  })
}

function groupRevenue(orders: RevenueOrder[], period: Period) {
  const points = emptyPoints(period)
  const byKey = new Map(points.map((point) => [point.key, point]))
  for (const order of orders) {
    const date = new Date(order.createdAt)
    const key = period === 'day'
      ? dateKey(date)
      : period === 'week'
        ? dateKey(startOfWeek(date))
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const point = byKey.get(key)
    if (point) point.revenue += order.totalAmount
  }
  return points
}

export function RevenueChart({ orders }: { orders: RevenueOrder[] }) {
  const [period, setPeriod] = useState<Period>('day')
  const data = useMemo(() => groupRevenue(orders, period), [orders, period])
  const total = data.reduce((sum, point) => sum + point.revenue, 0)

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Tổng doanh thu</CardTitle>
          <p className="mt-1 text-2xl font-bold text-slate-900">{money(total)}</p>
          <p className="mt-1 text-xs text-slate-500">Không bao gồm đơn hàng đã hủy</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Khoảng thời gian biểu đồ doanh thu">
          {PERIODS.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className={`rounded-md px-3 py-2 text-xs font-semibold transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${period === item.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={8} interval="preserveStartEnd" />
              <YAxis tickFormatter={compactMoney} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={62} />
              <Tooltip formatter={(value) => [money(Number(value)), 'Doanh thu']} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 8px 20px rgb(15 23 42 / 0.08)' }} />
              <Bar dataKey="revenue" fill="#b88a08" radius={[5, 5, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
