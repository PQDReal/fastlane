'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

type Suggestion = {
  ref_id: string
  name: string
  address: string
  display: string
}

export function VietmapSearchBox({
  onSelect,
}: {
  onSelect: (location: { lat: number; lng: number; address: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  
  const [apiKey, setApiKey] = useState<string | null | undefined>(
    process.env.NEXT_PUBLIC_VIETMAP_SEARCH_API_KEY || process.env.NEXT_PUBLIC_VIETMAP_API_KEY || undefined
  )

  useEffect(() => {
    if (apiKey !== undefined) return
    let cancelled = false

    void fetch('/api/v1/maps/vietmap-config', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: { searchApiKey?: string | null } }
        if (!response.ok) throw new Error('Không thể đọc cấu hình VietMap.')
        if (!cancelled) setApiKey(payload.data?.searchApiKey?.trim() || null)
      })
      .catch((error) => {
        if (!cancelled) setApiKey(null)
      })

    return () => {
      cancelled = true
    }
  }, [apiKey])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query.trim() || !apiKey) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`https://maps.vietmap.vn/api/autocomplete/v3?apikey=${apiKey}&text=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSuggestions(data.map((item: any) => ({
              ref_id: item.ref_id,
              name: item.name,
              address: item.address,
              display: item.display
            })))
          } else {
            setSuggestions([])
          }
          setOpen(true)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }, 400)

    return () => clearTimeout(timer)
  }, [query, apiKey])

  const handleSelect = async (suggestion: Suggestion) => {
    setQuery(suggestion.name)
    setOpen(false)
    if (!apiKey) return

    try {
      const res = await fetch(`https://maps.vietmap.vn/api/place/v3?apikey=${apiKey}&refid=${suggestion.ref_id}`)
      const data = await res.json()
      if (data && data.lat && data.lng) {
        onSelect({
          lat: data.lat,
          lng: data.lng,
          address: data.display || suggestion.display
        })
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div ref={wrapperRef} className="relative mt-4">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-brand-700">Tìm vị trí</p>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-600" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          placeholder="Nhập địa chỉ, khu vực..."
          className="w-full rounded-xl border-0 bg-slate-100 py-2.5 pl-9 pr-10 text-sm font-medium text-slate-900 transition-colors placeholder:font-normal focus:bg-white focus:ring-2 focus:ring-brand-500"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 size={16} className="animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.ref_id}
              onClick={() => handleSelect(suggestion)}
              className="cursor-pointer px-4 py-2 text-sm hover:bg-slate-50"
            >
              <div className="font-medium text-slate-900">{suggestion.name}</div>
              <div className="text-xs text-slate-500 line-clamp-1">{suggestion.address}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
