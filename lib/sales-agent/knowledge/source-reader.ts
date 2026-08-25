import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isKnowledgeSourceChunkId } from '../navigation/paths'
import { generateCitationId } from './retrieval/citation-ledger'

export type KnowledgeSource = {
  chunkId: string
  documentKey: string
  title: string
  category: string
  vehicleModel: string | null
  modelYear: number | null
  locale: string
  versionNo: number
  sectionTitle: string
  sectionAnchor: string
  hierarchyPath: string
  content: string
  targetUrl: string | null
  citationId: string
  effectiveFrom: string | null
}

function isEffectiveVersion(
  effectiveFrom: unknown,
  effectiveTo: unknown,
  nowMs: number,
) {
  const fromMs = effectiveFrom ? Date.parse(String(effectiveFrom)) : Number.NEGATIVE_INFINITY
  const toMs = effectiveTo ? Date.parse(String(effectiveTo)) : Number.POSITIVE_INFINITY
  return (!Number.isFinite(fromMs) || fromMs <= nowMs)
    && (!Number.isFinite(toMs) || toMs > nowMs)
}

/**
 * Resolves the exact RAG chunk cited by a chat turn. The active document and
 * published version checks prevent old, draft or replaced content from being
 * exposed by a previously issued URL.
 */
export async function getKnowledgeSourceByChunkId(chunkId: string): Promise<KnowledgeSource | null> {
  if (!isKnowledgeSourceChunkId(chunkId)) return null

  const supabase = getSupabaseAdmin()
  const { data: chunkData, error: chunkError } = await supabase
    .from('sales_agent_knowledge_chunks')
    .select('id, document_id, version_id, section_title, section_anchor, hierarchy_path, source_node_id, content, target_url')
    .eq('id', chunkId)
    .eq('is_active', true)
    .maybeSingle()

  if (chunkError) throw new Error(`KNOWLEDGE_SOURCE_CHUNK_LOOKUP_FAILED: ${chunkError.message}`)
  if (!chunkData) return null

  const chunk = chunkData as Record<string, unknown>
  const documentId = String(chunk.document_id || '')
  const versionId = String(chunk.version_id || '')
  if (!documentId || !versionId) return null

  const [documentResult, versionResult] = await Promise.all([
    supabase
      .from('sales_agent_knowledge_documents')
      .select('id, document_key, title, category, vehicle_model, model_year, locale, lifecycle_status, active_version_id, deleted_at, target_url')
      .eq('id', documentId)
      .maybeSingle(),
    supabase
      .from('sales_agent_knowledge_versions')
      .select('id, document_id, version_no, publication_status, index_status, effective_from, effective_to')
      .eq('id', versionId)
      .maybeSingle(),
  ])

  if (documentResult.error) {
    throw new Error(`KNOWLEDGE_SOURCE_DOCUMENT_LOOKUP_FAILED: ${documentResult.error.message}`)
  }
  if (versionResult.error) {
    throw new Error(`KNOWLEDGE_SOURCE_VERSION_LOOKUP_FAILED: ${versionResult.error.message}`)
  }
  if (!documentResult.data || !versionResult.data) return null

  const document = documentResult.data as Record<string, unknown>
  const version = versionResult.data as Record<string, unknown>
  const isCurrent = document.lifecycle_status === 'ACTIVE'
    && document.deleted_at == null
    && document.active_version_id === versionId
    && version.document_id === documentId
    && version.publication_status === 'PUBLISHED'
    && version.index_status === 'READY'
    && isEffectiveVersion(version.effective_from, version.effective_to, Date.now())

  if (!isCurrent) return null

  const documentKey = String(document.document_key || '')
  const sectionAnchor = String(chunk.section_anchor || 'root')
  const versionNo = Number(version.version_no)
  const content = String(chunk.content || '').trim()
  if (!documentKey || !Number.isInteger(versionNo) || versionNo < 1 || !content) return null

  const targetUrl = typeof chunk.target_url === 'string' && chunk.target_url.trim()
    ? chunk.target_url.trim()
    : (typeof document.target_url === 'string' && document.target_url.trim() ? document.target_url.trim() : null)

  return {
    chunkId,
    documentKey,
    title: String(document.title || 'Tài liệu hướng dẫn'),
    category: String(document.category || 'TECHNICAL_GUIDE'),
    vehicleModel: typeof document.vehicle_model === 'string' && document.vehicle_model.trim()
      ? document.vehicle_model.trim()
      : null,
    modelYear: Number.isInteger(document.model_year) ? Number(document.model_year) : null,
    locale: String(document.locale || 'vi-VN'),
    versionNo,
    sectionTitle: String(chunk.section_title || 'Nội dung tham chiếu'),
    sectionAnchor,
    hierarchyPath: String(chunk.hierarchy_path || ''),
    content,
    targetUrl,
    citationId: generateCitationId({
      documentKey,
      versionNo,
      sectionAnchor,
      ...(typeof chunk.source_node_id === 'string' && chunk.source_node_id
        ? { sourceNodeId: chunk.source_node_id }
        : {}),
    }),
    effectiveFrom: version.effective_from ? String(version.effective_from) : null,
  }
}
