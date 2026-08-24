import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Migration 060: Safe Schema Evolution, Triggers & Invariants (A19-KR-101..105)', () => {
  const upMigrationPath = path.resolve('migrations/060_sales_agent_knowledge_rag_versioned_schema.sql')
  const downMigrationPath = path.resolve('migrations/060_sales_agent_knowledge_rag_versioned_schema.down.sql')

  it('verifies that migration 060 up & down files exist', () => {
    expect(fs.existsSync(upMigrationPath)).toBe(true)
    expect(fs.existsSync(downMigrationPath)).toBe(true)
  })

  it('verifies safe ALTER TABLE evolution on existing 058 documents and chunks tables', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    // Evolves 058 documents
    expect(sql).toContain('ALTER TABLE public.sales_agent_knowledge_documents')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS active_version_id UUID')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lifecycle_status TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS document_key TEXT')

    // Evolves 058 chunks with source_node_id and image_refs
    expect(sql).toContain('ALTER TABLE public.sales_agent_knowledge_chunks')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS version_id UUID')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS index_generation_id TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_node_id TEXT')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS image_refs JSONB')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS tsv_content TSVECTOR')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS embedding vector(1536)')
    expect(sql).toContain("v.index_status = 'READY'")
  })

  it('verifies backfill logic marks legacy 058 versions as PENDING (no fake READY vectors)', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    expect(sql).toContain('UPDATE public.sales_agent_knowledge_documents')
    expect(sql).toContain('SET document_key = slug')
    expect(sql).toContain("'PENDING'")
  })

  it('verifies version immutability and automatic TSVector triggers', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enforce_knowledge_version_immutability')
    expect(sql).toContain('CREATE TRIGGER trg_enforce_knowledge_version_immutability')
    expect(sql).toContain("NEW.publication_status NOT IN ('PUBLISHED', 'ARCHIVED', 'SUPERSEDED')")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sync_knowledge_chunk_tsv')
    expect(sql).toContain('CREATE TRIGGER trg_sync_knowledge_chunk_tsv')
    expect(sql).toContain('trg_prevent_knowledge_publication_event_mutation')
    expect(sql).toContain('AUDIT_LEDGER_IMMUTABLE')
  })

  it('verifies reapply idempotency for all 11 service-role RLS policies', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    const tables = [
      'knowledge_sources',
      'knowledge_documents',
      'knowledge_versions',
      'knowledge_scopes',
      'knowledge_claims',
      'knowledge_claim_sources',
      'knowledge_index_generations',
      'knowledge_chunks',
      'knowledge_index_jobs',
      'knowledge_publication_events',
      'knowledge_runtime_state',
    ]

    tables.forEach((tbl) => {
      expect(sql).toContain(`DROP POLICY IF EXISTS "Service role full access on ${tbl}" ON public.sales_agent_${tbl}`)
      expect(sql).toContain(`CREATE POLICY "Service role full access on ${tbl}" ON public.sales_agent_${tbl}`)
    })
  })

  it('verifies restore RPC guards against cross-document version attaching and non-ready status', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    expect(sql).toContain('sales_agent_restore_document')
    expect(sql).toContain('WHERE id = p_restore_version_id AND document_id = p_document_id')
    expect(sql).toContain('VERSION_NOT_READY')
    expect(sql).toContain('RESTORE_VERSION_NOT_FOUND')
    expect(sql).toContain('VERSION_NOT_RESTORABLE')
  })

  it('verifies rollback rejects draft targets and restore archives the prior active snapshot', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    expect(sql).toContain('VERSION_NOT_ROLLBACKABLE')
    expect(sql).toContain("SET publication_status = 'ARCHIVED'")
    expect(sql).toContain('v_doc.active_version_id <> v_target_version_id')
  })

  it('verifies enqueue_index_job is idempotent and returns existing active job', () => {
    const sql = fs.readFileSync(upMigrationPath, 'utf-8')

    expect(sql).toContain('sales_agent_enqueue_index_job')
    expect(sql).toMatch(/WHERE version_id = p_version_id\s+AND index_generation_id = p_index_generation_id\s+AND status IN \('PENDING', 'PROCESSING'\)/)
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('uq_knowledge_index_jobs_active')
    expect(sql).toContain('VERSION_NOT_APPROVED: Version ID % must be APPROVED before indexing')
    expect(sql).toContain('REVIEW_REQUIRED: Version ID % has no reviewer')
  })

  it('verifies down migration cleanly removes triggers, RPCs and columns without dropping 058 tables', () => {
    const downSql = fs.readFileSync(downMigrationPath, 'utf-8')

    expect(downSql).not.toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_documents')
    expect(downSql).not.toContain('DROP TABLE IF EXISTS public.sales_agent_knowledge_chunks')
    expect(downSql).toContain('DROP TRIGGER IF EXISTS trg_sync_knowledge_chunk_tsv')
    expect(downSql).toContain('DROP TRIGGER IF EXISTS trg_enforce_knowledge_version_immutability')
    expect(downSql).toContain('DROP FUNCTION IF EXISTS public.sales_agent_activate_version')
    expect(downSql).toContain('DROP POLICY IF EXISTS "Public and auth users can view active documents"')
    expect(downSql).toContain('DROP POLICY IF EXISTS "Public and auth users can view active chunks"')
  })
})
