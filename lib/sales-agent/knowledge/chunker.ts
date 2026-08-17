import type { KnowledgeChunk } from './types'

export type RawChunk = {
  chunkIndex: number
  sectionTitle: string
  content: string
  tags: string[]
}

const COMMON_KEYWORD_PATTERNS = [
  /\bvf\s*[-_]?\s*[0-9]+(?:\s*plus)?\b/gi,
  /\b(?:evo\s*200|feliz\s*s?|klara\s*s?|vento\s*s?|theon\s*s?|amio)\b/gi,
  /\b(?:bảo hành|thuê pin|mua pin|trạm sạc|v-green|cứu hộ|sạc nhanh|sạc pin)\b/gi,
  /\b(?:đặt cọc|tiền cọc|hợp đồng|thủ tục|nhận xe|bàn giao)\b/gi,
  /\b(?:trả góp|lãi suất|vay vốn|ngân hàng|chiết khấu|khuyến mãi)\b/gi,
  /\b\d+\s*(?:năm|tháng|km|triệu|tỷ|%|kw|kwh)\b/gi,
]

export function extractTagsFromText(text: string, title?: string): string[] {
  const combined = `${title || ''} ${text}`.toLowerCase()
  const tagsSet = new Set<string>()

  for (const pattern of COMMON_KEYWORD_PATTERNS) {
    const matches = combined.match(pattern)
    if (matches) {
      for (const m of matches) {
        const cleaned = m.trim().toLowerCase().replace(/\s+/g, ' ')
        if (cleaned.length >= 2) {
          tagsSet.add(cleaned)
        }
      }
    }
  }

  // Also add significant words from title
  if (title) {
    const titleWords = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['các', 'những', 'cho', 'với', 'trong', 'của'].includes(w))
    for (const w of titleWords.slice(0, 4)) {
      tagsSet.add(w)
    }
  }

  return Array.from(tagsSet).slice(0, 15)
}

export function chunkMarkdownDocument(markdown: string, docTitle?: string): RawChunk[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const sections: Array<{ title: string; lines: string[] }> = []
  let currentTitle = docTitle || 'Tổng quan'
  let currentLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(?:#{1,3})\s+(.+)$/)
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          lines: currentLines,
        })
        currentLines = []
      }
      currentTitle = headingMatch[1].replace(/^\d+\.\s*/, '').trim()
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      title: currentTitle,
      lines: currentLines,
    })
  }

  // Filter out empty sections and build final chunks
  const chunks: RawChunk[] = []
  let chunkIndex = 0

  for (const sec of sections) {
    const content = sec.lines.join('\n').trim()
    if (!content) continue

    const tags = extractTagsFromText(content, sec.title)
    chunks.push({
      chunkIndex,
      sectionTitle: sec.title,
      content,
      tags,
    })
    chunkIndex++
  }

  // If no sections were produced (e.g. unformatted raw text), return single chunk
  if (chunks.length === 0 && normalized.length > 0) {
    chunks.push({
      chunkIndex: 0,
      sectionTitle: docTitle || 'Thông tin chung',
      content: normalized,
      tags: extractTagsFromText(normalized, docTitle),
    })
  }

  return chunks
}
