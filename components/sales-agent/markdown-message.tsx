'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldAlert, X, ZoomIn } from 'lucide-react'
import type { AssistantBlock } from '@/lib/sales-agent/contracts'
import { isAllowedKnowledgeMediaUrl } from '@/lib/sales-agent/knowledge/media-url'
import { knowledgeMediaReference } from '@/lib/sales-agent/knowledge/media-reference'

export type KnowledgeMediaItem = Extract<AssistantBlock, { kind: 'KNOWLEDGE_MEDIA' }>['items'][number]

function safeInternalHref(href?: string, streaming = false) {
  if (streaming) return null
  if (!href) return null
  if (href.startsWith('#')) return href
  if (href.startsWith('/') && !href.startsWith('//')) return href
  return null
}

function safeImageUrl(src?: string) {
  if (!src) return null
  const trimmed = src.trim()
  return isAllowedKnowledgeMediaUrl(trimmed) ? trimmed : null
}

function preprocessInlineKnowledgeImages(content: string, mediaItems?: KnowledgeMediaItem[]): string {
  if (!content) return ''
  let result = content

  // Replace raw [img: itemXXXXX.png] tags with matching media URLs if available
  if (mediaItems && mediaItems.length > 0) {
    result = result.replace(/\[media:\s*(\d+)\]/gi, (match, rawPosition: string) => {
      const reference = knowledgeMediaReference(Number(rawPosition))
      const matchedItem = mediaItems.find((item) => item.reference === reference)
        || mediaItems[Number(rawPosition) - 1]
      if (!matchedItem?.url || !isAllowedKnowledgeMediaUrl(matchedItem.url)) return match
      return `\n\n![${matchedItem.title || matchedItem.alt || 'Hình minh họa'}](${matchedItem.url})\n\n`
    })

    result = result.replace(/\[img:\s*([^\]]+)\]/gi, (match, rawName: string) => {
      const cleanName = rawName.trim().replace(/\.png$/i, '')
      const matchedItem = mediaItems.find((item) => {
        if (!item.url) return false
        const filename = item.url.split('/').pop()?.replace(/\.png$/i, '')
        return filename === cleanName || item.title.includes(cleanName) || item.summary?.includes(cleanName)
      })
      if (matchedItem && matchedItem.url) {
        return `\n\n![${matchedItem.title || matchedItem.alt || 'Hình minh họa'}](${matchedItem.url})\n\n`
      }
      return match
    })
  }

  return result
}

function normalizeMathDelimiters(content: string) {
  return content
    .split(/(```[\s\S]*?(?:```|$))/g)
    .map((block) => {
      if (block.startsWith('```')) return block
      return block
        .split(/(`[^`\n]*`)/g)
        .map((part) => {
          if (part.startsWith('`')) return part
          return part
            .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n$$\n${math.trim()}\n$$\n`)
            .replace(/\\\((.+?)\\\)/g, (_match, math: string) => `$${math}$`)
        })
        .join('')
    })
    .join('')
}

function completeCodeFence(content: string, streaming: boolean) {
  if (!streaming) return content
  const fences = content.match(/(^|\n)```/g)
  if (!fences || fences.length % 2 === 0) return content
  return `${content}\n\`\`\``
}

function completeMarkdownTable(content: string, streaming: boolean) {
  if (!streaming) return content

  const lines = content.split('\n')
  if (lines.length === 0) return content

  const lastLine = lines[lines.length - 1].trim()
  const tableLines: string[] = []

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('|') || (line.includes('|') && line.endsWith('|'))) {
      tableLines.unshift(line)
    } else {
      break
    }
  }

  if (tableLines.length === 0) return content

  if (tableLines.length === 1) {
    const headerLine = tableLines[0]
    const rawCols = headerLine.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    const colCount = Math.max(1, rawCols.length || 2)
    const delimiter = `\n| ${Array(colCount).fill('---').join(' | ')} |`
    return `${content}${headerLine.endsWith('|') ? '' : ' |'}${delimiter}`
  }

  if (lastLine.startsWith('|') && !lastLine.endsWith('|')) {
    return `${content} |`
  }

  return content
}

function InlineImage({
  src,
  alt,
  mediaItems,
}: {
  src?: string
  alt?: string
  mediaItems?: KnowledgeMediaItem[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const validUrl = safeImageUrl(src)
  const matchedMeta = mediaItems?.find((item) => item.url === validUrl || item.alt === alt)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  if (!validUrl) {
    return alt ? <span className="text-xs italic text-slate-500">[Hình ảnh: {alt}]</span> : null
  }

  const caption = alt || matchedMeta?.title || matchedMeta?.summary

  return (
    <figure className="my-3 block overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 transition hover:border-brand-300">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(true)
          }
        }}
        className="group relative flex max-h-72 w-full cursor-zoom-in items-center justify-center overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <img
          src={validUrl}
          alt={caption || 'Hình minh họa tài liệu'}
          className="max-h-72 w-full object-contain transition duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-slate-900/65 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-xs transition group-hover:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>Phóng to</span>
        </div>
      </div>
      {caption && (
        <figcaption className="flex items-center justify-between gap-2 border-t border-slate-200/80 px-3 py-2 text-xs text-slate-600">
          <span className="line-clamp-2 font-medium">{caption}</span>
          {matchedMeta?.safetyCritical && (
            <span className="flex shrink-0 items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              <ShieldAlert className="h-3 w-3" />
              Lưu ý an toàn
            </span>
          )}
        </figcaption>
      )}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false)
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{caption || 'Hình minh họa'}</h3>
                  {matchedMeta?.citationId && (
                    <code className="mt-0.5 block break-all text-[10px] text-slate-500">{matchedMeta.citationId}</code>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Đóng"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex min-h-64 items-center justify-center rounded-xl bg-slate-100 p-2">
                  <img src={validUrl} alt={caption || ''} className="max-h-[65vh] w-full object-contain" />
                </div>
                {matchedMeta?.summary && (
                  <p className="text-sm leading-6 text-slate-700">{matchedMeta.summary}</p>
                )}
                {matchedMeta?.safetyCritical && (
                  <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Nội dung liên quan an toàn; hãy đối chiếu đúng phiên bản tài liệu và dòng xe.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </figure>
  )
}

export function MarkdownMessage({
  content,
  mediaItems,
  streaming = false,
}: {
  content: string
  mediaItems?: KnowledgeMediaItem[]
  streaming?: boolean
}) {
  const preprocessed = preprocessInlineKnowledgeImages(content, mediaItems)
  const markdown = normalizeMathDelimiters(completeMarkdownTable(completeCodeFence(preprocessed, streaming), streaming))

  return (
    <div className="min-w-0 max-w-full [overflow-wrap:anywhere] [&_.katex-display]:my-2 [&_.katex-display]:box-content [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-3 [&_.katex-display]:[scrollbar-width:thin] [&_.katex-display>.katex]:min-w-max">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
        components={{
          h1: ({ node: _node, ...props }) => <h2 className="mb-1.5 mt-3 text-base font-bold text-slate-900 first:mt-0" {...props} />,
          h2: ({ node: _node, ...props }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-slate-900 first:mt-0" {...props} />,
          h3: ({ node: _node, ...props }) => <h4 className="mb-1 mt-2.5 text-sm font-semibold text-slate-900 first:mt-0" {...props} />,
          h4: ({ node: _node, ...props }) => <h5 className="mb-1 mt-2 text-sm font-medium text-slate-900 first:mt-0" {...props} />,
          p: ({ node: _node, ...props }) => <p className="my-1.5 text-sm leading-[1.375rem] text-slate-700 first:mt-0 last:mb-0" {...props} />,
          strong: ({ node: _node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
          ul: ({ node: _node, ...props }) => <ul className="my-1.5 list-disc space-y-1 pl-5 text-sm text-slate-700" {...props} />,
          ol: ({ node: _node, ...props }) => <ol className="my-1.5 list-decimal space-y-1 pl-5 text-sm text-slate-700" {...props} />,
          li: ({ node: _node, ...props }) => <li className="pl-0.5 leading-[1.375rem] marker:text-brand-600" {...props} />,
          blockquote: ({ node: _node, ...props }) => <blockquote className="my-2 border-l-2 border-brand-400 bg-brand-50/70 px-3 py-2 text-sm text-slate-600" {...props} />,
          hr: ({ node: _node, ...props }) => <hr className="my-3 border-slate-200" {...props} />,
          table: ({ node: _node, ...props }) => <div data-scrollable className="my-2 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[340px] border-collapse text-left text-xs" {...props} /></div>,
          thead: ({ node: _node, ...props }) => <thead className="bg-slate-100 text-slate-700" {...props} />,
          tbody: ({ node: _node, ...props }) => <tbody className="divide-y divide-slate-100" {...props} />,
          tr: ({ node: _node, ...props }) => <tr className="align-top" {...props} />,
          th: ({ node: _node, ...props }) => <th className="border-r border-slate-200 px-2.5 py-2 font-semibold last:border-r-0" {...props} />,
          td: ({ node: _node, ...props }) => <td className="border-r border-slate-100 px-2.5 py-2 leading-[1.125rem] text-slate-600 [overflow-wrap:anywhere] last:border-r-0" {...props} />,
          code: ({ node: _node, className, children, ...props }) => {
            const block = Boolean(className) || String(children).includes('\n')
            return block
              ? <code className={`${className ?? ''} text-xs text-slate-100`} {...props}>{children}</code>
              : <code className="break-all rounded bg-slate-200 px-1 py-0.5 text-[0.9em] text-slate-800" {...props}>{children}</code>
          },
          pre: ({ node: _node, ...props }) => <pre data-scrollable className="my-2 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-lg bg-slate-900 p-3 text-xs leading-5" {...props} />,
          a: ({ node: _node, href, children, ...props }) => {
            const safeHref = safeInternalHref(href, streaming)
            if (!safeHref) return <span className="font-medium text-slate-700 underline decoration-dotted" title="Liên kết chưa được xác minh">{children}</span>
            return <Link href={safeHref} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800" {...props}>{children}</Link>
          },
          img: ({ node: _node, src, alt }) => <InlineImage src={typeof src === 'string' ? src : undefined} alt={alt} mediaItems={mediaItems} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
