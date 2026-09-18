'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronRight, ExternalLink, FileText } from 'lucide-react'

import type { AssistantBlock } from '@/lib/sales-agent/contracts'

type KnowledgeCitationBlockProps = Extract<AssistantBlock, { kind: 'FACT_SUMMARY' }>

/** Renders server-controlled knowledge source pointers returned with a chat turn. */
function KnowledgeCitationBlockImpl({ facts }: KnowledgeCitationBlockProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!facts || facts.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mt-3 overflow-hidden rounded-xl border border-slate-200/80 bg-linear-to-b from-slate-50/90 to-white text-xs shadow-2xs"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-slate-600 transition hover:bg-slate-100/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5">
          <BookOpen size={13} className="text-brand-600 shrink-0" />
          <span>Nguồn tham khảo</span>
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold text-brand-700">
            {facts.length}
          </span>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="text-slate-400"
        >
          <ChevronRight size={14} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-slate-100 bg-slate-50/40"
          >
            <ul className="space-y-1 p-2" aria-live="polite">
              {facts.map((fact, index) => (
                <motion.li
                  key={`${fact.label}-${fact.citationId ?? fact.value}`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.14, delay: index * 0.03 }}
                  data-citation-id={fact.citationId}
                >
                  {fact.href ? (
                    <Link
                      href={fact.href}
                      className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-white hover:text-brand-700 hover:shadow-2xs active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText size={12} className="text-slate-400 group-hover:text-brand-600 shrink-0" />
                        <span className="truncate">{fact.value}</span>
                      </div>
                      <ExternalLink size={11} className="text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-brand-600 shrink-0" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600">
                      <FileText size={12} className="text-slate-400 shrink-0" />
                      <span>{fact.value}</span>
                    </div>
                  )}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export const KnowledgeCitationBlock = React.memo(KnowledgeCitationBlockImpl)

