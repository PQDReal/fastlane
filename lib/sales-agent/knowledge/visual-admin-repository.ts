import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { VisualAnnotationStatus, VisualKnowledgeReviewItem } from './types'

const DB_TIMEOUT_MS = 5_000

function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    Promise.resolve(operation),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Visual knowledge database request timed out.')), DB_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function isVisualKnowledgeAdminEnabled(): boolean {
  return process.env.SALES_AGENT_VISUAL_KNOWLEDGE_ADMIN_ENABLED === 'true'
}

export async function listVisualKnowledgeReviewItems(options?: {
  status?: VisualAnnotationStatus
  search?: string
  limit?: number
  offset?: number
}): Promise<{ items: VisualKnowledgeReviewItem[]; total: number }> {
  const supabase = getSupabaseAdmin()
  const status = options?.status || 'AI_DRAFT'
  const limit = Math.min(50, Math.max(1, options?.limit || 20))
  const offset = Math.max(0, options?.offset || 0)
  let query = supabase
    .from('sales_agent_knowledge_asset_annotations')
    .select('id,asset_id,revision_no,status,title,summary,keywords,visible_text,image_type,confidence,retrieval_recommendation,safety_critical,source_packet_id,vision_provider,model_id,created_at', { count: 'exact' })
    .eq('status', status)
    .order('safety_critical', { ascending: false })
    .order('confidence', { ascending: true })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  const search = options?.search
    ?.trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
  if (search) query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`)
  const { data: annotations, error, count } = await withTimeout(query)
  if (error) throw new Error(`Không thể tải hàng chờ duyệt ảnh: ${error.message}`)
  if (!annotations?.length) return { items: [], total: count || 0 }

  const assetIds = [...new Set(annotations.map((row: any) => String(row.asset_id)))]
  const [{ data: assets, error: assetError }, { data: occurrences, error: occurrenceError }] = await Promise.all([
    withTimeout(supabase
      .from('sales_agent_knowledge_assets')
      .select('id,sha256,mime_type,byte_size,width,height')
      .in('id', assetIds)),
    withTimeout(supabase
      .from('sales_agent_knowledge_asset_occurrences')
      .select('asset_id,version_id,source_node_id,source_url,source_locator,context_text,relation_metadata')
      .in('asset_id', assetIds)),
  ])
  if (assetError) throw new Error(`Không thể tải metadata ảnh: ${assetError.message}`)
  if (occurrenceError) throw new Error(`Không thể tải ngữ cảnh ảnh: ${occurrenceError.message}`)

  const assetById = new Map((assets || []).map((row: any) => [String(row.id), row]))
  const occurrencesByAsset = new Map<string, any[]>()
  for (const occurrence of occurrences || []) {
    const key = String((occurrence as any).asset_id)
    const rows = occurrencesByAsset.get(key) || []
    rows.push(occurrence)
    occurrencesByAsset.set(key, rows)
  }

  const contextCandidates = assetIds.flatMap((assetId) => (
    (occurrencesByAsset.get(assetId) || []).slice(0, 3)
  ))
  const contextVersionIds = [...new Set(contextCandidates.map((row) => String(row.version_id)))]
  const contextSourceNodeIds = [...new Set(contextCandidates.map((row) => String(row.source_node_id)))]
  const chunkContentByVersionNode = new Map<string, string>()
  if (contextVersionIds.length && contextSourceNodeIds.length) {
    const { data: chunks, error: chunkError } = await withTimeout(supabase
      .from('sales_agent_knowledge_chunks')
      .select('version_id,source_node_id,content')
      .in('version_id', contextVersionIds)
      .in('source_node_id', contextSourceNodeIds)
      .order('chunk_index', { ascending: true })
      .limit(300))
    if (chunkError) throw new Error(`Không thể tải nội dung nguồn của ảnh: ${chunkError.message}`)
    for (const chunk of chunks || []) {
      const key = `${(chunk as any).version_id}:${(chunk as any).source_node_id}`
      const existing = chunkContentByVersionNode.get(key) || ''
      const content = String((chunk as any).content || '').trim()
      if (content && existing.length < 2_000) {
        chunkContentByVersionNode.set(key, `${existing}${existing ? '\n\n' : ''}${content}`.slice(0, 2_000))
      }
    }
  }

  const items = annotations.map((annotation: any): VisualKnowledgeReviewItem => {
    const assetId = String(annotation.asset_id)
    const asset = assetById.get(assetId) as any
    const assetOccurrences = occurrencesByAsset.get(assetId) || []
    const locators = assetOccurrences.map((row) => row.source_locator || {})
    const relations = assetOccurrences.map((row) => row.relation_metadata || {})
    return {
      annotationId: String(annotation.id),
      assetId,
      assetSha256: String(asset?.sha256 || ''),
      status: annotation.status as VisualAnnotationStatus,
      revisionNo: Number(annotation.revision_no),
      title: String(annotation.title),
      summary: String(annotation.summary),
      keywords: Array.isArray(annotation.keywords) ? annotation.keywords : [],
      visibleText: Array.isArray(annotation.visible_text) ? annotation.visible_text : [],
      imageType: String(annotation.image_type),
      confidence: Number(annotation.confidence),
      retrievalRecommendation: annotation.retrieval_recommendation,
      safetyCritical: annotation.safety_critical === true,
      sourceUrl: assetOccurrences[0]?.source_url || null,
      mimeType: String(asset?.mime_type || 'application/octet-stream'),
      width: asset?.width == null ? null : Number(asset.width),
      height: asset?.height == null ? null : Number(asset.height),
      byteSize: Number(asset?.byte_size || 0),
      occurrenceCount: assetOccurrences.length,
      vehicleModels: [...new Set(relations.flatMap((row) => row.vehicleModels || []))] as string[],
      modelYears: [...new Set(relations.flatMap((row) => row.modelYears || []))] as number[],
      sectionTitles: [...new Set(locators.map((row) => row.sectionTitle).filter(Boolean))] as string[],
      contextSnippets: [...new Set(assetOccurrences.slice(0, 3).flatMap((row) => {
        const fullChunk = chunkContentByVersionNode.get(`${row.version_id}:${row.source_node_id}`)
        const preview = String(row.context_text || '').trim()
        return [fullChunk, preview].filter(Boolean) as string[]
      }))].slice(0, 3),
      sourcePacketId: annotation.source_packet_id || null,
      providerLabel: annotation.vision_provider || annotation.model_id || 'legacy_unknown',
      createdAt: String(annotation.created_at),
    }
  })
  return { items, total: count || items.length }
}

export async function reviewVisualKnowledgeAnnotation(payload: {
  annotationId: string
  status: 'APPROVED' | 'REJECTED'
  actorId: string
  note?: string | null
}): Promise<{ success: boolean; assetId: string; annotationId: string; status: string }> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await withTimeout(supabase.rpc(
    'sales_agent_review_knowledge_asset_annotation',
    {
      p_annotation_id: payload.annotationId,
      p_target_status: payload.status,
      p_actor_id: payload.actorId,
      p_review_note: payload.note || null,
    },
  ))
  if (error) throw new Error(`Không thể cập nhật trạng thái duyệt ảnh: ${error.message}`)
  return {
    success: data?.success === true,
    assetId: String(data?.asset_id || ''),
    annotationId: String(data?.annotation_id || payload.annotationId),
    status: String(data?.status || payload.status),
  }
}

export async function createVisualKnowledgeAnnotationRevision(payload: {
  annotationId: string
  title: string
  summary: string
  keywords: string[]
  visibleText: string[]
  imageType: string
  retrievalRecommendation: 'INCLUDE' | 'EXCLUDE' | 'REVIEW'
  safetyCritical: boolean
  actorId: string
}): Promise<{ success: boolean; assetId: string; annotationId: string; revisionNo: number; status: string }> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await withTimeout(supabase.rpc(
    'sales_agent_create_knowledge_asset_annotation_revision',
    {
      p_annotation_id: payload.annotationId,
      p_title: payload.title,
      p_summary: payload.summary,
      p_keywords: payload.keywords,
      p_visible_text: payload.visibleText,
      p_image_type: payload.imageType,
      p_retrieval_recommendation: payload.retrievalRecommendation,
      p_safety_critical: payload.safetyCritical,
      p_actor_id: payload.actorId,
    },
  ))
  if (error) throw new Error(`Không thể tạo revision chú thích ảnh: ${error.message}`)
  return {
    success: data?.success === true,
    assetId: String(data?.asset_id || ''),
    annotationId: String(data?.annotation_id || ''),
    revisionNo: Number(data?.revision_no || 0),
    status: String(data?.status || 'AI_DRAFT'),
  }
}

export async function bulkReviewVisualKnowledgeAnnotations(payload: {
  annotationIds: string[]
  status: 'APPROVED' | 'REJECTED'
  actorId: string
  note?: string | null
}): Promise<{ success: boolean; count: number }> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await withTimeout(supabase.rpc(
    'sales_agent_bulk_review_knowledge_asset_annotations',
    {
      p_annotation_ids: payload.annotationIds,
      p_target_status: payload.status,
      p_actor_id: payload.actorId,
      p_review_note: payload.note || null,
    },
  ))
  if (error) throw new Error(`Không thể duyệt hàng loạt chú thích ảnh: ${error.message}`)
  return { success: data?.success === true, count: Number(data?.count || 0) }
}
