'use client'

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, Sparkles } from 'lucide-react'
import type { SalesAgentAction } from '@/lib/sales-agent/contracts'

function ActionButtonsImpl({
  actions,
}: {
  actions: SalesAgentAction[]
}) {
  if (!actions || actions.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mt-3 flex flex-wrap gap-2 pt-1 border-t border-slate-100/90"
    >
      {actions.map((act, idx) => {
        const href = act.target.type === 'ROUTE'
          ? act.target.href
          : act.target.type === 'EXTERNAL_LINK'
            ? act.target.url
            : '#'

        const isPrimary = act.kind === 'PRIMARY'

        return (
          <motion.div
            key={act.actionId}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, delay: idx * 0.04, ease: 'easeOut' }}
          >
            <Link
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-xs transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 ${
                isPrimary
                  ? 'bg-linear-to-r from-brand-600 to-brand-700 text-white hover:from-brand-700 hover:to-brand-800 hover:shadow-sm focus-visible:ring-brand-500'
                  : 'border border-slate-200/90 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-900 focus-visible:ring-brand-500'
              }`}
            >
              <span>{act.label}</span>
              <ArrowRight size={12} className={isPrimary ? 'text-white' : 'text-slate-400 group-hover:text-brand-600'} />
            </Link>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

export const ActionButtons = React.memo(ActionButtonsImpl)

