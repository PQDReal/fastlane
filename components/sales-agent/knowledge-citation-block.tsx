'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { AssistantBlock } from '@/lib/sales-agent/contracts'

type KnowledgeCitationBlockProps = Extract<AssistantBlock, { kind: 'FACT_SUMMARY' }>

/** Renders server-controlled knowledge source pointers returned with a chat turn. */
export function KnowledgeCitationBlock({ facts }: KnowledgeCitationBlockProps) {
  return (
    <motion.details
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="group mt-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs text-slate-600"
    >
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        <span>Nguồn tham khảo ({facts.length})</span>
        <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="space-y-1.5 overflow-hidden border-t border-slate-200/80 px-3 py-2.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {facts.map((fact) => (
            <motion.li
              layout
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              key={`${fact.label}-${fact.citationId ?? fact.value}`}
              data-citation-id={fact.citationId}
              className="leading-relaxed text-slate-600"
            >
              {fact.href ? (
                <Link
                  href={fact.href}
                  className="block rounded-md px-1 py-0.5 text-brand-700 transition hover:bg-white hover:text-brand-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {fact.value}
                </Link>
              ) : fact.value}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </motion.details>
  )
}
