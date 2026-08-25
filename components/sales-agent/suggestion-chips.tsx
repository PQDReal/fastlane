'use client'

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="mt-2.5 flex flex-wrap gap-1.5 pt-1"
      aria-label="Gợi ý tiếp theo"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {suggestions.map((sug) => (
          <motion.button
            layout
            key={sug.suggestionId}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(sug)}
            initial={{ opacity: 0, y: 3, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="group flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-900 shadow-xs transition-colors hover:border-amber-400 hover:bg-amber-100 hover:text-amber-950 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <span>{sug.label}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
