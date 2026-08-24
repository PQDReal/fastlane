'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImageIcon, ShieldAlert, X } from 'lucide-react'
import type { AssistantBlock } from '@/lib/sales-agent/contracts'
import { DiagramLegend } from './diagram-legend'

type KnowledgeMediaBlockProps = Extract<AssistantBlock, { kind: 'KNOWLEDGE_MEDIA' }>
type KnowledgeMediaItem = KnowledgeMediaBlockProps['items'][number]

export function KnowledgeMediaBlock({ title, items }: KnowledgeMediaBlockProps) {
  const [selected, setSelected] = useState<KnowledgeMediaItem | null>(null)

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  return (
    <aside className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3" aria-label="Hình minh họa từ tài liệu">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title || 'Hình minh họa từ tài liệu'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <motion.button
            key={`${item.assetId}-${item.citationId}`}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelected(item)}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xs transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className="flex h-32 items-center justify-center bg-slate-100">
              {item.url ? (
                <img src={item.url} alt={item.alt} className="h-full w-full object-contain" loading="lazy" />
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-400" />
              )}
            </div>
            <div className="p-2.5">
              <div className="flex items-start gap-1.5">
                <p className="line-clamp-2 flex-1 text-xs font-semibold leading-4 text-slate-800">{item.title}</p>
                {item.safetyCritical ? (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Hình liên quan an toàn" />
                ) : null}
              </div>
              <code className="mt-1 block truncate text-[9px] text-slate-400">{item.citationId}</code>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selected ? (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelected(null)
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="knowledge-media-title"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <h3 id="knowledge-media-title" className="text-sm font-semibold text-slate-900">{selected.title}</h3>
                  <code className="mt-1 block break-all text-[10px] text-slate-500">{selected.citationId}</code>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Đóng hình minh họa"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex min-h-64 items-center justify-center rounded-xl bg-slate-100 p-2">
                  <img src={selected.url} alt={selected.alt} className="max-h-[62vh] w-full object-contain" />
                </div>
                <p className="text-sm leading-6 text-slate-700">{selected.summary}</p>
                <DiagramLegend labels={selected.diagramLabels} />
                {selected.safetyCritical ? (
                  <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <ShieldAlert className="h-4 w-4" />
                    Nội dung liên quan an toàn; hãy đối chiếu đúng phiên bản tài liệu và dòng xe.
                  </p>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  )
}
