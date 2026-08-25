'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import Link from 'next/link'
import { ManualImageBlock } from './manual-image-block'

function safeInternalHref(href?: string) {
  if (!href) return null
  if (href.startsWith('#')) return href
  if (href.startsWith('/') && !href.startsWith('//')) return href
  return null
}

function safeOfficialDocumentHref(href?: string) {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'https:' && url.hostname === 'static-cms-prod.vinfastauto.com'
      ? url.toString()
      : null
  } catch {
    return null
  }
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

  // If only 1 table line exists (Header row) without delimiter, inject temporary delimiter
  if (tableLines.length === 1) {
    const headerLine = tableLines[0]
    const rawCols = headerLine.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
    const colCount = Math.max(1, rawCols.length || 2)
    const delimiter = `\n| ${Array(colCount).fill('---').join(' | ')} |`
    return `${content}${headerLine.endsWith('|') ? '' : ' |'}${delimiter}`
  }

  // If the last line is actively streaming without a trailing pipe, close the cell temporarily
  if (lastLine.startsWith('|') && !lastLine.endsWith('|')) {
    return `${content} |`
  }

  return content
}

export function MarkdownMessage({ content, streaming = false }: { content: string; streaming?: boolean }) {
  let displayContent = content
  const suggestionStartIndex = displayContent.search(/\[\s*\{\s*"(label|intent)"/)
  if (suggestionStartIndex !== -1) {
    displayContent = displayContent.substring(0, suggestionStartIndex).trim()
  }

  const markdown = normalizeMathDelimiters(completeMarkdownTable(completeCodeFence(displayContent, streaming), streaming))

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
        p: ({ node: _node, ...props }) => <div className="my-1.5 text-sm leading-[1.375rem] text-slate-700 first:mt-0 last:mb-0" {...props} />,
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
          const safeHref = safeInternalHref(href)
          const officialDocumentHref = safeOfficialDocumentHref(href)
          if (officialDocumentHref) {
            return <a href={officialDocumentHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800" {...props}>{children}</a>
          }
          if (!safeHref) return <span className="font-medium text-slate-700 underline decoration-dotted" title="Liên kết chưa được xác minh">{children}</span>
          // Use Next.js Link for client-side navigation to prevent full page reloads
          // which might unexpectedly trigger middleware auth redirects on some environments
          return <Link href={safeHref} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800" {...props}>{children}</Link>
        },
        img: ({ node: _node, alt, src }) => src ? <ManualImageBlock imageUrl={String(src)} caption={alt ? String(alt) : undefined} /> : null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
