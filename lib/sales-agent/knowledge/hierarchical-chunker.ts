import { createHash } from 'node:crypto'
import { canonicalizeDocumentContent } from './canonicalizer'

export interface HierarchicalChunk {
  chunkIndex: number
  chunkLevel: number // 0: Doc, 1: Chapter, 2: Section, 3: Leaf
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
  extractedImages?: Array<{ id?: string; alt: string; url: string }>
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
  vehicleModel?: string
  modelYear?: number
  sections: SectionNodeInput[]
}

/**
 * Ước tính số token tiếng Việt / kỹ thuật (khoảng 0.75 từ / token hoặc ~4 ký tự / token)
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  const words = text.trim().split(/\s+/).length
  return Math.ceil(words * 1.3)
}

function cleanSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Trích xuất thẻ tags kỹ thuật từ nội dung
 */
function extractTechnicalTags(content: string, vehicleModel?: string, category?: string): string[] {
  const tags = new Set<string>()
  if (vehicleModel) tags.add(vehicleModel.toLowerCase().replace(/\s+/g, ''))
  if (category) tags.add(category.toLowerCase())

  const lower = content.toLowerCase()
  if (lower.includes('bảo hành') || lower.includes('warranty')) tags.add('warranty')
  if (lower.includes('pin') || lower.includes('battery') || lower.includes('kwh')) tags.add('battery')
  if (lower.includes('sạc') || lower.includes('charging') || lower.includes('ccs2')) tags.add('charging')
  if (lower.includes('đặt cọc') || lower.includes('deposit')) tags.add('deposit')
  if (lower.includes('trả góp') || lower.includes('lãi suất') || lower.includes('vay')) tags.add('financing')
  if (lower.includes('lốp') || lower.includes('áp suất') || lower.includes('psi') || lower.includes('kpa')) tags.add('tires')
  if (lower.includes('phanh') || lower.includes('brake') || lower.includes('autohold')) tags.add('brakes')
  if (lower.includes('adas') || lower.includes('cảnh báo') || lower.includes('hỗ trợ lái')) tags.add('adas')
  if (lower.includes('công suất') || lower.includes('mã lực') || lower.includes('mô-men xoắn') || lower.includes('kw')) tags.add('powertrain')
  if (lower.includes('cứu hộ') || lower.includes('kéo xe') || lower.includes('móc kéo')) tags.add('towing')

  return Array.from(tags)
}

/**
 * Hierarchical Chunker v1 (A19-KR-203):
 * Sinh cây chunk phân cấp 4 tầng:
 * - Level 0: Document overview
 * - Level 1: Chapter overview
 * - Level 2: Section content
 * - Level 3: Leaf chunks (khi section quá dài > 600 tokens, chia nhỏ với 15% overlap)
 */
export function buildHierarchicalChunks(doc: DocumentTreeInput): HierarchicalChunk[] {
  const chunks: HierarchicalChunk[] = []
  let chunkIndexCounter = 0

  // 1. Level 0: Document Root Chunk
  const docSummary = `Tài liệu: ${doc.title} (${doc.documentKey}). Danh mục: ${doc.category}. Dòng xe: ${doc.vehicleModel || 'Tất cả'} - Năm: ${doc.modelYear || 'Tất cả'}. Bao gồm ${doc.sections.length} mục hướng dẫn.`
  const docHash = createHash('sha256').update(docSummary).digest('hex')

  chunks.push({
    chunkIndex: chunkIndexCounter++,
    chunkLevel: 0,
    hierarchyPath: 'root',
    sectionAnchor: `${doc.documentKey}#root`,
    sectionTitle: doc.title,
    parentHierarchyPath: null,
    content: docSummary,
    contentHash: docHash,
    tokenCount: estimateTokenCount(docSummary),
    tags: extractTechnicalTags(docSummary, doc.vehicleModel, doc.category),
    isWarning: false,
    isTable: false,
    isProcedure: false,
  })

  // Nhóm các sections theo chapter
  const chapterMap = new Map<string, SectionNodeInput[]>()
  doc.sections.forEach((sec) => {
    const chap = sec.chapterTitle || 'Thông tin chung'
    if (!chapterMap.has(chap)) {
      chapterMap.set(chap, [])
    }
    chapterMap.get(chap)!.push(sec)
  })

  // 2. Duyệt từng Chapter (Level 1)
  let chapOrdinal = 1
  for (const [chapterTitle, sectionList] of chapterMap.entries()) {
    const chapterSlug = `c${chapOrdinal.toString().padStart(2, '0')}_${cleanSlug(chapterTitle)}`
    const chapterPath = `root/${chapterSlug}`
    const chapterSummary = `Chương ${chapOrdinal}: ${chapterTitle} (${doc.title}). Gồm các mục: ${sectionList.map((s) => s.sectionTitle).join(', ')}.`
    const chapterHash = createHash('sha256').update(chapterSummary).digest('hex')

    chunks.push({
      chunkIndex: chunkIndexCounter++,
      chunkLevel: 1,
      hierarchyPath: chapterPath,
      sectionAnchor: `${doc.documentKey}#${chapterSlug}`,
      sectionTitle: chapterTitle,
      parentHierarchyPath: 'root',
      content: chapterSummary,
      contentHash: chapterHash,
      tokenCount: estimateTokenCount(chapterSummary),
      tags: extractTechnicalTags(chapterSummary, doc.vehicleModel, doc.category),
      isWarning: false,
      isTable: false,
      isProcedure: false,
    })

    // 3. Duyệt từng Section (Level 2 & Level 3)
    let secOrdinal = 1
    for (const section of sectionList) {
      const canonical = canonicalizeDocumentContent(section.contentMarkdown)
      const sectionSlug = `s${secOrdinal.toString().padStart(2, '0')}_${cleanSlug(section.sectionTitle)}`
      const sectionPath = `${chapterPath}/${sectionSlug}`
      const nodeLocator = section.sourceNodeId ? `node_${section.sourceNodeId}` : sectionSlug
      const sectionAnchor = `${doc.documentKey}#${nodeLocator}`
      const tokenCount = estimateTokenCount(canonical.normalizedMarkdown)

      const isWarning = canonical.warningsCount > 0
      const isTable = canonical.tablesCount > 0
      const isProcedure = /(\b1\.\s|\bbước\s\d|\bquy trình)/i.test(canonical.normalizedMarkdown)

      // Nếu section ngắn vừa phải (<= 600 tokens), tạo 1 Level 2 Chunk
      if (tokenCount <= 600) {
        chunks.push({
          chunkIndex: chunkIndexCounter++,
          chunkLevel: 2,
          hierarchyPath: sectionPath,
          sectionAnchor,
          sectionTitle: `${chapterTitle} > ${section.sectionTitle}`,
          parentHierarchyPath: chapterPath,
          content: canonical.normalizedMarkdown,
          contentHash: canonical.checksum,
          tokenCount,
          tags: extractTechnicalTags(canonical.normalizedMarkdown, doc.vehicleModel, doc.category),
          isWarning,
          isTable,
          isProcedure,
          sourceNodeId: section.sourceNodeId,
          extractedImages: canonical.extractedImages,
        })
      } else {
        // Section dài (> 600 tokens): Tạo Level 2 tóm tắt và Level 3 Leaf Chunks
        const sectionHeader = `### ${section.sectionTitle}\n\n${canonical.normalizedMarkdown.slice(0, 300)}...`
        chunks.push({
          chunkIndex: chunkIndexCounter++,
          chunkLevel: 2,
          hierarchyPath: sectionPath,
          sectionAnchor,
          sectionTitle: `${chapterTitle} > ${section.sectionTitle}`,
          parentHierarchyPath: chapterPath,
          content: sectionHeader,
          contentHash: createHash('sha256').update(sectionHeader).digest('hex'),
          tokenCount: estimateTokenCount(sectionHeader),
          tags: extractTechnicalTags(sectionHeader, doc.vehicleModel, doc.category),
          isWarning,
          isTable,
          isProcedure,
          sourceNodeId: section.sourceNodeId,
          extractedImages: canonical.extractedImages,
        })

        // Tách thành các Leaf chunks với kích thước ~450 tokens và overlap ~70 tokens
        const paragraphs = canonical.normalizedMarkdown.split(/\n\n+/)
        let currentLeaf = ''
        let leafOrdinal = 1

        for (const p of paragraphs) {
          if (estimateTokenCount(currentLeaf + '\n\n' + p) > 450 && currentLeaf.length > 0) {
            const leafPath = `${sectionPath}/leaf_${leafOrdinal.toString().padStart(2, '0')}`
            const leafContent = currentLeaf.trim()
            const leafHash = createHash('sha256').update(leafContent).digest('hex')
            const leafImages = canonical.extractedImages.filter(
              (img) => leafContent.includes(img.url) || (img.id && leafContent.includes(img.id))
            )

            chunks.push({
              chunkIndex: chunkIndexCounter++,
              chunkLevel: 3,
              hierarchyPath: leafPath,
              sectionAnchor: `${sectionAnchor}-p${leafOrdinal}`,
              sectionTitle: `${chapterTitle} > ${section.sectionTitle} (Phần ${leafOrdinal})`,
              parentHierarchyPath: sectionPath,
              content: leafContent,
              contentHash: leafHash,
              tokenCount: estimateTokenCount(leafContent),
              tags: extractTechnicalTags(leafContent, doc.vehicleModel, doc.category),
              isWarning: leafContent.includes('CẢNH BÁO') || leafContent.includes('LƯU Ý'),
              isTable: leafContent.includes('|'),
              isProcedure,
              sourceNodeId: section.sourceNodeId,
              extractedImages: leafImages,
            })

            leafOrdinal++
            // Overlap bằng 1 đoạn cuối
            currentLeaf = p
          } else {
            currentLeaf = currentLeaf ? currentLeaf + '\n\n' + p : p
          }
        }

        if (currentLeaf.trim().length > 0) {
          const leafPath = `${sectionPath}/leaf_${leafOrdinal.toString().padStart(2, '0')}`
          const leafContent = currentLeaf.trim()
          const leafHash = createHash('sha256').update(leafContent).digest('hex')
          const leafImages = canonical.extractedImages.filter(
            (img) => leafContent.includes(img.url) || (img.id && leafContent.includes(img.id))
          )

          chunks.push({
            chunkIndex: chunkIndexCounter++,
            chunkLevel: 3,
            hierarchyPath: leafPath,
            sectionAnchor: `${sectionAnchor}-p${leafOrdinal}`,
            sectionTitle: `${chapterTitle} > ${section.sectionTitle} (Phần ${leafOrdinal})`,
            parentHierarchyPath: sectionPath,
            content: leafContent,
            contentHash: leafHash,
            tokenCount: estimateTokenCount(leafContent),
            tags: extractTechnicalTags(leafContent, doc.vehicleModel, doc.category),
            isWarning: leafContent.includes('CẢNH BÁO') || leafContent.includes('LƯU Ý'),
            isTable: leafContent.includes('|'),
            isProcedure,
            sourceNodeId: section.sourceNodeId,
            extractedImages: leafImages,
          })
        }
      }

      secOrdinal++
    }
    chapOrdinal++
  }

  return chunks
}
