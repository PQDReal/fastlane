'use client'

import { ChevronDown } from 'lucide-react'

type CombinationMultiSelectProps = {
  label: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  disabled?: boolean
}

export function CombinationMultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled = false,
}: CombinationMultiSelectProps) {
  const uniqueOptions = Array.from(new Set(options.filter(Boolean)))
  const selectedSet = new Set(selected.filter((value) => uniqueOptions.includes(value)))
  const selectedLabels = uniqueOptions.filter((value) => selectedSet.has(value))
  const summary = selectedLabels.length === 0
    ? 'Chưa chọn'
    : selectedLabels.length === uniqueOptions.length
      ? `Tất cả (${selectedLabels.length})`
      : selectedLabels.join(', ')

  const toggle = (value: string) => {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(uniqueOptions.filter((option) => next.has(option)))
  }

  return (
    <details className="group relative" onClick={(event) => event.stopPropagation()}>
      <summary
        aria-label={label}
        className={`flex h-10 list-none items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition [&::-webkit-details-marker]:hidden ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-300'}`}
        onClick={(event) => {
          if (disabled) event.preventDefault()
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left" title={summary}>{summary}</span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      {!disabled && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 px-2 pb-2 text-xs font-semibold">
            <button type="button" className="text-brand-700 hover:underline" onClick={() => onChange(uniqueOptions)}>Chọn tất cả</button>
            <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => onChange([])}>Bỏ chọn</button>
          </div>
          {uniqueOptions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">Chưa có lựa chọn khả dụng.</p>
          ) : uniqueOptions.map((option) => {
            const checked = selectedSet.has(option)
            return (
              <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition ${checked ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option)} className="h-4 w-4 accent-amber-600" />
                <span className="min-w-0 flex-1 truncate" title={option}>{option}</span>
                {checked && <span className="text-[10px] font-bold uppercase text-brand-700">Đã áp dụng</span>}
              </label>
            )
          })}
        </div>
      )}
    </details>
  )
}
