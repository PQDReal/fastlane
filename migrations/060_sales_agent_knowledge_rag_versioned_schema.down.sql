-- Rollback Migration 060 while preserving both Migration 058 tables and their data.

DROP TRIGGER IF EXISTS trg_sync_knowledge_asset_annotation_tsv ON public.sales_agent_knowledge_asset_annotations;
DROP FUNCTION IF EXISTS public.sync_knowledge_asset_annotation_tsv();
DROP TRIGGER IF EXISTS trg_enforce_knowledge_asset_active_annotation ON public.sales_agent_knowledge_assets;
DROP FUNCTION IF EXISTS public.enforce_knowledge_asset_active_annotation();
DROP TRIGGER IF EXISTS trg_enforce_knowledge_asset_annotation_revision ON public.sales_agent_knowledge_asset_annotations;
DROP FUNCTION IF EXISTS public.enforce_knowledge_asset_annotation_revision();
DROP TRIGGER IF EXISTS trg_sync_knowledge_chunk_tsv ON public.sales_agent_knowledge_chunks;
DROP FUNCTION IF EXISTS public.sync_knowledge_chunk_tsv();
DROP TRIGGER IF EXISTS trg_enforce_knowledge_version_immutability ON public.sales_agent_knowledge_versions;
DROP FUNCTION IF EXISTS public.enforce_knowledge_version_immutability();
DROP TRIGGER IF EXISTS trg_enforce_knowledge_document_active_version ON public.sales_agent_knowledge_documents;
DROP FUNCTION IF EXISTS public.enforce_knowledge_document_active_version();

DROP FUNCTION IF EXISTS public.sales_agent_get_knowledge_runtime_state();
DROP FUNCTION IF EXISTS public.sales_agent_load_knowledge_hierarchy_context(UUID[], TEXT, INTEGER, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_fts(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_visuals(UUID[], TEXT[], TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.sales_agent_enqueue_index_job(UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_finalize_knowledge_hierarchy(UUID);
DROP FUNCTION IF EXISTS public.sales_agent_restore_document(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_soft_delete_document(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_archive_document(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_activate_version(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT);

DROP POLICY IF EXISTS "Service role full access on knowledge_documents" ON public.sales_agent_knowledge_documents;
DROP POLICY IF EXISTS "Service role full access on knowledge_chunks" ON public.sales_agent_knowledge_chunks;

DROP INDEX IF EXISTS public.idx_knowledge_docs_active_scope;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_parent;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_source_node;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_tsv;
DROP INDEX IF EXISTS public.idx_knowledge_chunks_embedding_hnsw;
DROP INDEX IF EXISTS public.uq_knowledge_chunks_version_path;

ALTER TABLE public.sales_agent_knowledge_documents
    DROP CONSTRAINT IF EXISTS fk_knowledge_doc_active_version,
    DROP CONSTRAINT IF EXISTS uq_knowledge_doc_key_locale,
    DROP CONSTRAINT IF EXISTS knowledge_documents_lifecycle_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_vehicle_type_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_customer_segment_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_model_year_check;

ALTER TABLE public.sales_agent_knowledge_chunks
    DROP CONSTRAINT IF EXISTS fk_knowledge_chunk_parent,
    DROP CONSTRAINT IF EXISTS fk_knowledge_chunk_generation,
    DROP CONSTRAINT IF EXISTS fk_knowledge_chunk_version,
    DROP CONSTRAINT IF EXISTS knowledge_chunk_level_check,
    DROP CONSTRAINT IF EXISTS knowledge_chunk_hash_check,
    DROP CONSTRAINT IF EXISTS knowledge_chunk_token_check;

DROP TABLE IF EXISTS public.sales_agent_knowledge_asset_annotations CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_asset_occurrences CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_assets CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_index_jobs CASCADE;

-- Restore legacy chunks to the visibility model used by Migration 058.
UPDATE public.sales_agent_knowledge_chunks SET is_active = true;

ALTER TABLE public.sales_agent_knowledge_chunks
    DROP COLUMN IF EXISTS version_id,
    DROP COLUMN IF EXISTS index_generation_id,
    DROP COLUMN IF EXISTS parent_chunk_id,
    DROP COLUMN IF EXISTS parent_hierarchy_path,
    DROP COLUMN IF EXISTS chunk_level,
    DROP COLUMN IF EXISTS hierarchy_path,
    DROP COLUMN IF EXISTS section_anchor,
    DROP COLUMN IF EXISTS source_node_id,
    DROP COLUMN IF EXISTS image_refs,
    DROP COLUMN IF EXISTS content_hash,
    DROP COLUMN IF EXISTS token_count,
    DROP COLUMN IF EXISTS tsv_content,
    DROP COLUMN IF EXISTS embedding;

DROP TABLE IF EXISTS public.sales_agent_knowledge_versions CASCADE;
DROP TABLE IF EXISTS public.sales_agent_knowledge_index_generations CASCADE;

ALTER TABLE public.sales_agent_knowledge_documents
    DROP COLUMN IF EXISTS active_version_id,
    DROP COLUMN IF EXISTS lifecycle_status,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS retrieval_epoch,
    DROP COLUMN IF EXISTS lifecycle_actor_id,
    DROP COLUMN IF EXISTS lifecycle_reason,
    DROP COLUMN IF EXISTS source_uri,
    DROP COLUMN IF EXISTS source_kind,
    DROP COLUMN IF EXISTS customer_segment,
    DROP COLUMN IF EXISTS vehicle_type,
    DROP COLUMN IF EXISTS model_year,
    DROP COLUMN IF EXISTS vehicle_model,
    DROP COLUMN IF EXISTS vehicle_key,
    DROP COLUMN IF EXISTS market,
    DROP COLUMN IF EXISTS locale,
    DROP COLUMN IF EXISTS document_key;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_documents
        WHERE category NOT IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING')
    ) THEN
        RAISE EXCEPTION 'ROLLBACK_BLOCKED: 060-only knowledge categories remain';
    END IF;
    ALTER TABLE public.sales_agent_knowledge_documents
        DROP CONSTRAINT IF EXISTS sales_agent_knowledge_documents_category_check;
    ALTER TABLE public.sales_agent_knowledge_documents
        ADD CONSTRAINT sales_agent_knowledge_documents_category_check
        CHECK (category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING'));
END $$;

DROP SEQUENCE IF EXISTS public.sales_agent_knowledge_epoch_seq;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_agent_knowledge_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_agent_knowledge_chunks TO service_role;
