'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function safeInternalHref(href?: string) {
  if (!href) return null
  if (href.startsWith('#')) return href
  if (href.startsWith('/') && !href.startsWith('//')) return href
  return null
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
        table: ({ node: _node, ...props }) => <div className="my-2 max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[340px] border-collapse text-left text-xs" {...props} /></div>,
        thead: ({ node: _node, ...props }) => <thead className="bg-slate-100 text-slate-700" {...props} />,
        tbody: ({ node: _node, ...props }) => <tbody className="divide-y divide-slate-100" {...props} />,
        tr: ({ node: _node, ...props }) => <tr className="align-top" {...props} />,
        th: ({ node: _node, ...props }) => <th className="border-r border-slate-200 px-2.5 py-2 font-semibold last:border-r-0" {...props} />,
        td: ({ node: _node, ...props }) => <td className="border-r border-slate-100 px-2.5 py-2 leading-[1.125rem] text-slate-600 last:border-r-0" {...props} />,
        code: ({ node: _node, className, children, ...props }) => {
          const block = Boolean(className) || String(children).includes('\n')
          return block
            ? <code className={`${className ?? ''} text-xs text-slate-100`} {...props}>{children}</code>
            : <code className="rounded bg-slate-200 px-1 py-0.5 text-[0.9em] text-slate-800" {...props}>{children}</code>
        },
        pre: ({ node: _node, ...props }) => <pre className="my-2 max-w-full overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5" {...props} />,
        a: ({ node: _node, href, children, ...props }) => {
          const safeHref = safeInternalHref(href)
          if (!safeHref) return <span className="font-medium text-slate-700 underline decoration-dotted" title="Liên kết chưa được xác minh">{children}</span>
          return <a href={safeHref} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800" {...props}>{children}</a>
        },
        img: ({ node: _node, alt }) => alt ? <span className="text-xs italic text-slate-500">[Hình ảnh: {alt}]</span> : null,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
