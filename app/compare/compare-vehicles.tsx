'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus, X } from 'lucide-react'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import type { ComparableVehicle } from '@/lib/services/compare-service'

type Props = { vehicles: ComparableVehicle[]; loadError?: boolean }
const MAX = 3

export function CompareVehicles({ vehicles, loadError = false }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selected = useMemo(() => selectedIds.map((id) => vehicles.find((v) => v.id === id)).filter((v): v is ComparableVehicle => Boolean(v)), [selectedIds, vehicles])
  const price = (value: number | null) => value === null ? 'Chưa cập nhật' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
  const choose = (slot: number, id: string) => setSelectedIds((current) => { const next = [...current]; if (!id) { next.splice(slot, 1); return next } next[slot] = id; return next.filter((value, index) => next.indexOf(value) === index) })
  const detailHref = (vehicle: ComparableVehicle) =>
    vehicle.category === 'Ô tô điện' ? `/cars/${vehicle.slug}` : '/bikes'
  const rows = [
    ['Phân loại', (v: ComparableVehicle) => v.category],
    ['Giá từ', (v: ComparableVehicle) => price(v.displayedPrice)],
    ['Mô tả', (v: ComparableVehicle) => v.description],
    ['Tiền đặt cọc', (v: ComparableVehicle) => v.deposit ?? 'Chưa cập nhật'],
    ['Màu sắc', (v: ComparableVehicle) => v.colors.length ? v.colors.join(', ') : 'Chưa cập nhật'],
    ['Phiên bản', (v: ComparableVehicle) => v.variants.length ? v.variants.map((x) => x.name).join(', ') : 'Chưa cập nhật'],
    ['Giá từng phiên bản', (v: ComparableVehicle) => v.variants.length ? v.variants.map((x) => `${x.name}: ${price(x.salePrice ?? x.originalPrice)}`).join(' • ') : 'Chưa cập nhật'],
    ['Tùy chọn', (v: ComparableVehicle) => v.options.length ? v.options.join(', ') : 'Không có tùy chọn bổ sung'],
    ['Tình trạng', (v: ComparableVehicle) => v.status],
  ] as [string, (vehicle: ComparableVehicle) => string][]

  return <main className="flex min-h-screen flex-col bg-background pt-[74px]">
    <Header />
    <div className="border-b border-black/5 bg-muted py-16"><div className="mx-auto max-w-[1440px] px-6 text-center lg:px-12"><div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><Link href="/" className="transition-colors hover:text-brand-600">Trang chủ</Link><ChevronRight size={14} /><span className="text-foreground">So sánh xe</span></div><h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">So sánh mẫu xe</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Chọn tối đa ba mẫu xe đang kinh doanh để so sánh dữ liệu trực tiếp từ hệ thống.</p></div></div>
    <div className="mx-auto w-full max-w-[1440px] px-6 py-16 lg:px-12">
      {loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">Không thể tải danh sách xe. Vui lòng thử lại sau.</div> : vehicles.length === 0 ? <div className="rounded-2xl border border-muted bg-muted/20 p-8 text-center text-muted-foreground">Hiện chưa có mẫu xe đang hoạt động để so sánh.</div> : <div className="overflow-x-auto pb-8"><div className="min-w-[980px]">
        <div className="mb-8 grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5"><div className="flex flex-col justify-end"><h2 className="text-2xl font-bold text-foreground">Tổng quan</h2></div>
          {Array.from({ length: MAX }, (_, slot) => {
            const vehicle = selected[slot]; return <div key={slot} className="relative min-h-[300px] rounded-2xl border border-muted bg-muted/20 p-5">{vehicle ? <><button type="button" onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== vehicle.id))} className="absolute right-3 top-3 rounded-full bg-white p-2 text-muted-foreground shadow-sm hover:text-foreground" aria-label={`Bỏ ${vehicle.name}`}><X size={16} /></button>{vehicle.imageUrl ? <img src={vehicle.imageUrl} alt={vehicle.name} className="mx-auto mb-4 h-32 w-full object-contain" /> : <div className="mx-auto mb-4 flex h-32 items-center justify-center text-muted-foreground">Chưa có ảnh</div>}<h3 className="text-center text-xl font-bold text-foreground">{vehicle.name}</h3><p className="mt-2 text-center font-bold text-brand-600">{price(vehicle.displayedPrice)}</p></> : <div className="flex h-48 flex-col items-center justify-center text-muted-foreground"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-muted bg-white"><Plus size={22} /></div><span className="font-semibold">Chọn mẫu xe</span></div>}
              <select value={vehicle?.id ?? ''} onChange={(e) => choose(slot, e.target.value)} className="mt-4 h-11 w-full rounded-xl border border-muted bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"><option value="">Chọn mẫu xe</option>{['Ô tô điện', 'Xe máy điện'].map((category) => <optgroup key={category} label={category}>{vehicles.filter((option) => option.category === category && (!selectedIds.includes(option.id) || option.id === vehicle?.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>)}</select>
            </div>
          })}
        </div>
        {selected.length ? <div className="border-t border-muted">{rows.map(([label, value], index) => <div key={label} className={`grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5 border-b border-muted py-5 ${index % 2 ? 'bg-muted/20' : ''}`}><div className="pl-4 text-xs font-bold uppercase tracking-wider text-foreground">{label}</div>{Array.from({ length: MAX }, (_, slot) => <div key={slot} className="whitespace-normal px-3 text-center text-sm text-foreground">{selected[slot] ? value(selected[slot]) : '—'}</div>)}</div>)}</div> : <div className="rounded-2xl border border-dashed border-muted py-12 text-center text-muted-foreground">Chọn ít nhất một mẫu xe để bắt đầu so sánh.</div>}
        {selected.length > 0 && <div className="mt-10 grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5"><div />{Array.from({ length: MAX }, (_, slot) => <div key={slot} className="space-y-3 px-3">{selected[slot] && <><Button asChild variant="outline" className="h-12 w-full font-bold"><Link href={detailHref(selected[slot])}>Xem chi tiết</Link></Button><Button asChild className="h-12 w-full font-bold"><Link href={`/test-drive?productId=${selected[slot].id}`}>Đặt lịch lái thử</Link></Button></>}</div>)}</div>}
      </div></div>}
    </div>
    <Footer />
  </main>
}