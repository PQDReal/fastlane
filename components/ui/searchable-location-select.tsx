'use client'

import { useId, useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, Loader2, Check } from 'lucide-react'

export type LocationOption = { code: number; name: string }

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd')
}

export function SearchableLocationSelect({
  label, options, value, onChange, placeholder, disabled = false, loading = false, autoOpen = false,
}: {
  label: string
  options: LocationOption[]
  value: string
  onChange: (option: LocationOption | null) => void
  placeholder: string
  disabled?: boolean
  loading?: boolean
  autoOpen?: boolean
}) {
  const listId = useId()
  const selected = options.find((option) => String(option.code) === value || option.name === value)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setQuery(selected?.name ?? '') }, [selected?.name])

  useEffect(() => {
    if (autoOpen && !disabled && !loading) {
      setOpen(true)
      inputRef.current?.focus()
    }
  }, [autoOpen, disabled, loading])

  const normalizedQuery =
    selected && query.trim() === selected.name
      ? ''
      : searchable(query.trim())
  const filtered = options.filter((option) => !normalizedQuery || searchable(option.name).includes(normalizedQuery))

  return (
    <div className="relative text-sm font-medium text-gray-700" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
      <label htmlFor={`${listId}-input`} className="text-sm font-semibold text-slate-700 mb-2 block">{label} <span className="text-red-500">*</span></label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          disabled={disabled || loading}
          value={query}
          onFocus={(e) => {
            setOpen(true)
            e.target.select()
          }}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            if (!selected || next !== selected.name) onChange(null)
          }}
          placeholder={loading ? 'Đang tải dữ liệu...' : placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 font-normal focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        {loading ? <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" /> : <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />}
      </div>
      <input className="sr-only" tabIndex={-1} required value={value} onChange={() => undefined} aria-hidden="true" />
      {open && !disabled && !loading && (
        <div id={listId} role="listbox" className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
          {filtered.length ? filtered.map((option) => {
            const active = selected?.code === option.code
            return (
              <button key={option.code} type="button" role="option" aria-selected={active} onClick={() => { onChange(option); setQuery(option.name); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-normal transition active:scale-[0.99] ${active ? 'bg-slate-100 text-slate-900 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                <span>{option.name}</span>
                {active && <Check className="h-4 w-4" />}
              </button>
            )
          }) : <p className="px-3 py-6 text-center text-sm font-normal text-gray-500">Không tìm thấy kết quả phù hợp.</p>}
        </div>
      )}
    </div>
  )
}
