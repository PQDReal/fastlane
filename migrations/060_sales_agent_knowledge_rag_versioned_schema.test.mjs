import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Migration 060: eight-table RAG baseline', () => {
  const upPath = path.resolve('migrations/060_sales_agent_knowledge_rag_versioned_schema.sql')
  const downPath = path.resolve('migrations/060_sales_agent_knowledge_rag_versioned_schema.down.sql')
  const up = fs.readFileSync(upPath, 'utf8')
  const down = fs.readFileSync(downPath, 'utf8')
  const liveVisual = fs.readFileSync(
    path.resolve('migrations/061_sales_agent_visual_knowledge_live_schema.sql'),
    'utf8',
  )
  const visualPrivileges = fs.readFileSync(
    path.resolve('migrations/062_sales_agent_visual_rpc_privilege_hardening.sql'),
    'utf8',
  )
  const visualDraftRetrieval = fs.readFileSync(
    path.resolve('migrations/063_sales_agent_visual_draft_retrieval_dev.sql'),
    'utf8',
  )

  it('evolves the two Migration 058 tables without recreating or dropping them', () => {
    expect(up).toContain('ALTER TABLE public.sales_agent_knowledge_documents')
    expect(up).toContain('ALTER TABLE public.sales_agent_knowledge_chunks')
    expect(up).not.toContain('CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_documents')
    expect(up).not.toContain('CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_chunks')
    expect(down).not.toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_documents')
    expect(down).not.toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_chunks')
  })

  it('has exactly the six new tables required by the eight-table baseline', () => {
    const created = [...up.matchAll(/CREATE TABLE IF NOT EXISTS public\.(sales_agent_knowledge_[a-z_]+)/g)]
      .map((match) => match[1])
    expect(created).toEqual([
      'sales_agent_knowledge_versions',
      'sales_agent_knowledge_index_generations',
      'sales_agent_knowledge_index_jobs',
      'sales_agent_knowledge_assets',
      'sales_agent_knowledge_asset_occurrences',
      'sales_agent_knowledge_asset_annotations',
    ])
    expect(up).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.sales_agent_knowledge_(sources|scopes|claims|claim_sources|publication_events|runtime_state)/)
  })

  it('pins text-embedding-3-small to the 512-dimension generation', () => {
    expect(up).toContain("'openai-text-embedding-3-small-512-v1'")
    expect(up).toContain("'text-embedding-3-small'")
    expect(up).toContain('embedding vector(512)')
    expect(up).toContain('USING hnsw (embedding vector_cosine_ops)')
  })

  it('backfills legacy versions as pending and leaves the active pointer null', () => {
    expect(up).toContain("CASE WHEN d.status = 'PUBLISHED' THEN 'IN_REVIEW' ELSE 'DRAFT' END")
    expect(up).toContain("'PENDING'")
    expect(up).toContain('UPDATE public.sales_agent_knowledge_documents SET active_version_id = NULL')
    expect(up).toContain('is_active = false')
  })

  it('stores typed scope/source fields without separate source or scope tables', () => {
    for (const column of [
      'vehicle_key TEXT', 'vehicle_model TEXT', 'model_year INTEGER',
      'vehicle_type TEXT', 'customer_segment TEXT', 'source_kind TEXT', 'source_uri TEXT',
    ]) expect(up).toContain(column)
    expect(up).toContain("'vehicleModel', d.vehicle_model")
  })

  it('keeps lifecycle and index operations fail-closed and idempotent', () => {
    expect(up).toContain('sales_agent_enqueue_index_job')
    expect(up).toContain('pg_advisory_xact_lock')
    expect(up).toContain("status IN ('PENDING', 'PROCESSING')")
    expect(up).toContain('uq_knowledge_index_jobs_active')
    expect(up).toContain('sales_agent_finalize_knowledge_hierarchy')
    expect(up).toContain('VERSION_NOT_APPROVED')
    expect(up).toContain('REVIEW_REQUIRED')
    expect(up).toContain('VERSION_HAS_NO_CHUNKS')
    expect(up).toContain('VERSION_INDEX_INCOMPLETE_OR_STALE')
    expect(up).toContain('knowledge_version_approval_check')
    expect(up).toContain('author_id <> reviewer_id')
    expect(up).toContain('VERSION_NOT_ROLLBACKABLE')
    expect(up).toContain('RESTORE_VERSION_NOT_FOUND')
  })

  it('provides active-only FTS, vector and hierarchy RPCs', () => {
    expect(up).toContain('sales_agent_search_knowledge_fts')
    expect(up).toContain('websearch_to_tsquery')
    expect(up).toContain('c.tsv_content @@ q.query')
    expect(up).toContain('sales_agent_search_knowledge_vector')
    expect(up).toContain('c.embedding <=> p_query_embedding')
    expect(up).toContain('sales_agent_load_knowledge_hierarchy_context')
    expect(up).toContain("d.lifecycle_status = 'ACTIVE'")
    expect(up).toContain("v.publication_status = 'PUBLISHED'")
    expect(up).toContain("v.index_status = 'READY'")
    expect(up).toContain('d.active_version_id = v.id')
  })

  it('uses a sequence and document epoch instead of a ninth runtime-state table', () => {
    expect(up).toContain('sales_agent_knowledge_epoch_seq')
    expect(up).toContain('retrieval_epoch BIGINT')
    expect(up).toContain('sales_agent_get_knowledge_runtime_state')
    expect(up).not.toContain('sales_agent_knowledge_runtime_state')
  })

  it('only activates an approved annotation belonging to the same asset bytes', () => {
    expect(up).toContain('enforce_knowledge_asset_active_annotation')
    expect(up).toContain("annotation.status = 'APPROVED'")
    expect(up).toContain('annotation.asset_id = NEW.id')
    expect(up).toContain('annotation.source_asset_sha256 = NEW.sha256')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.enforce_knowledge_asset_active_annotation()')
  })

  it('stores compact visual metadata and keeps AI drafts out of vector indexes', () => {
    for (const column of [
      'source_occurrence_id TEXT NOT NULL UNIQUE',
      'source_packet_id TEXT NOT NULL',
      "source_locator JSONB NOT NULL DEFAULT '{}'::jsonb",
      "relation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
      'visible_text TEXT[]',
      "relations JSONB NOT NULL DEFAULT '[]'::jsonb",
      'confidence REAL NOT NULL',
      'retrieval_recommendation TEXT NOT NULL',
      'vision_provider TEXT',
      'request_id TEXT',
      "provenance JSONB NOT NULL DEFAULT '{}'::jsonb",
    ]) expect(up).toContain(column)
    expect(up).toContain("WHERE embedding IS NOT NULL AND status = 'APPROVED'")
    expect(up).toContain("USING gin (tsv_content) WHERE status = 'APPROVED'")
    expect(up).toContain('char_length(context_text) <= 2000')
  })

  it('enforces immutable revisions and maker-checker visual review transitions', () => {
    expect(up).toContain('enforce_knowledge_asset_annotation_revision')
    expect(up).toContain('IMMUTABLE_ANNOTATION_REVISION')
    expect(up).toContain('INVALID_ANNOTATION_STATUS_TRANSITION')
    expect(up).toContain('ACTIVE_ANNOTATION_MUST_BE_DEACTIVATED')
    expect(up).toContain('sales_agent_review_knowledge_asset_annotation')
    expect(up).toContain('MAKER_CHECKER_REQUIRED')
    expect(up).toContain('sales_agent_mark_knowledge_asset_stale')
    expect(up).toContain('STALE_ACTOR_REQUIRED')
    expect(up).toContain('sales_agent_create_knowledge_asset_annotation_revision')
    expect(up).toContain('SUPERSEDED_BY_ADMIN_EDIT')
    expect(up).toContain('editedFromAnnotationId')
    expect(up).toContain('sales_agent_bulk_review_knowledge_asset_annotations')
    expect(up).toContain('INVALID_BULK_REVIEW_COUNT')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_review_knowledge_asset_annotation')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_mark_knowledge_asset_stale')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_create_knowledge_asset_annotation_revision')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_bulk_review_knowledge_asset_annotations')
  })

  it('returns only approved contextual visuals behind a service-role RPC', () => {
    expect(up).toContain('sales_agent_search_knowledge_visuals')
    expect(up).toContain("websearch_to_tsquery('simple', p_query)")
    expect(up).toContain('ORDER BY candidates.text_rank DESC')
    expect(up).toContain("occurrence.role NOT IN ('DECORATIVE', 'INLINE_MARKER')")
    expect(up).toContain("annotation.status = 'APPROVED'")
    expect(up).toContain("annotation.decision = 'ANNOTATE'")
    expect(up).toContain("annotation.retrieval_recommendation <> 'EXCLUDE'")
    expect(up).toContain('document.active_version_id = version.id')
    expect(up).toContain('occurrence.retrieval_enabled')
    expect(up).toContain('REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals')
    expect(up).toContain('GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_visuals')
  })

  it('upgrades the empty live prototype defensively and revokes direct API-role RPC grants', () => {
    expect(liveVisual).toContain('VISUAL_SCHEMA_REBUILD_REQUIRES_EMPTY_TABLES')
    expect(liveVisual).toContain("occurrence.role NOT IN ('DECORATIVE', 'INLINE_MARKER')")
    expect(liveVisual).toContain('FROM PUBLIC, anon, authenticated')
    expect(visualPrivileges).toContain('FROM PUBLIC, anon, authenticated')
    expect(visualPrivileges).toContain('TO service_role')
  })

  it('keeps draft retrieval isolated behind a separate service-role-only development RPC', () => {
    expect(visualDraftRetrieval).toContain('sales_agent_search_knowledge_visuals_with_drafts')
    expect(visualDraftRetrieval).toContain("candidate.status = 'AI_DRAFT'")
    expect(visualDraftRetrieval).toContain("candidate.status = 'APPROVED'")
    expect(visualDraftRetrieval).toContain("FROM PUBLIC, anon, authenticated")
    expect(visualDraftRetrieval).toContain('TO service_role')
    expect(visualDraftRetrieval).toContain("annotation.retrieval_recommendation <> 'EXCLUDE'")
  })

  it('prevents a document pointer from crossing documents or pointing at an unready version', () => {
    expect(up).toContain('enforce_knowledge_document_active_version')
    expect(up).toContain('version.document_id = NEW.id')
    expect(up).toContain("version.publication_status = 'PUBLISHED'")
    expect(up).toContain("version.index_status = 'READY'")
    expect(down).toContain('DROP FUNCTION IF EXISTS public.enforce_knowledge_document_active_version()')
  })

  it('enforces service-role-only access and hardened SECURITY DEFINER functions', () => {
    expect(up).toContain('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated')
    expect(up).toContain('FOR ALL TO service_role USING (true) WITH CHECK (true)')
    expect(up).toContain('SECURITY DEFINER')
    expect(up).toContain('SET search_path = public, pg_temp')
    expect(up).toContain('REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_fts')
  })

  it('rolls back only 060 additions and restores Migration 058 visibility', () => {
    expect(down).toContain('UPDATE public.sales_agent_knowledge_chunks SET is_active = true')
    expect(down).toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_asset_annotations')
    expect(down).toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_versions')
    expect(down).toContain('ROLLBACK_BLOCKED: 060-only knowledge categories remain')
    expect(down).toContain('DROP COLUMN IF EXISTS embedding')
  })
})
