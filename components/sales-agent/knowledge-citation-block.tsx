import type { AssistantBlock } from '@/lib/sales-agent/contracts'

type KnowledgeCitationBlockProps = Extract<AssistantBlock, { kind: 'FACT_SUMMARY' }>

/** Renders server-controlled knowledge source pointers returned with a chat turn. */
export function KnowledgeCitationBlock({ facts }: KnowledgeCitationBlockProps) {
  return (
    <aside className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3" aria-label="Nguồn tham chiếu tri thức">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nguồn tham chiếu</p>
      <ul className="space-y-1.5">
        {facts.map((fact) => (
          <li key={`${fact.label}-${fact.citationId ?? fact.value}`} className="text-xs leading-relaxed text-slate-600">
            <span className="font-medium text-slate-700">{fact.label}:</span> {fact.value}
            {fact.citationId ? (
              <code className="ml-1 break-all rounded bg-white px-1 py-0.5 text-[10px] text-slate-500">{fact.citationId}</code>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  )
}
