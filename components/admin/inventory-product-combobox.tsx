'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { searchInventoryProducts } from '@/lib/admin-inventory-product-search'

type InventoryProductComboboxProps = {
  options: string[]
  value: string
  onChange: (value: string) => void
  allLabel: string
  ariaLabel: string
  disabled?: boolean
}

function HighlightedProductName({
  label,
  ranges,
}: {
  label: string
  ranges: Array<[number, number]>
}) {
  if (ranges.length === 0) return label

  const fragments: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (start > cursor) fragments.push(<span key={`text-${index}`}>{label.slice(cursor, start)}</span>)
    fragments.push(<mark key={`match-${index}`} className="rounded bg-amber-200 px-0.5 font-bold text-slate-950">{label.slice(start, end)}</mark>)
    cursor = end
  })
  if (cursor < label.length) fragments.push(<span key="text-last">{label.slice(cursor)}</span>)
  return fragments
}

export function InventoryProductCombobox({
  options,
  value,
  onChange,
  allLabel,
  ariaLabel,
  disabled = false,
}: InventoryProductComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const [query, setQuery] = useState(value === 'ALL' ? '' : value)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const matches = useMemo(() => searchInventoryProducts(options, query), [options, query])
  const entries = useMemo(() => [
    ...(query.trim() === '' ? [{ value: 'ALL', label: allLabel, highlightRanges: [] as Array<[number, number]> }] : []),
    ...matches.map((match) => ({ value: match.label, label: match.label, highlightRanges: match.highlightRanges })),
  ], [allLabel, matches, query])

  useEffect(() => {
    setQuery(value === 'ALL' ? '' : value)
  }, [value])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, options])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setQuery(value === 'ALL' ? '' : value)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [value])

  const choose = (nextValue: string) => {
    onChange(nextValue)
    setQuery(nextValue === 'ALL' ? '' : nextValue)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="relative">
      <div className={`flex h-10 items-center rounded-md border bg-white transition focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60' : 'border-slate-200'}`}>
        <Search size={15} className="ml-3 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && entries[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          disabled={disabled}
          value={query}
          placeholder={allLabel}
          onFocus={(event) => {
            setOpen(true)
            if (value !== 'ALL' && query === value) event.currentTarget.select()
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((index) => entries.length === 0 ? 0 : (index + 1) % entries.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((index) => entries.length === 0 ? 0 : (index - 1 + entries.length) % entries.length)
            } else if (event.key === 'Enter' && open && entries[activeIndex]) {
              event.preventDefault()
              choose(entries[activeIndex].value)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              setQuery(value === 'ALL' ? '' : value)
            } else if (event.key === 'Tab') {
              setOpen(false)
              setQuery(value === 'ALL' ? '' : value)
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
        />
        {(query || value !== 'ALL') && !disabled ? (
          <button type="button" onClick={() => choose('ALL')} className="mr-1 rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Xóa sản phẩm đã chọn"><X size={14} /></button>
        ) : (
          <ChevronsUpDown size={15} className="mr-3 shrink-0 text-slate-400" aria-hidden="true" />
        )}
      </div>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.99 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            <div id={listboxId} role="listbox" aria-label="Chọn sản phẩm">
              {entries.map((entry, index) => {
                const selected = value === entry.value
                const active = activeIndex === index
                return (
                  <button
                    id={`${listboxId}-${index}`}
                    key={entry.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(entry.value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active ? 'bg-amber-50 text-slate-950' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className="min-w-0 truncate"><HighlightedProductName label={entry.label} ranges={entry.highlightRanges} /></span>
                    {selected && <Check size={15} className="shrink-0 text-brand-600" aria-hidden="true" />}
                  </button>
                )
              })}
              {entries.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Không tìm thấy sản phẩm phù hợp.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
