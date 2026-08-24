import type { AssistantBlock } from '@/lib/sales-agent/contracts'

type KnowledgeCitationBlockProps = Extract<AssistantBlock, { kind: 'FACT_SUMMARY' }>

/** Renders server-controlled knowledge source pointers returned with a chat turn. */
export function KnowledgeCitationBlock({ facts }: KnowledgeCitationBlockProps) {
  return (
    <details className="group mt-2 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs text-slate-600">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        <span>Nguồn tham khảo ({facts.length})</span>
        <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
      </summary>
      <ul className="space-y-1.5 border-t border-slate-200/80 px-3 py-2.5">
        {facts.map((fact) => (
          <li
            key={`${fact.label}-${fact.citationId ?? fact.value}`}
            data-citation-id={fact.citationId}
            className="leading-relaxed text-slate-600"
          >
            {fact.value}
          </li>
        ))}
      </ul>
    </details>
  )
}
