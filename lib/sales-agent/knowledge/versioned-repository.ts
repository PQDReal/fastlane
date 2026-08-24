import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type KnowledgeCategory =
  | 'TECHNICAL_GUIDE'
  | 'WARRANTY_BATTERY'
  | 'DEPOSIT_DELIVERY'
  | 'PROMOTIONS_FINANCING'
  | 'CHARGING_NETWORK'
  | 'GENERAL_POLICY'

export type PublicationStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'SUPERSEDED'

export type IndexStatus = 'PENDING' | 'BUILDING' | 'VALIDATING' | 'READY' | 'FAILED'

export type LifecycleStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED'

export interface KnowledgeDocumentEntity {
  id: string
  documentKey: string
  locale: string
  category: KnowledgeCategory
  title: string
  slug: string
  activeVersionId: string | null
  lifecycleStatus: LifecycleStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeVersionEntity {
  id: string
  documentId: string
  versionNo: number
  contentMarkdown: string
  contentChecksum: string
  summary: string | null
  publicationStatus: PublicationStatus
  indexStatus: IndexStatus
  authorId: string | null
  reviewerId: string | null
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
}

export interface CreateDocumentDraftInput {
  documentKey: string
  locale?: string
  category: KnowledgeCategory
  title: string
  slug: string
  contentMarkdown: string
  summary?: string
  authorId?: string
}

export interface KnowledgeScopeInput {
  vehicleModel?: string
  vehicleType?: 'CAR' | 'MOTORBIKE' | 'ALL'
  modelYearFrom?: number
  modelYearTo?: number
  market?: string
  customerSegment?: 'ALL' | 'RETAIL' | 'FLEET' | 'PARTNER'
}

export function computeContentChecksum(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex')
}

export class VersionedKnowledgeRepository {
  private client: SupabaseClient

  constructor(client: SupabaseClient) {
    if (!client) {
      throw new Error('SupabaseClient is required for VersionedKnowledgeRepository')
    }
    this.client = client
  }

  /**
   * Tạo tài liệu mới ở trạng thái DRAFT version 1 (chưa kích hoạt active_version_id).
   */
  async createDocumentDraft(input: CreateDocumentDraftInput): Promise<{
    document: KnowledgeDocumentEntity
    version: KnowledgeVersionEntity
  }> {
    const locale = input.locale || 'vi-VN'
    const checksum = computeContentChecksum(input.contentMarkdown)

    // 1. Tạo document logic identity
    const { data: doc, error: docError } = await this.client
      .from('sales_agent_knowledge_documents')
      .insert({
        document_key: input.documentKey,
        locale,
        category: input.category,
        title: input.title,
        slug: input.slug,
        active_version_id: null,
        lifecycle_status: 'ACTIVE',
      })
      .select('*')
      .single()

    if (docError || !doc) {
      throw new Error(`Failed to create knowledge document: ${docError?.message || 'Unknown error'}`)
    }

    // 2. Tạo version 1 DRAFT
    const { data: ver, error: verError } = await this.client
      .from('sales_agent_knowledge_versions')
      .insert({
        document_id: doc.id,
        version_no: 1,
        content_markdown: input.contentMarkdown,
        content_checksum: checksum,
        summary: input.summary || null,
        publication_status: 'DRAFT',
        index_status: 'PENDING',
        author_id: input.authorId || null,
      })
      .select('*')
      .single()

    if (verError || !ver) {
      // Rollback document nếu insert version thất bại
      await this.client.from('sales_agent_knowledge_documents').delete().eq('id', doc.id)
      throw new Error(`Failed to create initial version draft: ${verError?.message || 'Unknown error'}`)
    }

    // 3. Ghi audit event DRAFT_CREATED
    const { error: auditError } = await this.client.from('sales_agent_knowledge_publication_events').insert({
      document_id: doc.id,
      version_id: ver.id,
      action: 'DRAFT_CREATED',
      to_version_no: 1,
      actor_id: input.authorId || null,
      reason: 'Initial draft creation',
    })

    if (auditError) {
      throw new Error(`Failed to record initial draft audit event: ${auditError.message}`)
    }

    return {
      document: {
        id: doc.id,
        documentKey: doc.document_key,
        locale: doc.locale,
        category: doc.category,
        title: doc.title,
        slug: doc.slug,
        activeVersionId: doc.active_version_id,
        lifecycleStatus: doc.lifecycle_status,
        deletedAt: doc.deleted_at,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
      version: {
        id: ver.id,
        documentId: ver.document_id,
        versionNo: ver.version_no,
        contentMarkdown: ver.content_markdown,
        contentChecksum: ver.content_checksum,
        summary: ver.summary,
        publicationStatus: ver.publication_status,
        indexStatus: ver.index_status,
        authorId: ver.author_id,
        reviewerId: ver.reviewer_id,
        effectiveFrom: ver.effective_from,
        effectiveTo: ver.effective_to,
        createdAt: ver.created_at,
      },
    }
  }

  /**
   * Tạo draft version mới cho một tài liệu đã tồn tại.
   */
  async createNewVersionDraft(
    documentId: string,
    contentMarkdown: string,
    authorId?: string,
    summary?: string
  ): Promise<KnowledgeVersionEntity> {
    const { data: latestVer, error: fetchErr } = await this.client
      .from('sales_agent_knowledge_versions')
      .select('version_no')
      .eq('document_id', documentId)
      .order('version_no', { ascending: false })
      .limit(1)
      .single()

    if (fetchErr || !latestVer) {
      throw new Error(`Document ${documentId} has no existing versions`)
    }

    const nextVersionNo = latestVer.version_no + 1
    const checksum = computeContentChecksum(contentMarkdown)

    const { data: ver, error: verErr } = await this.client
      .from('sales_agent_knowledge_versions')
      .insert({
        document_id: documentId,
        version_no: nextVersionNo,
        content_markdown: contentMarkdown,
        content_checksum: checksum,
        summary: summary || null,
        publication_status: 'DRAFT',
        index_status: 'PENDING',
        author_id: authorId || null,
      })
      .select('*')
      .single()

    if (verErr || !ver) {
      throw new Error(`Failed to create version ${nextVersionNo}: ${verErr?.message || 'Unknown error'}`)
    }

    const { error: auditError } = await this.client.from('sales_agent_knowledge_publication_events').insert({
      document_id: documentId,
      version_id: ver.id,
      action: 'DRAFT_CREATED',
      to_version_no: nextVersionNo,
      actor_id: authorId || null,
      reason: 'New draft version creation',
    })

    if (auditError) {
      throw new Error(`Failed to record draft version audit event: ${auditError.message}`)
    }

    return {
      id: ver.id,
      documentId: ver.document_id,
      versionNo: ver.version_no,
      contentMarkdown: ver.content_markdown,
      contentChecksum: ver.content_checksum,
      summary: ver.summary,
      publicationStatus: ver.publication_status,
      indexStatus: ver.index_status,
      authorId: ver.author_id,
      reviewerId: ver.reviewer_id,
      effectiveFrom: ver.effective_from,
      effectiveTo: ver.effective_to,
      createdAt: ver.created_at,
    }
  }

  /**
   * Maker-Checker: Phê duyệt phiên bản (APPROVED).
   */
  async approveVersion(versionId: string, reviewerId: string): Promise<void> {
    const normalizedReviewerId = reviewerId?.trim()
    if (!normalizedReviewerId) {
      throw new Error('Reviewer ID is required for maker-checker approval')
    }

    const { data: ver, error: fetchErr } = await this.client
      .from('sales_agent_knowledge_versions')
      .select('*')
      .eq('id', versionId)
      .single()

    if (fetchErr || !ver) {
      throw new Error(`Version ${versionId} not found`)
    }

    if (ver.publication_status !== 'DRAFT' && ver.publication_status !== 'IN_REVIEW') {
      throw new Error(`Cannot approve version with status ${ver.publication_status}`)
    }

    if (ver.author_id && ver.author_id === normalizedReviewerId) {
      throw new Error('Maker-checker violation: author cannot approve their own version')
    }

    const { data: approvedVersion, error: updateErr } = await this.client
      .from('sales_agent_knowledge_versions')
      .update({
        publication_status: 'APPROVED',
        reviewer_id: normalizedReviewerId,
      })
      .eq('id', versionId)
      .in('publication_status', ['DRAFT', 'IN_REVIEW'])
      .select('id')
      .single()

    if (updateErr || !approvedVersion) {
      throw new Error(`Failed to approve version: ${updateErr?.message || 'Version changed concurrently or was not approvable'}`)
    }

    const { error: auditError } = await this.client.from('sales_agent_knowledge_publication_events').insert({
      document_id: ver.document_id,
      version_id: versionId,
      action: 'APPROVED',
      to_version_no: ver.version_no,
      actor_id: normalizedReviewerId,
      reason: 'Maker-Checker approval',
    })

    if (auditError) {
      throw new Error(`Failed to record approval audit event: ${auditError.message}`)
    }
  }

  /**
   * Publish nguyên tử qua PostgreSQL Stored Procedure (RPC).
   */
  async activateVersion(
    documentId: string,
    versionId: string,
    actorId?: string,
    reason: string = 'Standard Publication'
  ): Promise<{ success: boolean; epoch: number }> {
    const { data, error } = await this.client.rpc('sales_agent_activate_version', {
      p_document_id: documentId,
      p_version_id: versionId,
      p_actor_id: actorId || null,
      p_reason: reason,
    })

    if (error || !data || data.success !== true) {
      throw new Error(`Failed to activate version via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const epoch = Number(data.epoch)
    if (!Number.isFinite(epoch)) {
      throw new Error(`Failed to activate version: RPC returned invalid non-finite epoch (${data.epoch})`)
    }

    return {
      success: true,
      epoch,
    }
  }

  /**
   * Rollback nguyên tử về version READY trước đó qua RPC.
   */
  async rollbackVersion(
    documentId: string,
    targetVersionId: string,
    actorId?: string,
    reason: string = 'Operational Rollback'
  ): Promise<{ success: boolean; epoch: number }> {
    const { data, error } = await this.client.rpc('sales_agent_rollback_version', {
      p_document_id: documentId,
      p_target_version_id: targetVersionId,
      p_actor_id: actorId || null,
      p_reason: reason,
    })

    if (error || !data || data.success !== true) {
      throw new Error(`Failed to rollback version via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const epoch = Number(data.epoch)
    if (!Number.isFinite(epoch)) {
      throw new Error(`Failed to rollback version: RPC returned invalid non-finite epoch (${data.epoch})`)
    }

    return {
      success: true,
      epoch,
    }
  }

  /**
   * Lưu trữ / Thu hồi tài liệu (Archive) qua RPC.
   */
  async archiveDocument(
    documentId: string,
    actorId?: string,
    reason: string = 'Archiving document'
  ): Promise<{ success: boolean; epoch: number }> {
    const { data, error } = await this.client.rpc('sales_agent_archive_document', {
      p_document_id: documentId,
      p_actor_id: actorId || null,
      p_reason: reason,
    })

    if (error || !data || data.success !== true) {
      throw new Error(`Failed to archive document via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const epoch = Number(data.epoch)
    if (!Number.isFinite(epoch)) {
      throw new Error(`Failed to archive document: RPC returned invalid non-finite epoch (${data.epoch})`)
    }

    return {
      success: true,
      epoch,
    }
  }

  /**
   * Xóa mềm tài liệu (Soft Delete) qua RPC.
   */
  async softDeleteDocument(
    documentId: string,
    actorId?: string,
    reason: string = 'Soft deleting document'
  ): Promise<{ success: boolean; epoch: number }> {
    const { data, error } = await this.client.rpc('sales_agent_soft_delete_document', {
      p_document_id: documentId,
      p_actor_id: actorId || null,
      p_reason: reason,
    })

    if (error || !data || data.success !== true) {
      throw new Error(`Failed to soft-delete document via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const epoch = Number(data.epoch)
    if (!Number.isFinite(epoch)) {
      throw new Error(`Failed to soft-delete document: RPC returned invalid non-finite epoch (${data.epoch})`)
    }

    return {
      success: true,
      epoch,
    }
  }

  /**
   * Khôi phục tài liệu (Restore) qua RPC.
   */
  async restoreDocument(
    documentId: string,
    restoreVersionId?: string,
    actorId?: string,
    reason: string = 'Restoring document'
  ): Promise<{ success: boolean; epoch: number }> {
    const { data, error } = await this.client.rpc('sales_agent_restore_document', {
      p_document_id: documentId,
      p_restore_version_id: restoreVersionId || null,
      p_actor_id: actorId || null,
      p_reason: reason,
    })

    if (error || !data || data.success !== true) {
      throw new Error(`Failed to restore document via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const epoch = Number(data.epoch)
    if (!Number.isFinite(epoch)) {
      throw new Error(`Failed to restore document: RPC returned invalid non-finite epoch (${data.epoch})`)
    }

    return {
      success: true,
      epoch,
    }
  }

  /**
   * Đưa version vào hàng đợi lập chỉ mục FTS / Vector qua RPC.
   */
  async enqueueIndexJob(
    versionId: string,
    indexGenerationId: string = 'openai-text-embedding-3-small-1536-v1'
  ): Promise<string> {
    const { data, error } = await this.client.rpc('sales_agent_enqueue_index_job', {
      p_version_id: versionId,
      p_index_generation_id: indexGenerationId,
    })

    if (error || !data) {
      throw new Error(`Failed to enqueue index job via RPC: ${error?.message || 'Unknown RPC failure'}`)
    }

    const jobId = typeof data === 'string' ? data : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      throw new Error(`Failed to enqueue index job: RPC returned invalid job id (${String(data)})`)
    }

    return jobId
  }
}
