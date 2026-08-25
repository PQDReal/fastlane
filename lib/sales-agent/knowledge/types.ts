export type KnowledgeCategory =
  | 'WARRANTY_BATTERY'
  | 'DEPOSIT_DELIVERY'
  | 'TECHNICAL_GUIDE'
  | 'PROMOTIONS_FINANCING'
  | 'CHARGING_NETWORK'
  | 'GENERAL_POLICY'

export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type KnowledgeVersionSummary = {
  id: string
  versionNo: number
  publicationStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED' | 'SUPERSEDED'
  indexStatus: 'PENDING' | 'BUILDING' | 'VALIDATING' | 'READY' | 'FAILED'
  createdAt: string
  approvedAt?: string | null
}

export type KnowledgeDocumentSummary = {
  id: string
  slug: string
  title: string
  category: KnowledgeCategory
  status: KnowledgeStatus
  publishedVersion: number
  summary?: string | null
  targetUrl?: string | null
  authorEmail?: string | null
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  latestVersion?: KnowledgeVersionSummary
}

export type KnowledgeDocument = KnowledgeDocumentSummary & {
  contentMarkdown: string
}

export type KnowledgeChunk = {
  id: string
  documentId: string
  version: number
  chunkIndex: number
  sectionTitle: string
  content: string
  targetUrl?: string | null
  tags: string[]
  isActive: boolean
  createdAt: string
}

export type KnowledgeSearchResult = {
  chunkId: string
  documentId: string
  documentSlug: string
  documentTitle: string
  category: KnowledgeCategory
  sectionTitle: string
  content: string
  targetUrl?: string | null
  tags: string[]
  score: number
}

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  WARRANTY_BATTERY: 'Chính sách bảo hành & Pin',
  DEPOSIT_DELIVERY: 'Quy trình đặt cọc & Nhận xe',
  TECHNICAL_GUIDE: 'Cẩm nang & Thông số kỹ thuật',
  PROMOTIONS_FINANCING: 'Ưu đãi & Mua xe trả góp',
  CHARGING_NETWORK: 'Mạng lưới trạm sạc',
  GENERAL_POLICY: 'Chính sách chung',
}

export type VisualAnnotationStatus = 'AI_DRAFT' | 'APPROVED' | 'REJECTED' | 'IGNORED' | 'STALE'

export type VisualReviewStatus = Extract<VisualAnnotationStatus, 'AI_DRAFT' | 'APPROVED' | 'REJECTED'>

export type VisualKnowledgeReviewItem = {
  annotationId: string
  assetId: string
  assetSha256: string
  status: VisualAnnotationStatus
  revisionNo: number
  title: string
  summary: string
  keywords: string[]
  visibleText: string[]
  imageType: string
  confidence: number
  retrievalRecommendation: 'INCLUDE' | 'EXCLUDE' | 'REVIEW'
  safetyCritical: boolean
  sourceUrl: string | null
  mimeType: string
  width: number | null
  height: number | null
  byteSize: number
  occurrenceCount: number
  vehicleModels: string[]
  modelYears: number[]
  sectionTitles: string[]
  contextSnippets: string[]
  sourcePacketId: string | null
  providerLabel: string
  createdAt: string
}

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã xuất bản',
  ARCHIVED: 'Lưu trữ',
}
