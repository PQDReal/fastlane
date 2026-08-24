export type KnowledgeCategory =
  | 'WARRANTY_BATTERY'
  | 'DEPOSIT_DELIVERY'
  | 'TECHNICAL_GUIDE'
  | 'PROMOTIONS_FINANCING'
  | 'CHARGING_NETWORK'
  | 'GENERAL_POLICY'

export type KnowledgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type KnowledgeDocument = {
  id: string
  slug: string
  title: string
  category: KnowledgeCategory
  status: KnowledgeStatus
  publishedVersion: number
  contentMarkdown: string
  summary?: string | null
  authorEmail?: string | null
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export type KnowledgeChunk = {
  id: string
  documentId: string
  version: number
  chunkIndex: number
  sectionTitle: string
  content: string
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

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã xuất bản',
  ARCHIVED: 'Lưu trữ',
}
