import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { VersionedKnowledgeRepository } from './versioned-repository'
import { OPENAI_EMBEDDING_GENERATION_ID } from './embedding-adapter'
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeDocumentSummary,
  KnowledgeVersionSummary,
  KnowledgeStatus,
} from './types'

const configuredDbTimeoutMs = Number(process.env.SALES_AGENT_KNOWLEDGE_DB_TIMEOUT_MS)
const DB_TIMEOUT_MS = Number.isFinite(configuredDbTimeoutMs) && configuredDbTimeoutMs > 0
  ? configuredDbTimeoutMs
  : process.env.NODE_ENV === 'development'
    ? 15_000
    : 8_000
const DEFAULT_GENERATION_ID = OPENAI_EMBEDDING_GENERATION_ID
const DOCUMENT_SUMMARY_COLUMNS = 'id,slug,title,category,status,published_version,summary,author_email,created_at,updated_at,published_at,active_version_id,lifecycle_status,deleted_at,target_url'
const DOCUMENT_DETAIL_COLUMNS = `${DOCUMENT_SUMMARY_COLUMNS},content_markdown`
const VERSION_SUMMARY_COLUMNS = 'id,document_id,version_no,summary,publication_status,index_status,approved_at,created_at'
const VERSION_DETAIL_COLUMNS = `${VERSION_SUMMARY_COLUMNS},content_markdown,content_checksum,effective_from,effective_to`

type VersionSummaryRow = {
  id: string
  document_id: string
  version_no: number
  summary: string | null
  publication_status: string
  index_status: string
  approved_at: string | null
  created_at: string
}

type VersionRow = VersionSummaryRow & {
  content_markdown: string
  content_checksum: string
  effective_from: string
  effective_to: string | null
}

function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    Promise.resolve(operation),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Knowledge database request timed out.')), DB_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function generateSlug(title: string): string {
  return `${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180)}-${Date.now().toString().slice(-4)}`
}

function isRuntimePublished(version?: VersionSummaryRow): boolean {
  return version?.publication_status === 'PUBLISHED' && version.index_status === 'READY'
}

function mapDocumentSummary(
  row: any,
  activeVersion?: VersionSummaryRow,
  latestVersion?: VersionSummaryRow,
): KnowledgeDocumentSummary {
  const pendingDraft = latestVersion && latestVersion.id !== activeVersion?.id &&
    ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(latestVersion.publication_status)
  const runtimePublished = isRuntimePublished(activeVersion)
  const status: KnowledgeStatus = row.lifecycle_status === 'ARCHIVED' || row.deleted_at
    ? 'ARCHIVED'
    : runtimePublished && !pendingDraft
      ? 'PUBLISHED'
      : 'DRAFT'
  const visibleVersion = pendingDraft ? latestVersion : activeVersion || latestVersion

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    category: row.category as KnowledgeCategory,
    status,
    publishedVersion: runtimePublished ? Number(activeVersion?.version_no ?? row.published_version ?? 0) : 0,
    summary: visibleVersion?.summary ?? row.summary ?? null,
    targetUrl: row.target_url ?? null,
    authorEmail: row.author_email ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: runtimePublished ? row.published_at ?? null : null,
    latestVersion: latestVersion
      ? {
          id: String(latestVersion.id),
          versionNo: Number(latestVersion.version_no),
          publicationStatus: latestVersion.publication_status as KnowledgeVersionSummary['publicationStatus'],
          indexStatus: latestVersion.index_status as KnowledgeVersionSummary['indexStatus'],
          createdAt: String(latestVersion.created_at),
          approvedAt: latestVersion.approved_at,
        }
      : undefined,
  }
}

function mapDocument(row: any, activeVersion?: VersionRow, latestVersion?: VersionRow): KnowledgeDocument {
  const pendingDraft = latestVersion && latestVersion.id !== activeVersion?.id &&
    ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(latestVersion.publication_status)
  const visibleVersion = pendingDraft ? latestVersion : activeVersion || latestVersion
  return {
    ...mapDocumentSummary(row, activeVersion, latestVersion),
    contentMarkdown: String(visibleVersion?.content_markdown ?? row.content_markdown ?? ''),
  }
}

async function loadVersionSummaryRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentIds: string[],
): Promise<VersionSummaryRow[]> {
  if (documentIds.length === 0) return []
  const { data, error } = await withTimeout(
    supabase
      .from('sales_agent_knowledge_versions')
      .select(VERSION_SUMMARY_COLUMNS)
      .in('document_id', documentIds)
      .order('version_no', { ascending: false }),
  )
  if (error) throw new Error(`Không thể tải phiên bản tài liệu: ${error.message}`)
  return (data || []) as VersionSummaryRow[]
}

async function loadVersionRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  documentIds: string[],
): Promise<VersionRow[]> {
  if (documentIds.length === 0) return []
  const { data, error } = await withTimeout(
    supabase
      .from('sales_agent_knowledge_versions')
      .select(VERSION_DETAIL_COLUMNS)
      .in('document_id', documentIds)
      .order('version_no', { ascending: false }),
  )
  if (error) throw new Error(`Không thể tải phiên bản tài liệu: ${error.message}`)
  return (data || []) as VersionRow[]
}

async function loadDocuments(options?: { id?: string }): Promise<{ rows: any[]; versions: VersionRow[] }> {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('sales_agent_knowledge_documents')
    .select(DOCUMENT_DETAIL_COLUMNS)
    .order('updated_at', { ascending: false })

  if (options?.id) query = query.eq('id', options.id)
  const { data, error } = await withTimeout(query)
  if (error) throw new Error(`Không thể tải danh sách tài liệu: ${error.message}`)
  const rows = data || []
  return {
    rows,
    versions: await loadVersionRows(supabase, rows.map((row: any) => String(row.id))),
  }
}

function indexVersions<T extends VersionSummaryRow>(versions: T[]): {
  activeById: Map<string, T>
  latestByDocument: Map<string, T>
} {
  const activeById = new Map<string, T>()
  const latestByDocument = new Map<string, T>()
  for (const version of versions) {
    activeById.set(version.id, version)
    if (!latestByDocument.has(version.document_id)) latestByDocument.set(version.document_id, version)
  }
  return { activeById, latestByDocument }
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
): Promise<{ documents: KnowledgeDocumentSummary[]; total: number }> {
  const supabase = getSupabaseAdmin()
  const offset = Math.max(0, options?.offset ?? 0)
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20))
  const search = options?.search?.trim().toLowerCase()
  const requiresInMemoryFilter = Boolean(search || options?.status)

  let query = supabase
    .from('sales_agent_knowledge_documents')
    .select(DOCUMENT_SUMMARY_COLUMNS, { count: 'exact' })
    .neq('lifecycle_status', 'DELETED')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (options?.category) query = query.eq('category', options.category)
  if (!requiresInMemoryFilter) query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await withTimeout(query)
  if (error) throw new Error(`Không thể tải danh sách tài liệu: ${error.message}`)

  const rows = data || []
  const versions = await loadVersionSummaryRows(supabase, rows.map((row: any) => String(row.id)))
  const { activeById, latestByDocument } = indexVersions(versions)

  const filtered = rows
    .map((row: any) => mapDocumentSummary(row, activeById.get(String(row.active_version_id)), latestByDocument.get(String(row.id))))
    .filter((document) => !options?.status || document.status === options.status)
    .filter((document) => !search || `${document.title} ${document.slug} ${document.summary || ''}`.toLowerCase().includes(search))

  return {
    documents: requiresInMemoryFilter ? filtered.slice(offset, offset + limit) : filtered,
    total: requiresInMemoryFilter ? filtered.length : count ?? filtered.length,
  }
}

export async function getKnowledgeDocumentById(id: string): Promise<KnowledgeDocument | null> {
  const { rows, versions } = await loadDocuments({ id })
  if (rows.length === 0) return null
  const { activeById, latestByDocument } = indexVersions(versions)
  const row = rows[0]
  return mapDocument(row, activeById.get(String(row.active_version_id)), latestByDocument.get(String(row.id)))
}

export async function createKnowledgeDocument(payload: {
  title: string
  slug?: string
  category: KnowledgeCategory
  contentMarkdown: string
  summary?: string
  targetUrl?: string
  authorEmail?: string
  authorId?: string
}): Promise<KnowledgeDocument> {
  const supabase = getSupabaseAdmin()
  const repo = new VersionedKnowledgeRepository(supabase)
  const slug = payload.slug?.trim() || generateSlug(payload.title)
  const created = await repo.createDocumentDraft({
    documentKey: slug,
    locale: 'vi-VN',
    category: payload.category,
    title: payload.title.trim(),
    slug,
    contentMarkdown: payload.contentMarkdown.trim(),
    summary: payload.summary?.trim(),
    authorId: payload.authorId,
  })

  const docUpdates: Record<string, any> = {}
  if (payload.authorEmail?.trim()) docUpdates.author_email = payload.authorEmail.trim()
  if (payload.targetUrl?.trim()) docUpdates.target_url = payload.targetUrl.trim()

  if (Object.keys(docUpdates).length > 0) {
    const { error } = await withTimeout(
      supabase
        .from('sales_agent_knowledge_documents')
        .update(docUpdates)
        .eq('id', created.document.id),
    )
    if (error) throw new Error(`Không thể lưu thông tin bổ sung tài liệu: ${error.message}`)

    if (payload.targetUrl?.trim()) {
      await withTimeout(
        supabase
          .from('sales_agent_knowledge_versions')
          .update({ target_url: payload.targetUrl.trim() })
          .eq('id', created.version.id),
      )
    }
  }

  return {
    id: created.document.id,
    slug: created.document.slug,
    title: created.document.title,
    category: created.document.category as KnowledgeCategory,
    status: 'DRAFT',
    publishedVersion: 0,
    contentMarkdown: created.version.contentMarkdown,
    summary: created.version.summary,
    targetUrl: payload.targetUrl?.trim() || null,
    authorEmail: payload.authorEmail?.trim() || null,
    createdAt: created.document.createdAt,
    updatedAt: created.document.updatedAt,
    publishedAt: null,
    latestVersion: {
      id: created.version.id,
      versionNo: created.version.versionNo,
      publicationStatus: created.version.publicationStatus,
      indexStatus: created.version.indexStatus,
      createdAt: created.version.createdAt,
      approvedAt: null,
    },
  }
}

export async function updateKnowledgeDocument(
  id: string,
  payload: { title?: string; category?: KnowledgeCategory; contentMarkdown?: string; summary?: string; targetUrl?: string; authorId?: string },
): Promise<KnowledgeDocument> {
  const current = await getKnowledgeDocumentById(id)
  if (!current) throw new Error('Tài liệu không tồn tại.')

  const supabase = getSupabaseAdmin()
  const { rows, versions } = await loadDocuments({ id })
  const { latestByDocument } = indexVersions(versions)
  const latest = latestByDocument.get(id)
  if (!latest) throw new Error('Tài liệu chưa có phiên bản bất biến.')

  const repo = new VersionedKnowledgeRepository(supabase)
  const newVersion = await repo.createNewVersionDraft(
    id,
    payload.contentMarkdown?.trim() ?? latest.content_markdown,
    payload.authorId,
    payload.summary !== undefined ? payload.summary?.trim() : latest.summary || undefined,
  )

  const updates: Record<string, any> = {}
  if (payload.title?.trim()) updates.title = payload.title.trim()
  if (payload.category) updates.category = payload.category
  if (payload.targetUrl !== undefined) updates.target_url = payload.targetUrl.trim() || null

  if (Object.keys(updates).length > 0) {
    const { error } = await withTimeout(supabase.from('sales_agent_knowledge_documents').update(updates).eq('id', id))
    if (error) throw new Error(`Không thể cập nhật thông tin tài liệu: ${error.message}`)

    if (updates.target_url !== undefined && newVersion?.id) {
      await withTimeout(
        supabase
          .from('sales_agent_knowledge_versions')
          .update({ target_url: updates.target_url })
          .eq('id', newVersion.id),
      )
    }
  }

  return (await getKnowledgeDocumentById(id)) || current
}

export async function deleteKnowledgeDocument(id: string, actorId?: string): Promise<boolean> {
  const result = await new VersionedKnowledgeRepository(getSupabaseAdmin()).softDeleteDocument(
    id,
    actorId,
    'Admin soft delete',
  )
  return result.success
}

export async function archiveKnowledgeDocument(id: string, actorId?: string): Promise<KnowledgeDocument> {
  await new VersionedKnowledgeRepository(getSupabaseAdmin()).archiveDocument(id, actorId, 'Admin archive')
  const document = await getKnowledgeDocumentById(id)
  if (!document) throw new Error('Tài liệu không tồn tại sau khi lưu trữ.')
  return document
}

export async function publishKnowledgeDocument(
  id: string,
  actorId?: string,
): Promise<{ document: KnowledgeDocument; chunksCount: number }> {
  const supabase = getSupabaseAdmin()
  const { rows, versions } = await loadDocuments({ id })
  if (rows.length === 0) throw new Error('Tài liệu không tồn tại.')
  const { latestByDocument } = indexVersions(versions)
  const latest = latestByDocument.get(id)
  if (!latest) throw new Error('Tài liệu chưa có phiên bản để xuất bản.')
  if (latest.index_status !== 'READY') {
    throw new Error(`PUBLISH_NOT_READY: Phiên bản v${latest.version_no} chưa lập chỉ mục READY.`)
  }
  if (!['APPROVED', 'PUBLISHED'].includes(latest.publication_status)) {
    throw new Error(`PUBLISH_NOT_APPROVED: Phiên bản v${latest.version_no} chưa được maker-checker phê duyệt.`)
  }

  await new VersionedKnowledgeRepository(supabase).activateVersion(
    id,
    latest.id,
    actorId,
    'Admin activate indexed version',
  )

  const { count, error } = await withTimeout(
    supabase
      .from('sales_agent_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', latest.id)
      .eq('index_generation_id', DEFAULT_GENERATION_ID)
      .eq('is_active', true),
  )
  if (error) throw new Error(`Không thể đếm chunks phiên bản: ${error.message}`)
  const document = await getKnowledgeDocumentById(id)
  if (!document) throw new Error('Tài liệu không tồn tại sau khi xuất bản.')
  return { document, chunksCount: count ?? 0 }
}

export async function approveKnowledgeDocument(id: string, reviewerId: string): Promise<KnowledgeDocument> {
  const { versions } = await loadDocuments({ id })
  const { latestByDocument } = indexVersions(versions)
  const latest = latestByDocument.get(id)
  if (!latest) throw new Error('Tài liệu chưa có phiên bản để phê duyệt.')
  await new VersionedKnowledgeRepository(getSupabaseAdmin()).approveVersion(latest.id, reviewerId)
  const document = await getKnowledgeDocumentById(id)
  if (!document) throw new Error('Tài liệu không tồn tại sau khi phê duyệt.')
  return document
}

export async function enqueueKnowledgeIndex(
  id: string,
  indexGenerationId = DEFAULT_GENERATION_ID,
): Promise<{ jobId: string; versionId: string }> {
  const { versions } = await loadDocuments({ id })
  const { latestByDocument } = indexVersions(versions)
  const latest = latestByDocument.get(id)
  if (!latest) throw new Error('Tài liệu chưa có phiên bản để lập chỉ mục.')
  if (!['APPROVED', 'PUBLISHED'].includes(latest.publication_status)) {
    throw new Error(`VERSION_NOT_APPROVED: Phiên bản v${latest.version_no} chưa được maker-checker phê duyệt.`)
  }
  const jobId = await new VersionedKnowledgeRepository(getSupabaseAdmin()).enqueueIndexJob(latest.id, indexGenerationId)
  return { jobId, versionId: latest.id }
}
