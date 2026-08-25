import type { AssistantBlock } from '@/lib/sales-agent/contracts'

type KnowledgeMediaItem = Extract<AssistantBlock, { kind: 'KNOWLEDGE_MEDIA' }>['items'][number]

export function DiagramLegend({ labels }: { labels?: KnowledgeMediaItem['diagramLabels'] }) {
  if (!labels?.length) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="mb-1.5 text-xs font-semibold text-slate-800">Chú giải ký hiệu</p>
      <ol className="space-y-1 text-xs leading-5 text-slate-700">
        {labels.map((label) => (
          <li key={`${label.marker}-${label.description}`} className="flex items-start gap-2">
            <span className="min-w-7 font-semibold text-brand-700">({label.marker})</span>
            <span>{label.description}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
