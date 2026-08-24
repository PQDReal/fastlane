import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { catalogCacheEngine } from '../cache/catalog-cache'
import { chunkMarkdownDocument } from './chunker'
import { embed } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})
import type {
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchResult,
  KnowledgeStatus,
} from './types'

/**
 * Legacy 058 compatibility repository.
 *
 * Production admin routes and runtime retrieval use
 * `versioned-admin-repository.ts` / `retrieval-service.ts`.  These exports are
 * retained only for migration-era callers and tests; do not wire new code to
 * the direct chunk delete/insert path below because it bypasses 060 lifecycle
 * gates and immutable versions.
 */

// Timeout guard to prevent hanging requests when DB is degraded
const KNOWLEDGE_DB_TIMEOUT_MS = 3_000

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

export async function listKnowledgeDocuments(
  options?: ListDocumentsOptions,
): Promise<{ documents: KnowledgeDocument[]; total: number }> {
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
  if (error) {
    throw new Error(`Không thể tải danh sách tài liệu: ${error.message}`)
  }

  return {
    documents: (data || []).map(mapDocumentRow),
    total: count ?? (data || []).length,
  }
}

export async function getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  )

  if (error) {
    throw new Error(`Không thể truy vấn tài liệu [${id}]: ${error.message}`)
  }

  if (!data) return null
  return mapDocumentRow(data)
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

  const supabase = getSupabaseAdmin()
  const { data, error } = await withKnowledgeDbTimeout(
    supabase
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
      .single(),
  )

  if (error || !data) {
    throw new Error(`Không thể tạo tài liệu: ${error?.message || 'Lỗi DB'}`)
  }

  return mapDocumentRow(data)
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

  const supabase = getSupabaseAdmin()
  const { data, error } = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_documents')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single(),
  )

  if (error || !data) {
    throw new Error(`Không thể cập nhật tài liệu: ${error?.message || 'Lỗi DB'}`)
  }

  return mapDocumentRow(data)
}

export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  // ON DELETE CASCADE automatically purges all chunks in sales_agent_knowledge_chunks table
  const { error } = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_documents')
      .delete()
      .eq('id', id),
  )

  if (error) {
    throw new Error(`Không thể xóa tài liệu: ${error.message}`)
  }

  return true
}

export async function publishKnowledgeDocument(
  id: string,
): Promise<{ document: KnowledgeDocument; chunksCount: number }> {
  const doc = await getKnowledgeDocumentById(id)
  if (!doc) throw new Error('Tài liệu không tồn tại.')

  const nextVersion = (doc.publishedVersion || 0) + 1
  const rawChunks = chunkMarkdownDocument(doc.contentMarkdown, doc.title)
  const now = new Date().toISOString()

  const supabase = getSupabaseAdmin()

  // 1. Delete previous chunks for this document to keep DB 100% clean
  const deleteRes = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_chunks')
      .delete()
      .eq('document_id', id),
  )

  if (deleteRes.error) {
    throw new Error(`Không thể làm sạch chunks cũ: ${deleteRes.error.message}`)
  }

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

    const insertRes = await withKnowledgeDbTimeout(
      supabase.from('sales_agent_knowledge_chunks').insert(chunksToInsert),
    )
    if (insertRes.error) {
      throw new Error(`Không thể lưu chunks mới: ${insertRes.error.message}`)
    }
  }

  // 3. Update document status to PUBLISHED
  const { data: updatedDoc, error } = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_documents')
      .update({
        status: 'PUBLISHED',
        published_version: nextVersion,
        published_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single(),
  )

  if (error || !updatedDoc) {
    throw new Error(`Không thể xuất bản: ${error?.message || 'Lỗi DB'}`)
  }

  return {
    document: mapDocumentRow(updatedDoc),
    chunksCount: rawChunks.length,
  }
}

export async function archiveKnowledgeDocument(id: string): Promise<KnowledgeDocument> {
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()

  // Deactivate chunks
  const chunkRes = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_chunks')
      .update({ is_active: false })
      .eq('document_id', id),
  )

  if (chunkRes.error) {
    throw new Error(`Không thể vô hiệu hóa chunks: ${chunkRes.error.message}`)
  }

  const { data, error } = await withKnowledgeDbTimeout(
    supabase
      .from('sales_agent_knowledge_documents')
      .update({
        status: 'ARCHIVED',
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single(),
  )

  if (error || !data) {
    throw new Error(`Không thể lưu trữ tài liệu: ${error?.message || 'Lỗi DB'}`)
  }

  return mapDocumentRow(data)
}

export async function searchKnowledgeRepository(
  query: string,
  limit: number = 4,
): Promise<KnowledgeSearchResult[]> {
  const cleanQuery = (query || '').toLowerCase().trim()
  if (!cleanQuery) return []

  const queryTerms = cleanQuery
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)

  const snapshot = await catalogCacheEngine.getSnapshotAsync()
  const chunks = snapshot.knowledgeChunks

  if (!chunks || chunks.length === 0) {
    // Không có chunks trong cache/DB -> Trả mảng rỗng (kết quả NO_MATCH), tuyệt đối không fabricate facts
    return []
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

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

export type ManualSearchResult = {
  chunkId: string
  articleId: string
  articleTitle: string
  sectionTitle: string
  content: string
  imageUrl?: string
  similarity: number
}

export async function searchUserManualRepository(query: string, modelSeries?: string, year?: number, limit: number = 3): Promise<ManualSearchResult[]> {
  const cleanQuery = (query || '').trim()
  if (!cleanQuery) return []

  try {
    // Generate embedding for the query
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: cleanQuery,
    })

    const supabase = getSupabaseAdmin()

    // Using match_manual_chunks RPC function (we need to create this in migration but for now we'll write the JS structure)
    // If the RPC is not created, we can fallback or throw error.
    const { data, error } = await supabase.rpc('match_manual_chunks', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: 0.3,
      match_count: limit,
      filter_model_series: modelSeries || null,
      filter_year: year ? year.toString() : null
    })

    if (error || !data) {
      console.warn('match_manual_chunks failed:', error)
      return []
    }

    return data.map((row: any) => ({
      chunkId: row.chunk_id,
      articleId: row.article_id,
      articleTitle: row.article_title,
      sectionTitle: row.section_title,
      content: row.content,
      imageUrl: row.image_url,
      similarity: row.similarity
    }))
  } catch (err) {
    console.error('searchUserManualRepository error:', err)
    return []
  }
}
