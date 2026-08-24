import type { KnowledgeCategory, PublicationStatus, IndexStatus } from '../versioned-repository'

export type RetrievalMode =
  | 'FTS'
  | 'VECTOR'
  | 'HYBRID_RRF'
  | 'HYBRID_HIERARCHICAL'
  | 'DEGRADED_FTS'

export type ExpansionProvenance = 'DIRECT' | 'PARENT' | 'NEIGHBOR'

export interface KnowledgeImageRef {
  id?: string
  alt?: string
  url: string
}

export interface KnowledgeVisualMediaPointer {
  assetId: string
  annotationId: string
  title: string
  summary: string
  alt: string
  url: string
  mimeType: string
  width: number | null
  height: number | null
  safetyCritical: boolean
  citationId: string
}

export interface KnowledgeScopeFilter {
  vehicleModel?: string
  vehicleType?: 'CAR' | 'MOTORBIKE' | 'ALL'
  modelYear?: number
  market?: string
  customerSegment?: 'ALL' | 'RETAIL' | 'FLEET' | 'PARTNER'
  category?: KnowledgeCategory
  documentKeys?: string[]
  locale?: string
  effectiveAt?: string // ISO timestamp
}

export interface RetrievalOptions {
  retrievalMode?: RetrievalMode
  ftsCandidateLimit?: number
  vectorCandidateLimit?: number
  rrfK?: number
  rrfWeights?: {
    fts: number
    vector: number
  }
  minScoreThreshold?: number
  topK?: number
  tokenBudget?: number
  enableHierarchyExpansion?: boolean
  maxHierarchyExpansionDepth?: number
  generationId?: string
}

export interface KnowledgeScopeMetadata {
  vehicleModel?: string | null
  vehicleType?: 'CAR' | 'MOTORBIKE' | 'ALL' | string | null
  modelYearFrom?: number | null
  modelYearTo?: number | null
  market?: string | null
  customerSegment?: 'ALL' | 'RETAIL' | 'FLEET' | 'PARTNER' | string | null
}

export interface RawChunkCandidate {
  chunkId: string
  documentId: string
  documentKey: string
  versionId: string
  versionNo: number
  indexGenerationId: string
  chunkLevel: number
  hierarchyPath: string
  sectionAnchor: string
  sectionTitle: string
  content: string
  contentHash: string
  tokenCount: number
  tags: string[]
  /** Stable source order used for deterministic procedure-neighbor expansion. */
  chunkOrdinal?: number | null
  /** Scope rows attached to the version; populated by DB retrieval RPCs. */
  scopeMetadata?: KnowledgeScopeMetadata[]
  sourceNodeId?: string | null
  imageRefs?: Array<string | KnowledgeImageRef> | null
  title: string
  slug: string
  category: KnowledgeCategory
  effectiveFrom: string
  effectiveTo: string | null
  publicationStatus: PublicationStatus
  indexStatus: IndexStatus
  rawScore?: number
}

export interface FtsCandidate extends RawChunkCandidate {
  ftsRank: number
  ftsScore: number
}

export interface VectorCandidate extends RawChunkCandidate {
  vectorRank: number
  vectorScore: number
}

export interface KnowledgeEvidenceItem {
  chunkId: string
  documentId: string
  documentKey: string
  knowledgeVersionId: string
  versionNo: number
  indexGenerationId: string
  chunkLevel: number
  hierarchyPath: string
  sectionAnchor: string
  title: string
  sectionTitle: string
  category?: KnowledgeCategory
  content: string
  excerpt: string
  tokenCount: number
  tags: string[]
  sourceId?: string
  citationId: string
  sourceNodeId?: string
  imageRefs: Array<string | KnowledgeImageRef>
  effectiveFrom: string
  effectiveTo: string | null
  dataAsOf: string
  ftsRank?: number
  ftsScore?: number
  vectorRank?: number
  vectorScore?: number
  rrfScore: number
  retrievalMode: RetrievalMode
  evidenceRef: string
  expansionProvenance: ExpansionProvenance
}

export interface KnowledgeRetrievalTelemetry {
  epoch: number
  indexGenerationId: string
  ftsLatencyMs: number
  vectorLatencyMs: number
  fusionLatencyMs: number
  expansionLatencyMs: number
  totalLatencyMs: number
  ftsCandidateCount: number
  vectorCandidateCount: number
  totalEvidenceCount: number
  tokensUsed: number
  degradedReason?: string
}

export interface KnowledgeRetrievalResponse {
  status: 'SUCCESS' | 'NO_MATCH' | 'DEGRADED_FTS' | 'UNAVAILABLE'
  query: string
  filters: KnowledgeScopeFilter
  retrievalMode: RetrievalMode
  items: KnowledgeEvidenceItem[]
  totalFound: number
  telemetry: KnowledgeRetrievalTelemetry
}

export class KnowledgeStorageUnavailableError extends Error {
  readonly code = 'UNAVAILABLE'
  constructor(message: string, cause?: unknown) {
    super(`Knowledge storage unavailable: ${message}`)
    this.name = 'KnowledgeStorageUnavailableError'
    if (cause) {
      this.cause = cause
    }
  }
}
