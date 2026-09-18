'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { SalesAgentSuggestion } from '@/lib/sales-agent/contracts'

function SuggestionChipsImpl({
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mt-2.5 flex flex-wrap gap-1.5 pt-1"
      aria-label="Gợi ý câu hỏi tiếp theo"
      aria-live="polite"
    >
      {suggestions.map((sug, idx) => (
        <motion.button
          key={sug.suggestionId}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(sug)}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, delay: idx * 0.035, ease: 'easeOut' }}
          className="group inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-linear-to-r from-amber-50/90 to-amber-100/50 px-3 py-1.5 text-[11px] font-medium text-amber-900 shadow-2xs transition-all hover:border-amber-400 hover:bg-amber-100 hover:text-amber-950 hover:shadow-xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <Sparkles size={11} className="text-amber-500 transition group-hover:rotate-12 group-hover:scale-110" />
          <span>{sug.label}</span>
        </motion.button>
      ))}
    </motion.div>
  )
}

export const SuggestionChips = React.memo(SuggestionChipsImpl)

