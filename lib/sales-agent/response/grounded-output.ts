import type { DataToolName, SuggestionIntent, ToolObservationRef, ToolResult } from '../contracts'
import type { IndexedFact } from '../orchestrator/ledgers/evidence'

export type ExtractedSuggestions = {
  markdown: string
  suggestions: SuggestionIntent[]
}

function removeSuggestionLead(markdown: string): string {
  const lines = markdown.trimEnd().split('\n')
  let removed = 0

  while (
    lines.length > 0
    && removed < 2
    && /(?:suggestion\s*intents?|gợi ý|câu hỏi tiếp theo|json|ngoặc kép|mảng)/i.test(lines.at(-1) ?? '')
  ) {
    lines.pop()
    removed += 1
  }

  return lines.join('\n').trim()
}

export function extractEmbeddedSuggestions(input: string): ExtractedSuggestions {
  const markdown = input.trim()
  const closeIndex = markdown.lastIndexOf(']')
  const openIndex = markdown.lastIndexOf('[', closeIndex)

  if (openIndex < 0 || closeIndex < openIndex || markdown.slice(closeIndex + 1).trim()) {
    return { markdown, suggestions: [] }
  }

  const candidate = markdown.slice(openIndex, closeIndex + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return { markdown, suggestions: [] }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { markdown, suggestions: [] }
  }

  let suggestions: SuggestionIntent[] = []
  if (parsed.every((item) => (
    typeof item === 'object'
    && item !== null
    && typeof (item as { label?: unknown }).label === 'string'
    && typeof (item as { intent?: unknown }).intent === 'string'
  ))) {
    suggestions = parsed.map((item) => ({
      text: (item as { label: string }).label.trim(),
      payload: (item as { intent: string }).intent.trim(),
    }))
  } else if (parsed.every((item) => typeof item === 'string')) {
    const hasExplicitMarker = /(?:suggestion\s*intents?|gợi ý|câu hỏi tiếp theo)\s*:?\s*$/i
      .test(markdown.slice(0, openIndex).trimEnd())
    if (hasExplicitMarker || parsed.length >= 2) {
      suggestions = parsed.map((item) => ({ text: item.trim(), payload: item.trim() }))
    }
  }

  suggestions = suggestions
    .filter((item) => item.text.length > 0 && item.text.length <= 200 && (item.payload?.length ?? 0) <= 200)
    .slice(0, 5)

  if (suggestions.length === 0) {
    return { markdown, suggestions: [] }
  }

  return {
    markdown: removeSuggestionLead(markdown.slice(0, openIndex)),
    suggestions,
  }
}

export function buildNoEvidenceMarkdown(
  attemptedTools: ReadonlySet<DataToolName>,
  observations: readonly ToolObservationRef[],
): string {
  const unavailable = observations.some((observation) => observation.outcome === 'UNAVAILABLE')
  const reason = unavailable ? 'nguồn dữ liệu tạm thời chưa phản hồi' : 'chưa tìm thấy nội dung đã xác minh phù hợp'

  if (attemptedTools.has('search_user_manuals')) {
    return `Dạ, ${reason} trong Hướng dẫn sử dụng cho câu hỏi này. Em chưa thể xác nhận chi tiết và sẽ không suy đoán khi chưa có nguồn; anh/chị vui lòng thử lại hoặc đối chiếu tài liệu Hướng dẫn sử dụng chính thức của đúng mẫu xe và đời xe.`
  }
  if (attemptedTools.has('find_service_locations')) {
    return `Dạ, ${reason} về xưởng hoặc trung tâm dịch vụ theo yêu cầu này. Em chưa thể xác nhận địa chỉ, số điện thoại hay giờ hoạt động khi chưa có nguồn; anh/chị vui lòng thử lại sau.`
  }
  if (attemptedTools.has('search_after_sales')) {
    return `Dạ, ${reason} trong dữ liệu hậu mãi đã được duyệt. Em chưa thể xác nhận chính sách hoặc mốc dịch vụ và sẽ không suy đoán khi chưa có nguồn; anh/chị vui lòng thử lại sau.`
  }
  if (attemptedTools.has('search_knowledge')) {
    return `Dạ, ${reason} trong kho chính sách đã được xác minh. Em chưa thể kết luận chính sách áp dụng và sẽ không suy đoán khi chưa có nguồn; anh/chị vui lòng thử lại sau.`
  }

  return `Dạ, ${reason} trong dữ liệu FASTLANE hiện tại. Em chưa thể xác nhận chi tiết và sẽ không suy đoán khi chưa có nguồn; anh/chị vui lòng thử lại sau.`
}

export function appendCanonicalManualReference(markdown: string, facts: readonly IndexedFact[]): string {
  const articleFact = facts.find((fact) => fact.factPath === 'article_id' && fact.valueHash)
  if (!articleFact) return markdown.trim()

  const chunkId = articleFact.factRef.replace('fact-manual-articleId-', '')
  const modelFact = facts.find((fact) => fact.factRef === `fact-manual-modelId-${chunkId}`)
  if (!modelFact?.valueHash) return markdown.trim()

  const withoutManualLinks = markdown
    .replace(/\[[^\]]+\]\(\/user-manual\/[^)]+\)/giu, '')
    .trim()
  const route = `/user-manual/${encodeURIComponent(modelFact.valueHash)}/${encodeURIComponent(articleFact.valueHash)}`

  return `${withoutManualLinks}\n\n[Xem chi tiết Hướng dẫn sử dụng](${route})`.trim()
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildDeterministicToolMarkdown(results: readonly ToolResult[]): string | null {
  const afterSales = [...results].reverse().find((result) => (
    result.tool === 'search_after_sales' && result.outcome === 'SUCCESS'
  ))
  if (afterSales?.outcome === 'SUCCESS') {
    const data = afterSales.data as { groups?: Array<{ summary?: unknown }>; route?: unknown }
    const summaries = (data.groups ?? []).map((group) => text(group.summary)).filter(Boolean)
    const route = text(data.route)
    if (summaries.length > 0) {
      return [
        'Dạ, theo dữ liệu hậu mãi đã được duyệt:',
        '',
        ...summaries.map((summary) => `- ${summary}`),
        route ? `\n[Xem chi tiết chính sách và dịch vụ](${route})` : '',
      ].filter((line, index, lines) => line || (index > 0 && lines[index - 1] !== '')).join('\n').trim()
    }
  }

  const locations = [...results].reverse().find((result) => (
    result.tool === 'find_service_locations' && result.outcome === 'SUCCESS'
  ))
  if (locations?.outcome === 'SUCCESS') {
    const data = locations.data as {
      totalMatches?: number
      hasMore?: boolean
      route?: unknown
      locations?: Array<{
        name?: unknown
        address?: { fullAddress?: unknown }
        phone?: unknown
        operatingHours?: { opensAt?: unknown; closesAt?: unknown }
      }>
    }
    const items = data.locations ?? []
    if (items.length > 0) {
      const totalMatches = Number.isFinite(data.totalMatches) ? Number(data.totalMatches) : items.length
      const intro = data.hasMore
        ? `Dạ, FASTLANE tìm thấy **${totalMatches} xưởng dịch vụ phù hợp**; dưới đây là ${items.length} kết quả đầu tiên:`
        : `Dạ, FASTLANE tìm thấy **${totalMatches} xưởng dịch vụ phù hợp**:`
      const bullets = items.map((location) => {
        const name = text(location.name) || 'Xưởng dịch vụ VinFast'
        const address = text(location.address?.fullAddress)
        const opensAt = text(location.operatingHours?.opensAt)
        const closesAt = text(location.operatingHours?.closesAt)
        const phone = text(location.phone)
        const details = [
          address,
          opensAt && closesAt ? `giờ hoạt động ${opensAt}–${closesAt}` : '',
          phone ? `điện thoại ${phone}` : '',
        ].filter(Boolean).join('; ')
        return `- **${name}**${details ? ` — ${details}` : ''}`
      })
      const route = text(data.route)
      return [
        intro,
        '',
        ...bullets,
        route ? `\n[Xem danh sách xưởng dịch vụ](${route})` : '',
      ].filter((line, index, lines) => line || (index > 0 && lines[index - 1] !== '')).join('\n').trim()
    }
  }

  const knowledge = [...results].reverse().find((result) => (
    result.tool === 'search_knowledge' && result.outcome === 'SUCCESS'
  ))
  if (knowledge?.outcome === 'SUCCESS') {
    const data = knowledge.data as {
      snippets?: Array<{ documentSlug?: unknown; title?: unknown; content?: unknown }>
    }
    const seen = new Set<string>()
    const sections = (data.snippets ?? []).flatMap((snippet) => {
      const content = text(snippet.content)
      if (!content || seen.has(content)) return []
      seen.add(content)
      const title = text(snippet.title)
      return [`${title ? `**${title}**\n\n` : ''}${content}`]
    })
    if (sections.length > 0) {
      const policyMarkdown = sections.join('\n\n')
      const hasVerifiedMotorbikeWarranty = (data.snippets ?? []).some((snippet) => (
        text(snippet.documentSlug) === 'chinh-sach-bao-hanh-pin-xe-may-dien-vinfast'
      ))
      const canonicalRoute = hasVerifiedMotorbikeWarranty
        && !policyMarkdown.includes('/after-sales?vehicle=motorbike&tab=warranty#warranty-term')
        ? '\n\n[Xem chính sách bảo hành xe máy điện](/after-sales?vehicle=motorbike&tab=warranty#warranty-term)'
        : ''
      return `Dạ, theo chính sách đã được xác minh của FASTLANE:\n\n${policyMarkdown}${canonicalRoute}`
    }
  }

  const manual = [...results].reverse().find((result) => (
    result.tool === 'search_user_manuals' && result.outcome === 'SUCCESS'
  ))
  if (manual?.outcome === 'SUCCESS') {
    const data = manual.data as { snippets?: Array<{ title?: unknown; content?: unknown; imageUrl?: unknown }> }
    const snippet = (data.snippets ?? []).find((item) => text(item.content))
    if (snippet) {
      const title = text(snippet.title)
      const content = text(snippet.content)
      const imageUrl = text(snippet.imageUrl)
      return [
        'Dạ, theo Hướng dẫn sử dụng chính thức:',
        title ? `**${title}**` : '',
        content,
        imageUrl ? `![${title || 'Hình minh họa trong Hướng dẫn sử dụng'}](${imageUrl})` : '',
      ].filter(Boolean).join('\n\n').trim()
    }
  }

  return null
}
