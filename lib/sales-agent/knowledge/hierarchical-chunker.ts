import { createHash } from 'node:crypto'
import { canonicalizeDocumentContent, type ExtractedImageRef } from './canonicalizer.ts'

export const CHUNK_TARGET_TOKENS = 450
export const CHUNK_HARD_MAX_TOKENS = 600
export const CHUNK_OVERLAP_TOKENS = 70

export interface HierarchicalChunk {
  chunkIndex: number
  chunkLevel: number // 0: document, 1: chapter, 2: section, 3: leaf
  hierarchyPath: string
  sectionAnchor: string
  sectionTitle: string
  parentHierarchyPath: string | null
  content: string
  contentHash: string
  tokenCount: number
  tags: string[]
  isWarning: boolean
  isTable: boolean
  isProcedure: boolean
  sourceNodeId?: string
  extractedImages?: ExtractedImageRef[]
}

export interface SectionNodeInput {
  chapterTitle: string
  sectionTitle: string
  slug?: string
  contentMarkdown: string
  sourceNodeId?: string
}

export interface DocumentTreeInput {
  documentKey: string
  title: string
  category: string
  vehicleKey?: string
  vehicleModel?: string
  modelYear?: number
  locale?: string
  market?: string
  sections: SectionNodeInput[]
}

function cleanSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0
  const normalized = text.trim()
  if (!normalized) return 0

  const cjkCount = (normalized.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const words = normalized.split(/\s+/).filter(Boolean)
  const punctuationCount = (normalized.match(/[,.;:!?()[\]{}"'`~@#$%^&*+=|\\/<>_-]/g) || []).length

  return Math.max(1, Math.ceil(words.length * 1.3 + cjkCount * 0.7 + punctuationCount * 0.2))
}

function extractTechnicalTags(content: string, vehicleModel?: string, category?: string): string[] {
  const tags = new Set<string>()
  if (vehicleModel) tags.add(cleanSlug(vehicleModel).replace(/-/g, ''))
  if (category) tags.add(category.toLowerCase())

  const lower = content.toLowerCase()
  if (lower.includes('pin') || lower.includes('battery') || lower.includes('dung lượng')) tags.add('battery')
  if (lower.includes('sạc') || lower.includes('charging') || lower.includes('ccs2') || lower.includes('trụ sạc')) tags.add('charging')
  if (lower.includes('động cơ') || lower.includes('mã lực') || lower.includes('công suất') || lower.includes('mô-men')) tags.add('powertrain')
  if (lower.includes('lốp') || lower.includes('áp suất lốp') || lower.includes('vành')) tags.add('tires')
  if (lower.includes('phanh') || lower.includes('abs') || lower.includes('ebs')) tags.add('brakes')
  if (lower.includes('adas') || lower.includes('cảnh báo') || lower.includes('hỗ trợ lái') || lower.includes('camera') || lower.includes('radar')) tags.add('adas')
  if (lower.includes('cứu hộ') || lower.includes('kéo xe') || lower.includes('bảo dưỡng') || lower.includes('cầu chì')) tags.add('towing')

  return Array.from(tags)
}

function isMarkdownTable(block: string): boolean {
  const lines = block.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
  return lines.length >= 2 && lines.some((line) => /^\|(?:\s*[-:]+\s*\|)+/.test(line))
}

function splitMarkdownTable(tableBlock: string, maxTokens: number): string[] {
  const lines = tableBlock.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 2) return [tableBlock.trim()]

  const sepIdx = lines.findIndex((l, idx) => idx > 0 && /^\|(?:\s*[-:]+\s*\|)+/.test(l))
  if (sepIdx === -1) {
    return [tableBlock.trim()]
  }

  const headerLines = lines.slice(0, sepIdx + 1)
  const headerText = headerLines.join('\n')
  const dataRows = lines.slice(sepIdx + 1)

  const parts: string[] = []
  let currentRows: string[] = []

  for (const row of dataRows) {
    const candidateRows = [...currentRows, row]
    const candidateTable = `${headerText}\n${candidateRows.join('\n')}`
    if (estimateTokenCount(candidateTable) > maxTokens && currentRows.length > 0) {
      parts.push(`${headerText}\n${currentRows.join('\n')}`)
      currentRows = [row]
    } else {
      currentRows.push(row)
    }
  }

  if (currentRows.length > 0) {
    parts.push(`${headerText}\n${currentRows.join('\n')}`)
  }

  return parts
}

function splitWords(text: string, maxTokens: number): string[] {
  const words = text.trim().split(/\s+/)
  const maxWords = Math.max(1, Math.floor(maxTokens / 1.3))
  const parts: string[] = []
  for (let offset = 0; offset < words.length; offset += maxWords) {
    parts.push(words.slice(offset, offset + maxWords).join(' '))
  }
  return parts
}

function splitOversizedBlock(block: string, maxTokens: number): string[] {
  if (estimateTokenCount(block) <= maxTokens) return [block.trim()]

  if (isMarkdownTable(block)) {
    return splitMarkdownTable(block, maxTokens)
  }

  const sentences = block
    .split(/(?<=[.!?。])\s+(?=[\p{L}\p{N}*_`])/u)
    .map((part) => part.trim())
    .filter(Boolean)
  if (sentences.length <= 1) return splitWords(block, maxTokens)

  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (estimateTokenCount(sentence) > maxTokens) {
      if (current) parts.push(current)
      parts.push(...splitWords(sentence, maxTokens))
      current = ''
      continue
    }
    const candidate = current ? `${current} ${sentence}` : sentence
    if (estimateTokenCount(candidate) > maxTokens && current) {
      parts.push(current)
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current) parts.push(current)
  return parts
}

function isHeadingLine(text: string): boolean {
  return /^#{1,6}\s+[^\n]+$/.test(text.trim())
}

function overlapTail(text: string, overlapTokens: number): string {
  if (!text?.trim() || overlapTokens <= 0) return ''
  const lines = text.trim().split(/\n+/)
  if (lines.length > 1) {
    let overlap = ''
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (!line) continue
      if (line.startsWith('|') || isHeadingLine(line)) continue
      const candidate = overlap ? `${line}\n\n${overlap}` : line
      if (estimateTokenCount(candidate) > overlapTokens && overlap) {
        break
      }
      overlap = candidate
    }
    if (overlap) return overlap
  }

  const sentences = text.trim().split(/(?<=[.!?:\n])\s+/)
  if (sentences.length > 1) {
    let overlap = ''
    for (let i = sentences.length - 1; i >= 0; i--) {
      const s = sentences[i].trim()
      if (!s) continue
      if (s.startsWith('|') || isHeadingLine(s)) continue
      const candidate = overlap ? `${s} ${overlap}` : s
      if (estimateTokenCount(candidate) > overlapTokens && overlap) {
        break
      }
      overlap = candidate
    }
    if (overlap) return overlap
  }

  // Fallback cho văn xuôi liên tục không có dấu chấm / ngắt dòng
  const words = text.trim().split(/\s+/)
  if (words.some((w) => w.startsWith('|'))) return ''
  const overlapWords = Math.max(1, Math.floor(overlapTokens / 1.3))
  return words.slice(-overlapWords).join(' ')
}

export function splitSectionIntoLeaves(
  markdown: string,
  targetTokens = CHUNK_TARGET_TOKENS,
  hardMaxTokens = CHUNK_HARD_MAX_TOKENS,
  overlapTokens = CHUNK_OVERLAP_TOKENS,
): string[] {
  if (!(targetTokens > overlapTokens && hardMaxTokens >= targetTokens)) {
    throw new Error('Invalid hierarchical chunk size configuration')
  }

  const logicalBlocks = markdown
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitOversizedBlock(block, targetTokens))

  const leaves: string[] = []
  let current = ''
  let previous = ''

  const flush = () => {
    let value = current.trim()
    if (!value) return

    const trailingHeadingMatch = value.match(/(?:\n|^)(#{1,6}\s+[^\n]+(?:\n+#{1,6}\s+[^\n]+)*)$/)
    let carryOverHeading = ''
    if (trailingHeadingMatch && trailingHeadingMatch.index !== undefined && trailingHeadingMatch.index > 0) {
      carryOverHeading = trailingHeadingMatch[1].trim()
      value = value.slice(0, trailingHeadingMatch.index).trim()
    }

    if (!value && carryOverHeading) {
      current = carryOverHeading
      return
    }

    if (estimateTokenCount(value) > hardMaxTokens) {
      throw new Error(`Chunk hard cap exceeded: ${estimateTokenCount(value)} > ${hardMaxTokens}`)
    }
    leaves.push(value)
    previous = value
    current = carryOverHeading
  }

  for (const block of logicalBlocks) {
    const isHeading = isHeadingLine(block)
    const isTable = isMarkdownTable(block)

    // Nếu block là table và current đã chứa bảng: flush để mỗi bảng hoặc phần bảng là 1 khối hoàn chỉnh
    if (isTable && current && current.includes('| --- |')) {
      flush()
    } else if (isHeading && current && estimateTokenCount(current) > targetTokens * 0.5) {
      flush()
    }

    const candidate = current ? `${current}\n\n${block}` : block
    if (current && estimateTokenCount(candidate) > targetTokens) {
      if (!isHeadingLine(current)) {
        flush()
      }
    }

    if (!current && previous) {
      if (isTable || isHeading) {
        current = block
      } else {
        const overlap = overlapTail(previous, overlapTokens)
        const withOverlap = overlap ? `${overlap}\n\n${block}` : block
        current = estimateTokenCount(withOverlap) <= hardMaxTokens ? withOverlap : block
      }
    } else {
      current = current ? `${current}\n\n${block}` : block
    }

    if (estimateTokenCount(current) >= targetTokens && !isHeadingLine(current)) {
      flush()
    }
  }
  flush()
  return leaves
}

function makeChunkContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function buildHierarchicalChunks(doc: DocumentTreeInput): HierarchicalChunk[] {
  const chunks: HierarchicalChunk[] = []
  let chunkIndex = 0
  const pushChunk = (chunk: Omit<HierarchicalChunk, 'chunkIndex' | 'contentHash' | 'tokenCount'>) => {
    const tokenCount = estimateTokenCount(chunk.content)
    if (!chunk.content.trim()) throw new Error(`Empty chunk content at ${chunk.hierarchyPath}`)
    if (tokenCount > CHUNK_HARD_MAX_TOKENS) {
      throw new Error(`Chunk ${chunk.hierarchyPath} exceeds ${CHUNK_HARD_MAX_TOKENS} tokens`)
    }
    chunks.push({
      ...chunk,
      chunkIndex: chunkIndex++,
      contentHash: makeChunkContentHash(chunk.content),
      tokenCount,
    })
  }

  const docSummary = `Tài liệu: ${doc.title}. Dòng xe: ${doc.vehicleModel || 'Tất cả'}. Năm: ${doc.modelYear || 'Tất cả'}. Thị trường: ${doc.market || 'VN'}. Bao gồm ${doc.sections.length} mục hướng dẫn.`
  pushChunk({
    chunkLevel: 0,
    hierarchyPath: 'root',
    sectionAnchor: `${doc.documentKey}#root`,
    sectionTitle: doc.title,
    parentHierarchyPath: null,
    content: docSummary,
    tags: extractTechnicalTags(docSummary, doc.vehicleModel, doc.category),
    isWarning: false,
    isTable: false,
    isProcedure: false,
  })

  const chapterMap = new Map<string, SectionNodeInput[]>()
  for (const section of doc.sections) {
    const chapter = section.chapterTitle || 'Thông tin chung'
    const list = chapterMap.get(chapter) || []
    list.push(section)
    chapterMap.set(chapter, list)
  }

  let chapterOrdinal = 1
  for (const [chapterTitle, sections] of chapterMap) {
    const chapterSlug = `c${String(chapterOrdinal).padStart(2, '0')}_${cleanSlug(chapterTitle)}`
    const chapterPath = `root/${chapterSlug}`
    const chapterSummary = `Chương ${chapterOrdinal}: ${chapterTitle}. Thuộc ${doc.title}. Gồm ${sections.length} mục: ${sections.map((section) => section.sectionTitle).join(', ')}.`
    const safeChapterSummary = estimateTokenCount(chapterSummary) <= CHUNK_HARD_MAX_TOKENS
      ? chapterSummary
      : `${chapterSummary.slice(0, 1800)}…`
    pushChunk({
      chunkLevel: 1,
      hierarchyPath: chapterPath,
      sectionAnchor: `${doc.documentKey}#${chapterSlug}`,
      sectionTitle: chapterTitle,
      parentHierarchyPath: 'root',
      content: safeChapterSummary,
      tags: extractTechnicalTags(safeChapterSummary, doc.vehicleModel, doc.category),
      isWarning: false,
      isTable: false,
      isProcedure: false,
    })

    let sectionOrdinal = 1
    for (const section of sections) {
      const canonical = canonicalizeDocumentContent(section.contentMarkdown)
      if (!canonical.normalizedMarkdown.trim()) continue
      const sectionSlug = `s${String(sectionOrdinal).padStart(2, '0')}_${cleanSlug(section.sectionTitle)}`
      const sectionPath = `${chapterPath}/${sectionSlug}`
      const nodeLocator = section.sourceNodeId ? `node_${section.sourceNodeId}` : sectionSlug
      const sectionAnchor = `${doc.documentKey}#${nodeLocator}`
      const isWarning = canonical.warningsCount > 0
      const isTable = canonical.tablesCount > 0
      const isProcedure = /(\b1\.\s|\bbước\s*\d|\bquy trình)/i.test(canonical.normalizedMarkdown)
      const common = {
        sectionTitle: `${chapterTitle} > ${section.sectionTitle}`,
        tags: extractTechnicalTags(canonical.normalizedMarkdown, doc.vehicleModel, doc.category),
        isWarning,
        isTable,
        isProcedure,
        sourceNodeId: section.sourceNodeId,
      }

      if (estimateTokenCount(canonical.normalizedMarkdown) <= CHUNK_HARD_MAX_TOKENS) {
        pushChunk({
          ...common,
          chunkLevel: 2,
          hierarchyPath: sectionPath,
          sectionAnchor,
          parentHierarchyPath: chapterPath,
          content: canonical.normalizedMarkdown,
          extractedImages: canonical.extractedImages,
        })
      } else {
        const parentSummary = `Mục: ${section.sectionTitle}. Thuộc chương ${chapterTitle}. Nội dung chi tiết được chia thành các phần con để truy xuất; citation gốc: ${sectionAnchor}.`
        pushChunk({
          ...common,
          chunkLevel: 2,
          hierarchyPath: sectionPath,
          sectionAnchor,
          parentHierarchyPath: chapterPath,
          content: parentSummary,
          extractedImages: [],
        })

        const leaves = splitSectionIntoLeaves(canonical.normalizedMarkdown)
        leaves.forEach((leafContent, index) => {
          const leafOrdinal = index + 1
          const leafPath = `${sectionPath}/leaf_${String(leafOrdinal).padStart(2, '0')}`
          const leafImages = canonical.extractedImages.filter((image) => {
            const fileName = image.fileName || image.url.split('/').pop()?.split('#')[0]?.split('?')[0]
            const hasPlaceholder = fileName ? leafContent.includes(`[img: ${fileName}]`) : false
            const hasUrl = leafContent.includes(image.url)
            return hasPlaceholder || hasUrl
          })
          pushChunk({
            ...common,
            chunkLevel: 3,
            hierarchyPath: leafPath,
            sectionAnchor: `${sectionAnchor}-p${leafOrdinal}`,
            sectionTitle: `${common.sectionTitle} (Phần ${leafOrdinal})`,
            parentHierarchyPath: sectionPath,
            content: leafContent,
            isWarning: /CẢNH BÁO|THẬN TRỌNG|LƯU Ý/i.test(leafContent),
            isTable: leafContent.includes('|'),
            extractedImages: leafImages,
          })
        })
      }
      sectionOrdinal++
    }
    chapterOrdinal++
  }

  return chunks
}
