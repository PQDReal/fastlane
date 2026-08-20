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
const NO_DATA = 'Chưa có dữ liệu'
const CAR = 'Ô tô điện'
const CATEGORIES = [CAR, 'Xe máy điện']

export function CompareVehicles({ vehicles, loadError = false }: Props) {
  const [selectedIds, setSelectedIds] = useState<(string | null)[]>(Array(MAX).fill(null))
  const selected = useMemo(() => selectedIds.map((id) => id ? vehicles.find((v) => v.id === id) ?? null : null), [selectedIds, vehicles])
  const count = selected.filter(Boolean).length
  const category = selected[0]?.category ?? null
  const specKeys = useMemo(() => {
    const keys = new Set<string>()
    selected.forEach((vehicle) => vehicle && Object.keys(vehicle.specifications).forEach((key) => keys.add(key)))
    return [...keys]
  }, [selected])
  const price = (value: number | null) => value === null ? NO_DATA : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)

  function choose(slot: number, id: string) {
    setSelectedIds((current) => {
      if (!id && slot === 0) return Array(MAX).fill(null)
      const next = [...current]
      if (!id) { next[slot] = null; return next }
      const candidate = vehicles.find((vehicle) => vehicle.id === id)
      if (!candidate) return current
      if (slot === 0) {
        next[0] = id
        for (let index = 1; index < MAX; index += 1) {
          const item = vehicles.find((vehicle) => vehicle.id === next[index])
          if (!item || item.category !== candidate.category || item.id === id) next[index] = null
        }
      } else {
        const first = vehicles.find((vehicle) => vehicle.id === next[0])
        if (!first || first.category !== candidate.category) return current
        next[slot] = id
      }
      next.forEach((value, index) => { if (value && next.indexOf(value) !== index) next[index] = null })
      return next
    })
  }

  function remove(slot: number) {
    setSelectedIds((current) => {
      if (slot === 0) return Array(MAX).fill(null)
      const next = [...current]; next[slot] = null; return next
    })
  }

  function getUniqueVersions(vehicle: ComparableVehicle) {
    const map = new Map<string, number>()
    const isSuffix = (full: string, part: string) => full === part || full.endsWith(` ${part}`)

    vehicle.variants.forEach((v) => {
      const baseName = (v.version || v.name.split(' - ')[0] || v.name).trim()
      const currentPrice = v.salePrice ?? v.originalPrice
      
      let finalKey = baseName
      for (const key of map.keys()) {
        if (isSuffix(key, baseName) || isSuffix(baseName, key)) {
          finalKey = key.length < baseName.length ? key : baseName
          if (finalKey !== key) {
            const oldPrice = map.get(key)!
            map.delete(key)
            map.set(finalKey, oldPrice)
          }
          break
        }
      }

      if (!map.has(finalKey) || currentPrice < map.get(finalKey)!) {
        map.set(finalKey, currentPrice)
      }
    })
    return Array.from(map.entries())
  }

  const rows: [string, (vehicle: ComparableVehicle) => string][] = [
    ['Phân loại', (vehicle) => vehicle.category],
    ['Giá từ', (vehicle) => price(vehicle.displayedPrice)],
    ['Phiên bản', (vehicle) => getUniqueVersions(vehicle).map(([name]) => name).join(', ') || NO_DATA],
    ['Giá từng phiên bản', (vehicle) => getUniqueVersions(vehicle).map(([name, p]) => `${name}: ${price(p)}`).join(' • ') || NO_DATA],
  ]
  const comparisonRow = (label: string, value: (vehicle: ComparableVehicle) => string, index: number) => <div key={label} className={`grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5 border-b border-muted py-5 ${index % 2 ? 'bg-muted/20' : ''}`}><div className="pl-4 text-xs font-bold uppercase tracking-wider text-foreground">{label}</div>{Array.from({ length: MAX }, (_, slot) => <div key={slot} className="whitespace-normal px-3 text-center text-sm text-foreground">{selected[slot] ? value(selected[slot]) : '—'}</div>)}</div>

  return <main className="flex min-h-screen flex-col bg-background pt-[74px]">
    <Header />
    <div className="border-b border-black/5 bg-muted py-16"><div className="mx-auto max-w-[1440px] px-6 text-center lg:px-12"><div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><Link href="/" className="transition-colors hover:text-brand-600">Trang chủ</Link><ChevronRight size={14} /><span className="text-foreground">So sánh xe</span></div><h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">So sánh mẫu xe</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Chọn tối đa ba mẫu xe cùng loại để so sánh thông số trực tiếp từ hệ thống.</p></div></div>
    <div className="mx-auto w-full max-w-[1440px] px-6 py-16 lg:px-12">
      {loadError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">Không thể tải danh sách xe. Vui lòng thử lại sau.</div> : vehicles.length === 0 ? <div className="rounded-2xl border border-muted bg-muted/20 p-8 text-center text-muted-foreground">Hiện chưa có mẫu xe đang hoạt động để so sánh.</div> : <div className="overflow-x-auto pb-8"><div className="min-w-[980px]">
        <div className="mb-8 grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5"><div className="flex flex-col justify-end"><h2 className="text-2xl font-bold text-foreground">Tổng quan</h2></div>
          {Array.from({ length: MAX }, (_, slot) => {
            const vehicle = selected[slot]
            const disabled = slot > 0 && !category
            const options = slot === 0 ? vehicles : vehicles.filter((item) => item.category === category)
            return <div key={slot} className="relative min-h-[300px] rounded-2xl border border-muted bg-muted/20 p-5">
              {vehicle ? <><button type="button" onClick={() => remove(slot)} className="absolute right-3 top-3 rounded-full bg-white p-2 text-muted-foreground shadow-sm hover:text-foreground" aria-label={`Bỏ ${vehicle.name}`}><X size={16} /></button>{vehicle.imageUrl ? <img src={vehicle.imageUrl} alt={vehicle.name} className="mx-auto mb-4 h-32 w-full object-contain" /> : <div className="mx-auto mb-4 flex h-32 items-center justify-center text-muted-foreground">Chưa có ảnh</div>}<h3 className="text-center text-xl font-bold text-foreground">{vehicle.name}</h3><p className="mt-2 text-center font-bold text-brand-600">{price(vehicle.displayedPrice)}</p></> : <div className="flex h-48 flex-col items-center justify-center text-muted-foreground"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-muted bg-white"><Plus size={22} /></div><span className="font-semibold">{disabled ? 'Chọn xe 1 trước' : 'Chọn mẫu xe'}</span></div>}
              <select value={vehicle?.id ?? ''} disabled={disabled} onChange={(event) => choose(slot, event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-muted bg-white px-3 text-sm focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"><option value="">{disabled ? 'Chọn xe 1 trước' : 'Chọn mẫu xe'}</option>{slot === 0 ? CATEGORIES.map((group) => <optgroup key={group} label={group}>{options.filter((option) => option.category === group && (!selectedIds.includes(option.id) || option.id === vehicle?.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>) : options.filter((option) => !selectedIds.includes(option.id) || option.id === vehicle?.id).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            </div>
          })}
        </div>
        {count ? <div className="border-t border-muted">{rows.map(([label, value], index) => comparisonRow(label, value, index))}<div className="border-b border-muted bg-foreground px-4 py-4 text-sm font-bold uppercase tracking-wider text-background">Thông số kỹ thuật</div>{specKeys.length ? specKeys.map((key, index) => comparisonRow(key, (vehicle) => vehicle.specifications[key] ?? NO_DATA, index)) : <div className="border-b border-muted py-8 text-center text-muted-foreground">{NO_DATA}</div>}</div> : <div className="rounded-2xl border border-dashed border-muted py-12 text-center text-muted-foreground">Chọn ít nhất một mẫu xe để bắt đầu so sánh.</div>}
        {count > 0 && <div className="mt-10 grid grid-cols-[190px_repeat(3,minmax(240px,1fr))] gap-5"><div />{Array.from({ length: MAX }, (_, slot) => <div key={slot} className="space-y-3 px-3">{selected[slot] && <><Button asChild variant="outline" className="h-12 w-full font-bold"><Link href={selected[slot].category === CAR ? `/cars/${selected[slot].slug}` : '/bikes'}>Xem chi tiết</Link></Button><Button asChild className="h-12 w-full font-bold"><Link href={`/test-drive?productId=${selected[slot].id}`}>Đặt lịch lái thử</Link></Button></>}</div>)}</div>}
      </div></div>}
    </div>
    <Footer />
  </main>
}