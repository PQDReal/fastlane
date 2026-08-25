import type { KnowledgeEvidenceItem, KnowledgeImageRef } from './contracts'

export interface CitationPointerInput {
  documentKey: string
  versionNo: number
  sectionAnchor: string
  sourceNodeId?: string
}

export interface KnowledgeCitation {
  citationId: string
  documentKey: string
  title: string
  sectionTitle: string
  sectionAnchor: string
  sourceNodeId?: string
  imageRefs: Array<string | KnowledgeImageRef>
  versionNo: number
  excerpt: string
  effectiveFrom: string
  effectiveTo: string | null
  dataAsOf: string
  evidenceRef: string
}

export interface FormattedCitationReference {
  index: number
  citationId: string
  displayLabel: string
  title: string
  sectionTitle: string
  documentKey: string
}

export function sanitizeAnchor(anchor: string): string {
  if (!anchor) return 'root'
  return anchor.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
}

export function generateCitationId(input: CitationPointerInput): string {
  const cleanDoc = input.documentKey.trim()
  const cleanAnchor = sanitizeAnchor(input.sectionAnchor)
  const nodeSuffix = input.sourceNodeId ? `:${input.sourceNodeId}` : ''
  return `cite:${cleanDoc}:v${input.versionNo}:${cleanAnchor}${nodeSuffix}`
}

export function generateEvidenceRef(chunkId: string, versionNo: number): string {
  return `ev:${chunkId}:v${versionNo}`
}

export function validateCitationPointer(citationId: string): boolean {
  if (!citationId || typeof citationId !== 'string') return false
  // Format: cite:{docKey}:v{versionNo}:{anchor}(:{sourceNodeId})?
  const regex = /^cite:[a-zA-Z0-9_.:-]+:v\d+:[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)?$/
  return regex.test(citationId)
}

export class KnowledgeCitationLedger {
  private citations = new Map<string, KnowledgeCitation>()

  /**
   * Đăng ký một danh sách bằng chứng vào sổ cái trích dẫn
   */
  registerEvidenceItems(items: KnowledgeEvidenceItem[]): KnowledgeCitation[] {
    const registered: KnowledgeCitation[] = []

    for (const item of items) {
      if (!validateCitationPointer(item.citationId)) {
        throw new Error(`Invalid citation pointer format: ${item.citationId}`)
      }

      const expectedCitationId = generateCitationId({
        documentKey: item.documentKey,
        versionNo: item.versionNo,
        sectionAnchor: item.sectionAnchor,
        sourceNodeId: item.sourceNodeId,
      })
      if (expectedCitationId !== item.citationId) {
        throw new Error(
          `Citation pointer does not match evidence identity: ${item.citationId}`
        )
      }

      const citation: KnowledgeCitation = {
        citationId: item.citationId,
        documentKey: item.documentKey,
        title: item.title,
        sectionTitle: item.sectionTitle,
        sectionAnchor: item.sectionAnchor,
        sourceNodeId: item.sourceNodeId,
        imageRefs: item.imageRefs || [],
        versionNo: item.versionNo,
        excerpt: item.excerpt,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        dataAsOf: item.dataAsOf,
        evidenceRef: item.evidenceRef,
      }

      const existing = this.citations.get(item.citationId)
      if (existing) {
        const sameIdentity =
          existing.documentKey === citation.documentKey &&
          existing.versionNo === citation.versionNo &&
          existing.sectionAnchor === citation.sectionAnchor &&
          existing.sourceNodeId === citation.sourceNodeId &&
          existing.evidenceRef === citation.evidenceRef &&
          existing.title === citation.title &&
          existing.sectionTitle === citation.sectionTitle &&
          existing.effectiveFrom === citation.effectiveFrom &&
          existing.effectiveTo === citation.effectiveTo
        if (!sameIdentity) {
          throw new Error(`Citation pointer collision: ${item.citationId}`)
        }
      } else {
        this.citations.set(item.citationId, citation)
      }
      registered.push(citation)
    }

    return registered
  }

  getCitation(citationId: string): KnowledgeCitation | undefined {
    return this.citations.get(citationId)
  }

  getAllCitations(): KnowledgeCitation[] {
    return Array.from(this.citations.values())
  }

  /**
   * Tạo danh sách tham chiếu trích dẫn có thứ tự hiển thị [1], [2] cho giao diện người dùng
   */
  buildDisplayReferences(citationIds: string[]): FormattedCitationReference[] {
    const uniqueIds = Array.from(new Set(citationIds))
    const formatted: FormattedCitationReference[] = []

    uniqueIds.forEach((id) => {
      const citation = this.citations.get(id)
      if (citation) {
        const index = formatted.length + 1
        formatted.push({
          index,
          citationId: id,
          displayLabel: `[${index}] ${citation.title} — ${citation.sectionTitle}`,
          title: citation.title,
          sectionTitle: citation.sectionTitle,
          documentKey: citation.documentKey,
        })
      }
    })

    return formatted
  }
}
