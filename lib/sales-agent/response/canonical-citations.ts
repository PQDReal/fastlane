import type { ToolResult } from '../contracts'
import type { RequiredAfterSalesLookup } from '../orchestrator/after-sales-intent'

type CanonicalCitationContext = {
  afterSalesLookup: RequiredAfterSalesLookup | null
  warrantyKnowledgeLookup: boolean
  officialManualLookup: boolean
}

type CanonicalCitation = {
  label: string
  href: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function afterSalesLabel(lookup: RequiredAfterSalesLookup): string {
  if (lookup.toolName === 'find_service_locations') return 'Xem danh sách xưởng dịch vụ'
  return {
    warranty: 'Xem chính sách bảo hành',
    maintenance: 'Xem lịch bảo dưỡng',
    repair: 'Xem quy trình sửa chữa',
    rescue: 'Xem thông tin cứu hộ',
  }[lookup.serviceType]
}

function collectRequiredCitations(
  results: ToolResult[],
  context: CanonicalCitationContext,
): CanonicalCitation[] {
  const citations: CanonicalCitation[] = []

  for (const result of results) {
    if (result.outcome !== 'SUCCESS') continue
    const data = asRecord(result.data)
    if (!data) continue

    if (
      context.afterSalesLookup
      && result.tool === context.afterSalesLookup.toolName
    ) {
      const href = textValue(data.route)
      if (href) citations.push({ label: afterSalesLabel(context.afterSalesLookup), href })
    }

    if (context.warrantyKnowledgeLookup && result.tool === 'search_knowledge') {
      const snippets = Array.isArray(data.snippets) ? data.snippets : []
      for (const snippet of snippets) {
        const href = textValue(asRecord(snippet)?.internalUrl)
        if (href) citations.push({ label: 'Xem chính sách bảo hành xe máy điện', href })
      }
    }

    if (context.officialManualLookup && result.tool === 'search_user_manuals') {
      const documents = Array.isArray(data.officialDocuments) ? data.officialDocuments : []
      for (const document of documents) {
        const record = asRecord(document)
        if (!record) continue
        const label = textValue(record.label) ?? 'Mở PDF hướng dẫn sử dụng chính thức'
        const sourceUrl = textValue(record.sourceUrl)
        const internalUrl = textValue(record.internalUrl)
        if (sourceUrl) citations.push({ label, href: sourceUrl })
        if (internalUrl) citations.push({ label: 'Xem danh mục tài liệu chính thức', href: internalUrl })
      }
    }
  }

  return citations.filter((citation, index, items) => (
    items.findIndex((candidate) => candidate.href === citation.href) === index
  ))
}

export function appendRequiredDataCitations(
  markdown: string,
  results: ToolResult[],
  context: CanonicalCitationContext,
): string {
  const missing = collectRequiredCitations(results, context)
    .filter((citation) => !markdown.includes(`](${citation.href})`))

  if (missing.length === 0) return markdown

  const links = missing.map((citation) => `[${citation.label}](${citation.href})`).join(' · ')
  return `${markdown.trim()}\n\n${links}`
}
