'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type { SalesAgentAction } from '@/lib/sales-agent/contracts'

export function ActionButtons({
  actions,
}: {
  actions: SalesAgentAction[]
}) {
  if (!actions || actions.length === 0) return null

  return (
    <div className="mt-2.5 flex flex-wrap gap-2 pt-1 border-t border-slate-100">
      {actions.map((act) => {
        const href = act.target.type === 'ROUTE'
          ? act.target.href
          : act.target.type === 'EXTERNAL_LINK'
            ? act.target.url
            : '#'

        const isPrimary = act.kind === 'PRIMARY'

        return (
          <Link
            key={act.actionId}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs transition active:scale-95 ${
              isPrimary
                ? 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <span>{act.label}</span>
            <ArrowRight size={12} className={isPrimary ? 'text-white' : 'text-slate-500'} />
          </Link>
        )
      })}
    </div>
  )
}
