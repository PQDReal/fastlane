import type {
  KnowledgeEvidenceItem,
  RetrievalMode,
} from './contracts'
import type { ExpandedCandidate } from './hierarchy-expansion'
import { generateCitationId, generateEvidenceRef } from './citation-ledger'

export interface ContextBuilderOptions {
  topK?: number
  tokenBudget?: number
  retrievalMode?: RetrievalMode
  dataAsOf?: string
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0
  // Standard approximation: ~4 characters per token for Vietnamese/English mix
  return Math.ceil(text.length / 4)
}

export function generateExcerpt(content: string, maxLength = 240): string {
  if (!content) return ''
  const cleaned = content.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 3)}...`
}

/**
 * Khử trùng lặp nội dung, phân bổ ngân sách tokens và định dạng danh sách bằng chứng tri thức (A19-KR-305)
 */
export function buildEvidenceContext(
  candidates: ExpandedCandidate[],
  options: ContextBuilderOptions = {}
): { items: KnowledgeEvidenceItem[]; totalTokensUsed: number } {
  const topK = options.topK ?? 5
  const tokenBudget = options.tokenBudget ?? 2500
  const retrievalMode = options.retrievalMode ?? 'HYBRID_HIERARCHICAL'
  const dataAsOf = options.dataAsOf ?? new Date().toISOString()

  const seenContentHashes = new Set<string>()
  const seenChunkIds = new Set<string>()
  const selectedItems: KnowledgeEvidenceItem[] = []
  let accumulatedTokens = 0

  // 1. Separate DIRECT hits and EXPANDED hits
  const directHits = candidates.filter((c) => c.expansionProvenance === 'DIRECT')
  const expandedHits = candidates.filter((c) => c.expansionProvenance !== 'DIRECT')

  // 2. Select topK direct hits first within budget
  for (const candidate of directHits) {
    if (selectedItems.filter((i) => i.expansionProvenance === 'DIRECT').length >= topK) {
      break
    }

    if (seenChunkIds.has(candidate.chunkId) || seenContentHashes.has(candidate.contentHash)) {
      continue
    }

    const chunkTokens = candidate.tokenCount || estimateTokenCount(candidate.content)
    if (accumulatedTokens + chunkTokens > tokenBudget && selectedItems.length > 0) {
      // Token budget exceeded
      break
    }

    seenChunkIds.add(candidate.chunkId)
    seenContentHashes.add(candidate.contentHash)
    accumulatedTokens += chunkTokens

    const citationId = generateCitationId({
      documentKey: candidate.documentKey,
      versionNo: candidate.versionNo,
      sectionAnchor: candidate.sectionAnchor,
      sourceNodeId: candidate.sourceNodeId || undefined,
    })

    const evidenceRef = generateEvidenceRef(candidate.chunkId, candidate.versionNo)

    selectedItems.push({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentKey: candidate.documentKey,
      knowledgeVersionId: candidate.versionId,
      versionNo: candidate.versionNo,
      indexGenerationId: candidate.indexGenerationId,
      chunkLevel: candidate.chunkLevel,
      hierarchyPath: candidate.hierarchyPath,
      sectionAnchor: candidate.sectionAnchor,
      title: candidate.title,
      sectionTitle: candidate.sectionTitle,
      category: candidate.category,
      content: candidate.content,
      excerpt: generateExcerpt(candidate.content),
      tokenCount: chunkTokens,
      tags: candidate.tags || [],
      scopeMetadata: candidate.scopeMetadata,
      citationId,
      sourceNodeId: candidate.sourceNodeId || undefined,
      imageRefs: candidate.imageRefs || [],
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      dataAsOf,
      ftsRank: candidate.ftsRank,
      ftsScore: candidate.ftsScore,
      vectorRank: candidate.vectorRank,
      vectorScore: candidate.vectorScore,
      rrfScore: candidate.rrfScore,
      retrievalMode,
      evidenceRef,
      expansionProvenance: candidate.expansionProvenance,
    })
  }

  // 3. Add supporting EXPANDED hits (parents / neighbors) if budget allows
  for (const candidate of expandedHits) {
    // `topK` is the hard Agent-facing evidence limit. Hierarchy expansion may
    // add useful support, but it must never turn a final top-5 retrieval into
    // an unbounded prompt payload.
    if (selectedItems.length >= topK) {
      break
    }

    if (seenChunkIds.has(candidate.chunkId) || seenContentHashes.has(candidate.contentHash)) {
      continue
    }

    const chunkTokens = candidate.tokenCount || estimateTokenCount(candidate.content)
    if (accumulatedTokens + chunkTokens > tokenBudget) {
      continue
    }

    seenChunkIds.add(candidate.chunkId)
    seenContentHashes.add(candidate.contentHash)
    accumulatedTokens += chunkTokens

    const citationId = generateCitationId({
      documentKey: candidate.documentKey,
      versionNo: candidate.versionNo,
      sectionAnchor: candidate.sectionAnchor,
      sourceNodeId: candidate.sourceNodeId || undefined,
    })

    const evidenceRef = generateEvidenceRef(candidate.chunkId, candidate.versionNo)

    selectedItems.push({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentKey: candidate.documentKey,
      knowledgeVersionId: candidate.versionId,
      versionNo: candidate.versionNo,
      indexGenerationId: candidate.indexGenerationId,
      chunkLevel: candidate.chunkLevel,
      hierarchyPath: candidate.hierarchyPath,
      sectionAnchor: candidate.sectionAnchor,
      title: candidate.title,
      sectionTitle: candidate.sectionTitle,
      category: candidate.category,
      content: candidate.content,
      excerpt: generateExcerpt(candidate.content),
      tokenCount: chunkTokens,
      tags: candidate.tags || [],
      scopeMetadata: candidate.scopeMetadata,
      citationId,
      sourceNodeId: candidate.sourceNodeId || undefined,
      imageRefs: candidate.imageRefs || [],
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      dataAsOf,
      ftsRank: undefined,
      ftsScore: undefined,
      vectorRank: undefined,
      vectorScore: undefined,
      rrfScore: candidate.rrfScore,
      retrievalMode,
      evidenceRef,
      expansionProvenance: candidate.expansionProvenance,
    })
  }

  return {
    items: selectedItems,
    totalTokensUsed: accumulatedTokens,
  }
}
