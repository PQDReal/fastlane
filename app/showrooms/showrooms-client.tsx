'use client'

import { useEffect, useMemo, useState } from 'react'
import { CarFront, Check, ChevronDown, Search, Bike, Wrench } from 'lucide-react'
import {
  ShowroomLocation,
  VietMapLocationMap,
} from '@/components/showrooms/vietmap-location-map'
import { VietmapSearchBox } from '@/components/showrooms/vietmap-search-box'
import type { Showroom } from '@/lib/showrooms/types'

function normalizeProvinceName(value: string | null | undefined) {
  if (!value) return ''
  return value.normalize('NFC').toLocaleLowerCase('vi').replace(/^(tỉnh|thành phố|tp\.?|tp)\s+/i, '').replace(/\s+/g, ' ').trim()
}

function toLocation(showroom: Showroom): ShowroomLocation {
  return {
    id: showroom.id,
    name: showroom.name,
    address: [showroom.address, showroom.districtName, showroom.provinceName].filter(Boolean).join(', '),
    lat: showroom.latitude,
    lng: showroom.longitude,
    hotline: showroom.hotline ?? undefined,
    category: showroom.vehicleType,
    provinceId: normalizeProvinceName(showroom.provinceName) || showroom.provinceSourceId || showroom.provinceName,
    provinceName: showroom.provinceName,
  }
}

export function ShowroomsClient() {
  const [locations, setLocations] = useState<ShowroomLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [provinceId, setProvinceId] = useState('')
  const [categories, setCategories] = useState<Array<ShowroomLocation['category']>>(['car', 'motorbike', 'workshop'])
  const [selectedLocation, setSelectedLocation] = useState<ShowroomLocation | null>(null)
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number; address: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetch('/api/v1/showrooms', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/v1/after-sales/workshops', { cache: 'no-store' }).then(r => r.json())
    ])
      .then(([showroomsPayload, workshopsPayload]) => {
        if (cancelled) return
        
        let allLocations: ShowroomLocation[] = []
        
        if (showroomsPayload.data) {
          allLocations = allLocations.concat(showroomsPayload.data.map(toLocation))
        }
        
        if (workshopsPayload.success && Array.isArray(workshopsPayload.data)) {
          const workshops: ShowroomLocation[] = workshopsPayload.data.map((workshop: any) => ({
            id: `ws-${workshop.id}`,
            name: workshop.name,
            address: workshop.address,
            lat: workshop.latitude ?? 0,
            lng: workshop.longitude ?? 0,
            hotline: workshop.phone,
            category: 'workshop',
            provinceId: normalizeProvinceName(workshop.city) || workshop.city,
            provinceName: workshop.city,
          }))
          allLocations = allLocations.concat(workshops)
        }
        
        setLocations(allLocations)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách showroom.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const provinces = useMemo(() => {
    const unique = new Map<string, string>()
    locations.forEach((location) => {
      if (location.provinceId && location.provinceName) {
        unique.set(location.provinceId, location.provinceName)
      }
    })
    return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1], 'vi'))
  }, [locations])

  const filteredLocations = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('vi')

    return locations.filter((location) => {
      const haystack = `${location.name} ${location.address}`.toLocaleLowerCase('vi')
      return (
        (!normalizedKeyword || haystack.includes(normalizedKeyword)) &&
        (!provinceId || location.provinceId === provinceId) &&
        categories.includes(location.category)
      )
    })
  }, [categories, keyword, locations, provinceId])

  const toggleCategory = (category: ShowroomLocation['category']) => {
    setCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category])
    setSelectedLocation(null)
  }

  return (
    <div className="grid gap-5 items-start lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Tìm địa điểm</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Showroom & điểm dịch vụ</h2>
          </div>
        </div>

        <div className="mt-6">
          <VietmapSearchBox onSelect={(location) => {
            setSearchedLocation(location)
            setSelectedLocation(null)
          }} />
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-brand-700">Lọc danh sách showroom</p>
          <label className="relative mt-2 block">
            <span className="sr-only">Lọc theo tên hoặc địa chỉ</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setSelectedLocation(null)
            }}
            placeholder="Tên hoặc địa chỉ"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="relative mt-4 block">
          <span className="sr-only">Tỉnh thành</span>
          <select
            value={provinceId}
            onChange={(event) => {
              setProvinceId(event.target.value)
              setSelectedLocation(null)
            }}
            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Tất cả tỉnh thành</option>
            {provinces.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        </label>

        <div className="mt-7 border-t border-slate-100 pt-5">
          <p className="text-sm font-semibold text-slate-900">Loại địa điểm</p>
          <div className="mt-3 space-y-2">
            {[
              { value: 'car' as const, label: 'Showroom ô tô', icon: CarFront },
              { value: 'motorbike' as const, label: 'Showroom xe máy điện', icon: Bike },
              { value: 'workshop' as const, label: 'Xưởng dịch vụ', icon: Wrench },
            ].map(({ value, label, icon: Icon }) => {
              const checked = categories.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleCategory(value)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-pressed={checked}
                >
                  <span className={`grid h-5 w-5 place-items-center rounded border ${checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-transparent'}`}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <Icon size={17} className={checked ? 'text-brand-700' : 'text-slate-400'} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-7 flex items-center justify-start border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => { setKeyword(''); setProvinceId(''); setCategories(['car', 'motorbike', 'workshop']); setSelectedLocation(null) }}
            className="text-xs font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Xóa bộ lọc
          </button>
        </div>
        </div>

        <div className="mt-4 max-h-[350px] space-y-2 overflow-y-auto pr-1 lg:max-h-[390px]">
          {loading && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Đang tải dữ liệu showroom...</p>}
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          {filteredLocations.slice(0, 100).map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={() => setSelectedLocation(location)}
              className={`w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selectedLocation?.id === location.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <p className="text-sm font-semibold text-slate-900">{location.name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{location.address}</p>
            </button>
          ))}
          {filteredLocations.length > 100 && <p className="px-2 text-xs text-slate-500">Đang hiển thị 100 địa điểm đầu tiên. Hãy dùng bộ lọc để thu hẹp kết quả.</p>}
          {filteredLocations.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Không tìm thấy địa điểm phù hợp.</p>}
        </div>
      </aside>

      <VietMapLocationMap locations={filteredLocations} selectedLocation={selectedLocation} searchedLocation={searchedLocation} onSelectLocation={setSelectedLocation} />
    </div>
  )
}
