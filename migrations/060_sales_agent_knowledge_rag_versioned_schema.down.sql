-- Rollback for Migration 060: Sales Agent Knowledge RAG Versioned Schema & Lifecycle Engine
-- Safety: Preserves existing Migration 058 tables (sales_agent_knowledge_documents, sales_agent_knowledge_chunks)

-- 1. DROP TRIGGERS & FUNCTIONS
DROP TRIGGER IF EXISTS trg_sync_knowledge_chunk_tsv ON public.sales_agent_knowledge_chunks;
DROP FUNCTION IF EXISTS public.sync_knowledge_chunk_tsv();

DROP TRIGGER IF EXISTS trg_enforce_knowledge_version_immutability ON public.sales_agent_knowledge_versions;
DROP FUNCTION IF EXISTS public.enforce_knowledge_version_immutability();

DROP TRIGGER IF EXISTS trg_prevent_knowledge_publication_event_mutation ON public.sales_agent_knowledge_publication_events;
DROP FUNCTION IF EXISTS public.prevent_knowledge_publication_event_mutation();

-- 2. DROP RPCs
DROP FUNCTION IF EXISTS public.sales_agent_load_knowledge_hierarchy_context(UUID[], TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_fts(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_enqueue_index_job(UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_restore_document(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_soft_delete_document(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_archive_document(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_activate_version(UUID, UUID, UUID, TEXT);

-- Remove policies and indexes created on the legacy 058 tables before dropping
-- their added columns. Policies reference those columns and must not survive
-- a rollback with invalid definitions.
DROP POLICY IF EXISTS "Public and auth users can view active documents" ON public.sales_agent_knowledge_documents;
DROP POLICY IF EXISTS "Public and auth users can view active chunks" ON public.sales_agent_knowledge_chunks;
DROP POLICY IF EXISTS "Service role full access on knowledge_documents" ON public.sales_agent_knowledge_documents;
DROP POLICY IF EXISTS "Service role full access on knowledge_chunks" ON public.sales_agent_knowledge_chunks;

DROP INDEX IF EXISTS public.idx_knowledge_docs_category;
DROP INDEX IF EXISTS public.idx_knowledge_docs_lifecycle;
DROP INDEX IF EXISTS public.idx_knowledge_versions_doc_id;
DROP INDEX IF EXISTS public.idx_knowledge_versions_status;
DROP INDEX IF EXISTS public.idx_knowledge_scopes_version;
DROP INDEX IF EXISTS public.idx_knowledge_scopes_model;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_version_gen;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_parent;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_tsv;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_embedding_hnsw;

-- 3. DROP FOREIGN KEYS ON 058 TABLES
ALTER TABLE IF EXISTS public.sales_agent_knowledge_documents
    DROP CONSTRAINT IF EXISTS fk_knowledge_doc_active_version;

ALTER TABLE IF EXISTS public.sales_agent_knowledge_documents
    DROP CONSTRAINT IF EXISTS uq_knowledge_doc_key_locale;

-- 4. DROP NEW TABLES CREATED IN MIGRATION 060 (Reverse dependency order)
DROP TABLE IF EXISTS public.sales_agent_knowledge_runtime_state CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_publication_events CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_index_jobs CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_claim_sources CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_claims CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_scopes CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_versions CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_index_generations CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_sources CASCADE;

-- 5. CLEAN UP ADDED COLUMNS FROM 058 TABLES (Preserving original 058 data)
ALTER TABLE IF EXISTS public.sales_agent_knowledge_documents
    DROP COLUMN IF EXISTS active_version_id,
    DROP COLUMN IF EXISTS lifecycle_status,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS document_key,
    DROP COLUMN IF EXISTS locale;

-- Restore the 058 category invariant only when no 060-only category remains.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_documents
        WHERE category NOT IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING')
    ) THEN
        RAISE EXCEPTION 'ROLLBACK_BLOCKED: 060-only knowledge categories remain in the preserved 058 table';
    END IF;
    ALTER TABLE public.sales_agent_knowledge_documents
        DROP CONSTRAINT IF EXISTS sales_agent_knowledge_documents_category_check;
    ALTER TABLE public.sales_agent_knowledge_documents
        ADD CONSTRAINT sales_agent_knowledge_documents_category_check
        CHECK (category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING'));
END $$;

ALTER TABLE IF EXISTS public.sales_agent_knowledge_chunks
    DROP COLUMN IF EXISTS version_id,
    DROP COLUMN IF EXISTS index_generation_id,
    DROP COLUMN IF EXISTS parent_chunk_id,
    DROP COLUMN IF EXISTS chunk_level,
    DROP COLUMN IF EXISTS hierarchy_path,
    DROP COLUMN IF EXISTS section_anchor,
    DROP COLUMN IF EXISTS source_node_id,
    DROP COLUMN IF EXISTS image_refs,
    DROP COLUMN IF EXISTS content_hash,
    DROP COLUMN IF EXISTS token_count,
    DROP COLUMN IF EXISTS tsv_content,
    DROP COLUMN IF EXISTS embedding;
