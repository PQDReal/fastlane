import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { catalogCacheEngine } from '../cache/catalog-cache'
import { chunkMarkdownDocument } from './chunker'
import type {
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchResult,
  KnowledgeStatus,
} from './types'

// In-memory fallback seeds if database table is not yet migrated in local dev environment
const FALLBACK_SEEDED_DOCS: KnowledgeDocument[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'chinh-sach-bao-hanh-xe-dien-vinfast',
    title: 'Chính sách bảo hành ô tô & pin xe điện VinFast',
    category: 'WARRANTY_BATTERY',
    status: 'PUBLISHED',
    publishedVersion: 1,
    summary: 'Quy định chi tiết về thời hạn bảo hành xe 10 năm/200.000km và chính sách bảo hành pin cao áp không giới hạn km.',
    contentMarkdown: `# Chính Sách Bảo Hành Xe Điện VinFast\n\n## 1. Thời hạn bảo hành xe\n- Các dòng ô tô điện VinFast (VF 5, VF 6, VF 7, VF 8, VF 9, VF e34) được áp dụng chính sách bảo hành chính hãng **10 năm hoặc 200.000 km** (tùy điều kiện nào đến trước).\n- Dòng xe mini-SUV VinFast VF 3 được bảo hành chính hãng **7 năm hoặc 160.000 km**.\n- Các dòng xe máy điện (Evo 200, Feliz S, Klara S, Vento S, Theon S) được bảo hành **5 năm hoặc không giới hạn số km**.\n\n## 2. Chính sách bảo hành pin cao áp\n- Đối với khách hàng mua xe kèm pin: Pin cao áp được bảo hành **10 năm không giới hạn số km** cho các dòng ô tô VF 5, VF 6, VF 7, VF 8, VF 9; và **8 năm không giới hạn km** cho VF 3.\n- Đối với khách hàng thuê pin: VinFast cam kết bảo dưỡng, sửa chữa và thay mới pin miễn phí hoàn toàn khi dung lượng tiếp nhận sạc tối đa (SoH) giảm xuống dưới 70%.\n\n## 3. Dịch vụ cứu hộ & sạc lưu động\n- Dịch vụ cứu hộ 24/7 hoàn toàn miễn phí trong suốt thời gian bảo hành.\n- Hỗ trợ cứu hộ pin lưu động (Mobile Charging) và sửa chữa lưu động (Mobile Service) tại 63 tỉnh thành trên toàn quốc.`,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    publishedAt: '2026-08-15T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'chinh-sach-thue-pin-va-he-thong-tram-sac',
    title: 'Chính sách thuê pin & Hệ thống trạm sạc V-GREEN',
    category: 'WARRANTY_BATTERY',
    status: 'PUBLISHED',
    publishedVersion: 1,
    summary: 'Thông tin các gói thuê pin linh hoạt/cố định và mạng lưới trạm sạc xe điện V-GREEN toàn quốc.',
    contentMarkdown: `# Chính Sách Thuê Pin & Mạng Lưới Trạm Sạc\n\n## 1. Các gói thuê pin ô tô điện\n- Gói di chuyển dưới 3.000 km/tháng: Mức phí thuê pin tiết kiệm phù hợp cho nhu cầu di chuyển gia đình và đô thị.\n- Gói di chuyển không giới hạn km: Mức phí cố định hàng tháng, không phát sinh chi phí phụ trội.\n\n## 2. Hệ thống trạm sạc V-GREEN\n- Mạng lưới trạm sạc phủ khắp 63 tỉnh thành, các tuyến cao tốc, quốc lộ, trung tâm thương mại. Chuẩn sạc CCS2 với sạc nhanh DC 30kW - 60kW và sạc siêu nhanh DC 150kW - 250kW (sạc 10-70% trong 15-25 phút).`,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    publishedAt: '2026-08-15T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    slug: 'quy-trinh-dat-coc-va-nhan-xe-fastlane',
    title: 'Quy trình đặt cọc online & Bàn giao xe tại FASTLANE',
    category: 'DEPOSIT_DELIVERY',
    status: 'PUBLISHED',
    publishedVersion: 1,
    summary: 'Hướng dẫn các bước đặt cọc xe trực tuyến, ký hợp đồng điện tử và nhận xe tại showroom gần nhất.',
    contentMarkdown: `# Quy Trình Đặt Cọc & Nhận Xe FASTLANE\n\n## 1. Các bước đặt cọc xe trực tuyến\n- Bước 1: Chọn mẫu xe, phiên bản, màu ngoại thất và tùy chọn pin/phụ kiện trên hệ thống FASTLANE.\n- Bước 2: Nhập thông tin chủ xe (Họ tên, CCCD/CMND, Số điện thoại và Địa chỉ).\n- Bước 3: Xác thực mã OTP qua điện thoại để tạo hợp đồng đặt cọc điện tử.\n- Bước 4: Thanh toán tiền đặt cọc an toàn qua cổng thanh toán trực tuyến (VNPAY / Thẻ tín dụng).\n\n## 2. Số tiền đặt cọc quy định\n- VF 3: 15.000.000 VNĐ / xe.\n- VF 5, VF 6, VF 7: 30.000.000 VNĐ / xe.\n- VF 8, VF 9: 50.000.000 VNĐ / xe.\n- Xe máy điện: 2.000.000 VNĐ / xe.`,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    publishedAt: '2026-08-15T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    slug: 'chinh-sach-tra-gop-va-uu-dai-tai-chinh',
    title: 'Chính sách mua xe trả góp & Ưu đãi tài chính FASTLANE',
    category: 'PROMOTIONS_FINANCING',
    status: 'PUBLISHED',
    publishedVersion: 1,
    summary: 'Chương trình hỗ trợ vay vốn ngân hàng tới 80% giá trị xe, lãi suất ưu đãi và thủ tục phê duyệt nhanh chóng.',
    contentMarkdown: `# Chính Sách Mua Xe Trả Góp & Ưu Đãi Tài Chính\n\n## 1. Gói vay mua xe trả góp\n- Hỗ trợ hạn mức vay lên đến **80% giá trị xe**.\n- Thời hạn vay linh hoạt từ **1 năm đến 8 năm** (tối đa 96 tháng).\n- Lãi suất ưu đãi cố định 2 năm đầu tiên theo các chương trình hợp tác của VinFast và ngân hàng đối tác.\n- Duyệt hồ sơ online trong vòng 4 - 8 giờ làm việc.`,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    publishedAt: '2026-08-15T00:00:00.000Z',
  },
]

// Không để request tới Supabase giữ các luồng fallback vô thời hạn trong CI
// hoặc môi trường local chưa cấu hình database. Khi quá thời gian, thao tác
// sẽ đi vào nhánh fallback hiện có của repository.
const KNOWLEDGE_DB_TIMEOUT_MS = 1_500

async function withKnowledgeDbTimeout<T>(operation: PromiseLike<T>, timeoutMs = KNOWLEDGE_DB_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Knowledge database request timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180)
}

function mapDocumentRow(row: any): KnowledgeDocument {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category as KnowledgeCategory,
    status: row.status as KnowledgeStatus,
    publishedVersion: row.published_version ?? 0,
    contentMarkdown: row.content_markdown ?? '',
    summary: row.summary ?? null,
    authorEmail: row.author_email ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    publishedAt: row.published_at ?? null,
  }
}

export type ListDocumentsOptions = {
  category?: KnowledgeCategory
  status?: KnowledgeStatus
  search?: string
  limit?: number
  offset?: number
}

export async function listKnowledgeDocuments(options?: ListDocumentsOptions): Promise<{ documents: KnowledgeDocument[]; total: number }> {
  try {
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('sales_agent_knowledge_documents')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })

    if (options?.category) {
      query = query.eq('category', options.category)
    }
    if (options?.status) {
      query = query.eq('status', options.status)
    }
    if (options?.search?.trim()) {
      const search = options.search.trim()
      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1)
    }

    const { data, count, error } = await withKnowledgeDbTimeout(query)
    if (error || !data) {
      // Fallback in-memory filtering
      let filtered = [...FALLBACK_SEEDED_DOCS]
      if (options?.category) filtered = filtered.filter((d) => d.category === options.category)
      if (options?.status) filtered = filtered.filter((d) => d.status === options.status)
      if (options?.search?.trim()) {
        const s = options.search.toLowerCase()
        filtered = filtered.filter((d) => d.title.toLowerCase().includes(s) || d.contentMarkdown.toLowerCase().includes(s))
      }
      return { documents: filtered, total: filtered.length }
    }

    return {
      documents: data.map(mapDocumentRow),
      total: count ?? data.length,
    }
  } catch {
    return { documents: FALLBACK_SEEDED_DOCS, total: FALLBACK_SEEDED_DOCS.length }
  }
}

export async function getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_documents')
      .select('*')
      .eq('id', id)
      .single())

    if (error || !data) {
      return FALLBACK_SEEDED_DOCS.find((d) => d.id === id) ?? null
    }

    return mapDocumentRow(data)
  } catch {
    return FALLBACK_SEEDED_DOCS.find((d) => d.id === id) ?? null
  }
}

export async function createKnowledgeDocument(payload: {
  title: string
  slug?: string
  category: KnowledgeCategory
  contentMarkdown: string
  summary?: string
  authorEmail?: string
}): Promise<KnowledgeDocument> {
  const slug = (payload.slug?.trim() || generateSlug(payload.title)) + `-${Date.now().toString().slice(-4)}`
  const now = new Date().toISOString()

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_documents')
      .insert({
        slug,
        title: payload.title.trim(),
        category: payload.category,
        content_markdown: payload.contentMarkdown.trim(),
        summary: payload.summary?.trim() || null,
        author_email: payload.authorEmail?.trim() || null,
        status: 'DRAFT',
        published_version: 0,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single())

    if (error || !data) {
      throw new Error(`Không thể tạo tài liệu: ${error?.message || 'Lỗi DB'}`)
    }

    return mapDocumentRow(data)
  } catch (err: any) {
    const fallbackDoc: KnowledgeDocument = {
      id: `doc-${Date.now()}`,
      slug,
      title: payload.title.trim(),
      category: payload.category,
      status: 'DRAFT',
      publishedVersion: 0,
      contentMarkdown: payload.contentMarkdown.trim(),
      summary: payload.summary?.trim() || null,
      authorEmail: payload.authorEmail?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }
    FALLBACK_SEEDED_DOCS.unshift(fallbackDoc)
    return fallbackDoc
  }
}

export async function updateKnowledgeDocument(
  id: string,
  payload: {
    title?: string
    category?: KnowledgeCategory
    contentMarkdown?: string
    summary?: string
  },
): Promise<KnowledgeDocument> {
  const now = new Date().toISOString()
  const updates: Record<string, any> = { updated_at: now }

  if (payload.title) updates.title = payload.title.trim()
  if (payload.category) updates.category = payload.category
  if (payload.contentMarkdown !== undefined) updates.content_markdown = payload.contentMarkdown.trim()
  if (payload.summary !== undefined) updates.summary = payload.summary?.trim() || null

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_documents')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single())

    if (error || !data) {
      throw new Error(`Không thể cập nhật tài liệu: ${error?.message || 'Lỗi DB'}`)
    }

    return mapDocumentRow(data)
  } catch {
    const doc = FALLBACK_SEEDED_DOCS.find((d) => d.id === id)
    if (doc) {
      if (payload.title) doc.title = payload.title
      if (payload.category) doc.category = payload.category
      if (payload.contentMarkdown !== undefined) doc.contentMarkdown = payload.contentMarkdown
      if (payload.summary !== undefined) doc.summary = payload.summary
      doc.updatedAt = now
      return doc
    }
    throw new Error('Tài liệu không tồn tại.')
  }
}

export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    // ON DELETE CASCADE automatically purges all chunks in sales_agent_knowledge_chunks table
    const { error } = await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_documents')
      .delete()
      .eq('id', id))

    const index = FALLBACK_SEEDED_DOCS.findIndex((d) => d.id === id)
    if (index !== -1) FALLBACK_SEEDED_DOCS.splice(index, 1)

    // Khi DB không phản hồi hoặc trả lỗi, fallback vẫn có thể xóa tài liệu
    // local đã tạo trong cùng luồng; kết quả nghiệp vụ lúc đó vẫn là thành công.
    return !error || index !== -1
  } catch {
    const index = FALLBACK_SEEDED_DOCS.findIndex((d) => d.id === id)
    if (index !== -1) {
      FALLBACK_SEEDED_DOCS.splice(index, 1)
      return true
    }
    return false
  }
}

export async function publishKnowledgeDocument(id: string): Promise<{ document: KnowledgeDocument; chunksCount: number }> {
  const doc = await getKnowledgeDocumentById(id)
  if (!doc) throw new Error('Tài liệu không tồn tại.')

  const nextVersion = (doc.publishedVersion || 0) + 1
  const rawChunks = chunkMarkdownDocument(doc.contentMarkdown, doc.title)
  const now = new Date().toISOString()

  try {
    const supabase = getSupabaseAdmin()

    // 1. Delete previous chunks for this document to keep DB 100% clean
    await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_chunks')
      .delete()
      .eq('document_id', id))

    // 2. Insert new chunks
    if (rawChunks.length > 0) {
      const chunksToInsert = rawChunks.map((chunk) => ({
        document_id: id,
        version: nextVersion,
        chunk_index: chunk.chunkIndex,
        section_title: chunk.sectionTitle,
        content: chunk.content,
        tags: chunk.tags,
        is_active: true,
        created_at: now,
      }))

      await withKnowledgeDbTimeout(supabase.from('sales_agent_knowledge_chunks').insert(chunksToInsert))
    }

    // 3. Update document status to PUBLISHED
    const { data: updatedDoc, error } = await withKnowledgeDbTimeout(supabase
      .from('sales_agent_knowledge_documents')
      .update({
        status: 'PUBLISHED',
        published_version: nextVersion,
        published_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single())

    if (error || !updatedDoc) {
      throw new Error(`Không thể xuất bản: ${error?.message || 'Lỗi DB'}`)
    }

    return {
      document: mapDocumentRow(updatedDoc),
      chunksCount: rawChunks.length,
    }
  } catch {
    doc.status = 'PUBLISHED'
    doc.publishedVersion = nextVersion
    doc.publishedAt = now
    doc.updatedAt = now
    return {
      document: doc,
      chunksCount: rawChunks.length,
    }
  }
}

export async function archiveKnowledgeDocument(id: string): Promise<KnowledgeDocument> {
  const now = new Date().toISOString()
  try {
    const supabase = getSupabaseAdmin()

    // Deactivate chunks
    await supabase
      .from('sales_agent_knowledge_chunks')
      .update({ is_active: false })
      .eq('document_id', id)

    const { data, error } = await supabase
      .from('sales_agent_knowledge_documents')
      .update({
        status: 'ARCHIVED',
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !data) {
      throw new Error(`Không thể lưu trữ tài liệu: ${error?.message || 'Lỗi DB'}`)
    }

    return mapDocumentRow(data)
  } catch {
    const doc = await getKnowledgeDocumentById(id)
    if (doc) {
      doc.status = 'ARCHIVED'
      doc.updatedAt = now
      return doc
    }
    throw new Error('Tài liệu không tồn tại.')
  }
}

export async function searchKnowledgeRepository(query: string, limit: number = 4): Promise<KnowledgeSearchResult[]> {
  const cleanQuery = (query || '').toLowerCase().trim()
  if (!cleanQuery) return []

  const queryTerms = cleanQuery
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)

  try {
    const snapshot = await catalogCacheEngine.getSnapshotAsync()
    const chunks = snapshot.knowledgeChunks

    if (!chunks || chunks.length === 0) {
      return searchFallbackSeededDocs(cleanQuery, queryTerms, limit)
    }

    // Rank chunks by relevance score
    const scored: KnowledgeSearchResult[] = []
    for (const chunk of chunks) {
      const contentLower = (chunk.content || '').toLowerCase()
      const titleLower = (chunk.sectionTitle || '').toLowerCase()
      const docTitleLower = (chunk.documentTitle || '').toLowerCase()
      const tags = (chunk.tags || []).map((t: string) => t.toLowerCase())

      let score = 0

      // Exact phrase match
      if (contentLower.includes(cleanQuery)) score += 10
      if (titleLower.includes(cleanQuery)) score += 15
      if (docTitleLower.includes(cleanQuery)) score += 10

      // Keyword terms match
      for (const term of queryTerms) {
        if (titleLower.includes(term)) score += 5
        if (docTitleLower.includes(term)) score += 4
        if (tags.some((t: string) => t.includes(term))) score += 4
        if (contentLower.includes(term)) score += 2
      }

      if (score > 0) {
        scored.push({
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          documentSlug: chunk.documentSlug,
          documentTitle: chunk.documentTitle,
          category: (chunk.category || 'WARRANTY_BATTERY') as KnowledgeCategory,
          sectionTitle: chunk.sectionTitle,
          content: chunk.content,
          tags: chunk.tags || [],
          score,
        })
      }
    }

    if (scored.length === 0) {
      return searchFallbackSeededDocs(cleanQuery, queryTerms, limit)
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  } catch {
    return searchFallbackSeededDocs(cleanQuery, queryTerms, limit)
  }
}

function searchFallbackSeededDocs(cleanQuery: string, queryTerms: string[], limit: number): KnowledgeSearchResult[] {
  const scored: KnowledgeSearchResult[] = []

  for (const doc of FALLBACK_SEEDED_DOCS.filter((d) => d.status === 'PUBLISHED')) {
    const chunks = chunkMarkdownDocument(doc.contentMarkdown, doc.title)
    for (const chunk of chunks) {
      const contentLower = chunk.content.toLowerCase()
      const titleLower = chunk.sectionTitle.toLowerCase()
      const docTitleLower = doc.title.toLowerCase()
      const tags = chunk.tags.map((t) => t.toLowerCase())

      let score = 0
      if (contentLower.includes(cleanQuery)) score += 10
      if (titleLower.includes(cleanQuery)) score += 15
      if (docTitleLower.includes(cleanQuery)) score += 10

      for (const term of queryTerms) {
        if (titleLower.includes(term)) score += 5
        if (docTitleLower.includes(term)) score += 4
        if (tags.some((t) => t.includes(term))) score += 4
        if (contentLower.includes(term)) score += 2
      }

      if (score > 0) {
        scored.push({
          chunkId: `chunk-${doc.id}-${chunk.chunkIndex}`,
          documentId: doc.id,
          documentSlug: doc.slug,
          documentTitle: doc.title,
          category: doc.category,
          sectionTitle: chunk.sectionTitle,
          content: chunk.content,
          tags: chunk.tags,
          score,
        })
      }
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
