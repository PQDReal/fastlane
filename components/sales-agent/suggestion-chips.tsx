'use client'

import React from 'react'
import type { SalesAgentSuggestion } from '@/lib/sales-agent/contracts'

export function SuggestionChips({
  suggestions,
  disabled,
  onSelect,
}: {
  suggestions: SalesAgentSuggestion[]
  disabled?: boolean
  onSelect: (suggestion: SalesAgentSuggestion) => void
}) {
  if (!suggestions || suggestions.length === 0) return null

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5 pt-1">
      {suggestions.map((sug) => (
        <button
          key={sug.suggestionId}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(sug)}
          className="group flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-900 shadow-xs transition hover:border-amber-400 hover:bg-amber-100 hover:text-amber-950 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span>{sug.label}</span>
        </button>
      ))}
    </div>
  )
}
