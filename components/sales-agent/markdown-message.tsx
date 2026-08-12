'use client'

import type { ReactNode } from 'react'

function inline(value: string): ReactNode[] {
  const pieces = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return pieces.map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**')) return <strong key={index}>{piece.slice(2, -2)}</strong>
    if (piece.startsWith('`') && piece.endsWith('`')) return <code key={index} className="rounded bg-slate-200 px-1 py-0.5 text-[0.9em]">{piece.slice(1, -1)}</code>
    return <span key={index}>{piece}</span>
  })
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r/g, '').split('\n')
  const nodes: ReactNode[] = []
  let list: string[] = []

  const flushList = () => {
    if (!list.length) return
    nodes.push(<ul key={`list-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5">{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>)
    list = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ''))
      return
    }
    flushList()
    if (!trimmed) {
      nodes.push(<div key={`space-${index}`} className="h-2" />)
    } else if (/^###\s+/.test(trimmed)) {
      nodes.push(<h4 key={index} className="mt-3 font-semibold text-slate-900">{inline(trimmed.replace(/^###\s+/, ''))}</h4>)
    } else if (/^##\s+/.test(trimmed)) {
      nodes.push(<h3 key={index} className="mt-3 text-base font-semibold text-slate-900">{inline(trimmed.replace(/^##\s+/, ''))}</h3>)
    } else if (/^#\s+/.test(trimmed)) {
      nodes.push(<h2 key={index} className="mt-3 text-lg font-bold text-slate-900">{inline(trimmed.replace(/^#\s+/, ''))}</h2>)
    } else {
      nodes.push(<p key={index} className="leading-6">{inline(trimmed)}</p>)
    }
  })
  flushList()

  return <div className="text-sm text-slate-700">{nodes}</div>
}
