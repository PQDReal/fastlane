-- Migration 060: Sales Agent Knowledge RAG Versioned Schema & Lifecycle Engine (Safe Evolution & Full Idempotency)
-- Task: sales-agent-knowledge-rag-upgrade-019 (Phase P1: A19-KR-101..105)
-- Model Standard: OpenAI text-embedding-3-small (1536 dimensions, Cosine distance)
-- Safety: Backward-compatible evolution from Migration 058; preserves existing documents/chunks; full reapply idempotency.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. SOURCES (Provenance & Legal Origin)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (source_type IN ('MANUAL_EDITION', 'OFFICIAL_POLICY', 'LEGAL_DOCUMENT', 'INTERNAL_BULLETIN', 'CATALOG_SPEC')),
    title TEXT NOT NULL,
    uri TEXT,
    checksum TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'INTERNAL_ONLY', 'RESTRICTED')),
    issued_at TIMESTAMPTZ,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    revoked_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. DOCUMENTS (Evolution of existing 058 table)
ALTER TABLE public.sales_agent_knowledge_documents
    ADD COLUMN IF NOT EXISTS document_key TEXT,
    ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'vi-VN',
    ADD COLUMN IF NOT EXISTS active_version_id UUID,
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill document_key from slug for existing 058 documents
UPDATE public.sales_agent_knowledge_documents
SET document_key = slug
WHERE document_key IS NULL;

-- Preserve the legacy lifecycle meaning while the new index is still pending.
-- A migrated published document remains hidden from runtime reads until its
-- version is actually indexed and READY.
UPDATE public.sales_agent_knowledge_documents
SET lifecycle_status = CASE
    WHEN status = 'ARCHIVED' THEN 'ARCHIVED'
    ELSE 'ACTIVE'
END
WHERE lifecycle_status IS NULL OR lifecycle_status = 'ACTIVE';

-- Make document_key NOT NULL
ALTER TABLE public.sales_agent_knowledge_documents
    ALTER COLUMN document_key SET NOT NULL;

-- Add unique constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_knowledge_doc_key_locale'
    ) THEN
        ALTER TABLE public.sales_agent_knowledge_documents
        ADD CONSTRAINT uq_knowledge_doc_key_locale UNIQUE (document_key, locale);
    END IF;
END $$;

-- 4. VERSIONS (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_documents(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL CHECK (version_no >= 1),
    content_markdown TEXT NOT NULL,
    content_checksum TEXT NOT NULL,
    summary TEXT,
    publication_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED')),
    index_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (index_status IN ('PENDING', 'BUILDING', 'VALIDATING', 'READY', 'FAILED')),
    author_id UUID,
    reviewer_id UUID,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_knowledge_version_doc_no UNIQUE (document_id, version_no)
);

-- 5. BACKFILL 058 LEGACY DOCUMENTS INTO VERSIONS (Initial index_status = 'PENDING' until indexed)
DO $$
DECLARE
    r RECORD;
    v_new_version_id UUID;
    v_checksum TEXT;
BEGIN
    FOR r IN
        SELECT id, published_version, content_markdown, summary, status, created_at
        FROM public.sales_agent_knowledge_documents
        WHERE active_version_id IS NULL
    LOOP
        v_checksum := encode(sha256(coalesce(r.content_markdown, '')::bytea), 'hex');

        -- Insert version snapshot with index_status = 'PENDING' (No fake READY vectors)
        INSERT INTO public.sales_agent_knowledge_versions (
            document_id, version_no, content_markdown, content_checksum, summary, publication_status, index_status, created_at
        ) VALUES (
            r.id,
            coalesce(r.published_version, 1),
            coalesce(r.content_markdown, ''),
            v_checksum,
            r.summary,
            CASE WHEN r.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END,
            'PENDING',
            r.created_at
        )
        ON CONFLICT (document_id, version_no) DO UPDATE
        SET content_markdown = EXCLUDED.content_markdown
        RETURNING id INTO v_new_version_id;

        -- Point document active_version_id to this version
        IF r.status = 'PUBLISHED' THEN
            UPDATE public.sales_agent_knowledge_documents
            SET active_version_id = v_new_version_id
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- Add Foreign Key from documents to versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_doc_active_version'
    ) THEN
        ALTER TABLE public.sales_agent_knowledge_documents
        ADD CONSTRAINT fk_knowledge_doc_active_version
        FOREIGN KEY (active_version_id)
        REFERENCES public.sales_agent_knowledge_versions(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 6. SCOPES (Applicability Filters)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    vehicle_model TEXT,
    vehicle_type TEXT CHECK (vehicle_type IN ('CAR', 'MOTORBIKE', 'ALL')),
    model_year_from INTEGER,
    model_year_to INTEGER,
    market TEXT NOT NULL DEFAULT 'VN',
    customer_segment TEXT NOT NULL DEFAULT 'ALL' CHECK (customer_segment IN ('ALL', 'RETAIL', 'FLEET', 'PARTNER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 7. CLAIMS & CITATIONS (Fact-Level Anchors)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    claim_key TEXT NOT NULL,
    claim_type TEXT NOT NULL CHECK (claim_type IN ('FACT', 'PROCEDURE_STEP', 'POLICY_TERM', 'NUMERIC_SPEC', 'WARNING')),
    claim_text TEXT NOT NULL,
    claim_value JSONB,
    conditions TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_knowledge_claim_key_version UNIQUE (version_id, claim_key)
);

CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_claim_sources (
    claim_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_claims(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_sources(id) ON DELETE CASCADE,
    section_anchor TEXT NOT NULL,
    page_or_locator TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (claim_id, source_id, section_anchor)
);

-- 8. INDEX GENERATIONS (Isolated Vector Spaces)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_index_generations (
    id TEXT PRIMARY KEY,
    embedding_provider TEXT NOT NULL DEFAULT 'OPENAI',
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_dimensions INTEGER NOT NULL DEFAULT 1536 CHECK (embedding_dimensions = 1536),
    distance_metric TEXT NOT NULL DEFAULT 'cosine',
    chunker_version TEXT NOT NULL DEFAULT 'v1',
    is_active BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Seed Initial Generation
INSERT INTO public.sales_agent_knowledge_index_generations (
    id, embedding_provider, embedding_model, embedding_dimensions, distance_metric, chunker_version, is_active
) VALUES (
    'openai-text-embedding-3-small-1536-v1', 'OPENAI', 'text-embedding-3-small', 1536, 'cosine', 'v1', true
) ON CONFLICT (id) DO NOTHING;

-- 9. CHUNKS (Evolution of existing 058 table with source locator and image metadata columns)
ALTER TABLE public.sales_agent_knowledge_chunks
    ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS index_generation_id TEXT REFERENCES public.sales_agent_knowledge_index_generations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_chunk_id UUID REFERENCES public.sales_agent_knowledge_chunks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS chunk_level INTEGER NOT NULL DEFAULT 0 CHECK (chunk_level IN (0, 1, 2, 3)),
    ADD COLUMN IF NOT EXISTS hierarchy_path TEXT NOT NULL DEFAULT 'root',
    ADD COLUMN IF NOT EXISTS section_anchor TEXT NOT NULL DEFAULT 'root',
    ADD COLUMN IF NOT EXISTS source_node_id TEXT,
    ADD COLUMN IF NOT EXISTS image_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS token_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tsv_content TSVECTOR,
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Backfill 058 legacy chunks version_id & lexical tsvector
UPDATE public.sales_agent_knowledge_chunks c
SET version_id = d.active_version_id,
    index_generation_id = 'openai-text-embedding-3-small-1536-v1',
    content_hash = encode(sha256(coalesce(c.content, '')::bytea), 'hex'),
    tsv_content = to_tsvector('simple', coalesce(c.section_title, '') || ' ' || coalesce(c.content, ''))
FROM public.sales_agent_knowledge_documents d
WHERE c.document_id = d.id AND c.version_id IS NULL;

-- 10. DURABLE INDEX JOBS
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_index_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    index_generation_id TEXT NOT NULL REFERENCES public.sales_agent_knowledge_index_generations(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'FETCH' CHECK (stage IN ('FETCH', 'NORMALIZE', 'CHUNK', 'LEXICAL', 'EMBED', 'VECTOR', 'VALIDATE', 'SMOKE', 'COMPLETE')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    checkpoint_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Clean up any duplicate active jobs left by an earlier, non-idempotent worker
-- before installing the partial unique index below. Keep the oldest job and
-- make the extras terminal so re-applying this migration cannot fail on the
-- uniqueness invariant.
WITH ranked_active_jobs AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY version_id, index_generation_id
            ORDER BY created_at ASC, id ASC
        ) AS row_no
    FROM public.sales_agent_knowledge_index_jobs
    WHERE status IN ('PENDING', 'PROCESSING')
)
UPDATE public.sales_agent_knowledge_index_jobs AS jobs
SET status = 'FAILED',
    last_error = coalesce(jobs.last_error, 'DEDUPLICATED_BY_MIGRATION_060'),
    updated_at = timezone('utc', now())
FROM ranked_active_jobs AS ranked
WHERE jobs.id = ranked.id
  AND ranked.row_no > 1;

-- At most one active job may exist for a version/generation pair. The RPC also
-- takes an advisory transaction lock so the check remains safe under races.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_index_jobs_active
ON public.sales_agent_knowledge_index_jobs (version_id, index_generation_id)
WHERE status IN ('PENDING', 'PROCESSING');

-- 11. PUBLICATION AUDIT EVENTS (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_publication_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_documents(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('DRAFT_CREATED', 'REVIEW_REQUESTED', 'APPROVED', 'PUBLISHED', 'ROLLED_BACK', 'ARCHIVED', 'RESTORED', 'SOFT_DELETED')),
    from_version_no INTEGER,
    to_version_no INTEGER,
    actor_id UUID,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Publication history is an append-only audit ledger. Lifecycle RPCs insert
-- events, but no caller (including service_role) may rewrite or erase them.
CREATE OR REPLACE FUNCTION public.prevent_knowledge_publication_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_LEDGER_IMMUTABLE: publication events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_knowledge_publication_event_mutation ON public.sales_agent_knowledge_publication_events;
CREATE TRIGGER trg_prevent_knowledge_publication_event_mutation
BEFORE UPDATE OR DELETE ON public.sales_agent_knowledge_publication_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_knowledge_publication_event_mutation();

-- 12. RUNTIME STATE (Singleton Epoch Pointer)
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_runtime_state (
    singleton_id INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
    active_index_generation_id TEXT REFERENCES public.sales_agent_knowledge_index_generations(id),
    knowledge_epoch BIGINT NOT NULL DEFAULT 1,
    config_version TEXT NOT NULL DEFAULT 'v1',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.sales_agent_knowledge_runtime_state (
    singleton_id, active_index_generation_id, knowledge_epoch, config_version
) VALUES (
    1, 'openai-text-embedding-3-small-1536-v1', 1, 'v1'
) ON CONFLICT (singleton_id) DO NOTHING;

-- 13. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_category ON public.sales_agent_knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_lifecycle ON public.sales_agent_knowledge_documents(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_doc_id ON public.sales_agent_knowledge_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_status ON public.sales_agent_knowledge_versions(publication_status, index_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_scopes_version ON public.sales_agent_knowledge_scopes(version_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_scopes_model ON public.sales_agent_knowledge_scopes(vehicle_model);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_version_gen ON public.sales_agent_knowledge_chunks(version_id, index_generation_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_parent ON public.sales_agent_knowledge_chunks(parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv ON public.sales_agent_knowledge_chunks USING GIN(tsv_content);

-- HNSW Vector Index with vector_cosine_ops
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw 
ON public.sales_agent_knowledge_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 14. TRIGGERS (Enforce Version Immutability & Automatic TSVector Synchronization)

-- Function & Trigger: Version Immutability after publication
CREATE OR REPLACE FUNCTION public.enforce_knowledge_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.publication_status IN ('PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
        IF NEW.publication_status NOT IN ('PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
            RAISE EXCEPTION 'IMMUTABLE_VERSION_STATUS_VIOLATION: Cannot downgrade an immutable version snapshot (ID: %)', OLD.id;
        END IF;
        IF NEW.content_markdown <> OLD.content_markdown
           OR NEW.content_checksum <> OLD.content_checksum
           OR NEW.version_no <> OLD.version_no THEN
            RAISE EXCEPTION 'IMMUTABLE_VERSION_VIOLATION: Cannot mutate content or version_no of a published/archived version snapshot (ID: %)', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_knowledge_version_immutability ON public.sales_agent_knowledge_versions;
CREATE TRIGGER trg_enforce_knowledge_version_immutability
BEFORE UPDATE ON public.sales_agent_knowledge_versions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_knowledge_version_immutability();

-- Function & Trigger: Automatic TSVector Generation on Chunk Content Changes
CREATE OR REPLACE FUNCTION public.sync_knowledge_chunk_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.tsv_content := to_tsvector('simple', coalesce(NEW.section_title, '') || ' ' || coalesce(NEW.content, ''));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_knowledge_chunk_tsv ON public.sales_agent_knowledge_chunks;
CREATE TRIGGER trg_sync_knowledge_chunk_tsv
BEFORE INSERT OR UPDATE OF section_title, content ON public.sales_agent_knowledge_chunks
FOR EACH ROW
EXECUTE FUNCTION public.sync_knowledge_chunk_tsv();

-- 15. ROW-LEVEL SECURITY (RLS) & REAPPLY-IDEMPOTENT POLICIES
ALTER TABLE public.sales_agent_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_claim_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_index_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_index_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_publication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_runtime_state ENABLE ROW LEVEL SECURITY;

-- Read policies for public/authenticated
DROP POLICY IF EXISTS "Public and auth users can view active documents" ON public.sales_agent_knowledge_documents;
CREATE POLICY "Public and auth users can view active documents"
ON public.sales_agent_knowledge_documents FOR SELECT
TO anon, authenticated
USING (
    lifecycle_status = 'ACTIVE'
    AND deleted_at IS NULL
    AND active_version_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_versions v
        WHERE v.id = sales_agent_knowledge_documents.active_version_id
          AND v.publication_status = 'PUBLISHED'
          AND v.index_status = 'READY'
    )
);

DROP POLICY IF EXISTS "Public and auth users can view active published versions" ON public.sales_agent_knowledge_versions;
CREATE POLICY "Public and auth users can view active published versions"
ON public.sales_agent_knowledge_versions FOR SELECT
TO anon, authenticated
USING (
    publication_status = 'PUBLISHED' 
    AND index_status = 'READY'
    AND effective_from <= timezone('utc', now())
    AND (effective_to IS NULL OR effective_to > timezone('utc', now()))
);

DROP POLICY IF EXISTS "Public and auth users can view scopes of active versions" ON public.sales_agent_knowledge_scopes;
CREATE POLICY "Public and auth users can view scopes of active versions"
ON public.sales_agent_knowledge_scopes FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_versions v
        WHERE v.id = sales_agent_knowledge_scopes.version_id
        AND v.publication_status = 'PUBLISHED'
        AND v.index_status = 'READY'
    )
);

DROP POLICY IF EXISTS "Public and auth users can view active chunks" ON public.sales_agent_knowledge_chunks;
CREATE POLICY "Public and auth users can view active chunks"
ON public.sales_agent_knowledge_chunks FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_versions v
        JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id
        WHERE v.id = sales_agent_knowledge_chunks.version_id
        AND d.active_version_id = v.id
        AND d.lifecycle_status = 'ACTIVE'
        AND v.publication_status = 'PUBLISHED'
        AND v.index_status = 'READY'
    )
);

DROP POLICY IF EXISTS "Public and auth users can view active index generation and runtime state" ON public.sales_agent_knowledge_runtime_state;
CREATE POLICY "Public and auth users can view active index generation and runtime state"
ON public.sales_agent_knowledge_runtime_state FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public and auth users can view active index generations" ON public.sales_agent_knowledge_index_generations;
CREATE POLICY "Public and auth users can view active index generations"
ON public.sales_agent_knowledge_index_generations FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Service Role Full Permissions (Idempotent with DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS "Service role full access on knowledge_sources" ON public.sales_agent_knowledge_sources;
CREATE POLICY "Service role full access on knowledge_sources" ON public.sales_agent_knowledge_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_documents" ON public.sales_agent_knowledge_documents;
CREATE POLICY "Service role full access on knowledge_documents" ON public.sales_agent_knowledge_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_versions" ON public.sales_agent_knowledge_versions;
CREATE POLICY "Service role full access on knowledge_versions" ON public.sales_agent_knowledge_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_scopes" ON public.sales_agent_knowledge_scopes;
CREATE POLICY "Service role full access on knowledge_scopes" ON public.sales_agent_knowledge_scopes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_claims" ON public.sales_agent_knowledge_claims;
CREATE POLICY "Service role full access on knowledge_claims" ON public.sales_agent_knowledge_claims FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_claim_sources" ON public.sales_agent_knowledge_claim_sources;
CREATE POLICY "Service role full access on knowledge_claim_sources" ON public.sales_agent_knowledge_claim_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_index_generations" ON public.sales_agent_knowledge_index_generations;
CREATE POLICY "Service role full access on knowledge_index_generations" ON public.sales_agent_knowledge_index_generations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_chunks" ON public.sales_agent_knowledge_chunks;
CREATE POLICY "Service role full access on knowledge_chunks" ON public.sales_agent_knowledge_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_index_jobs" ON public.sales_agent_knowledge_index_jobs;
CREATE POLICY "Service role full access on knowledge_index_jobs" ON public.sales_agent_knowledge_index_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_publication_events" ON public.sales_agent_knowledge_publication_events;
CREATE POLICY "Service role full access on knowledge_publication_events" ON public.sales_agent_knowledge_publication_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on knowledge_runtime_state" ON public.sales_agent_knowledge_runtime_state;
CREATE POLICY "Service role full access on knowledge_runtime_state" ON public.sales_agent_knowledge_runtime_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 16. ATOMIC LIFECYCLE STORED PROCEDURES (SECURITY DEFINER WITH SEARCH PATH & ACCESS HARDENING)

-- 1. Activate Version RPC
CREATE OR REPLACE FUNCTION public.sales_agent_activate_version(
    p_document_id UUID,
    p_version_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Standard Publication'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc RECORD;
    v_target_version RECORD;
    v_old_version_no INTEGER;
    v_new_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc
    FROM public.sales_agent_knowledge_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: Document ID % does not exist', p_document_id;
    END IF;

    SELECT * INTO v_target_version
    FROM public.sales_agent_knowledge_versions
    WHERE id = p_version_id AND document_id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_NOT_FOUND: Version ID % does not belong to document %', p_version_id, p_document_id;
    END IF;

    IF v_target_version.index_status != 'READY' THEN
        RAISE EXCEPTION 'VERSION_NOT_READY: Version ID % has index_status %, expected READY', p_version_id, v_target_version.index_status;
    END IF;

    IF v_target_version.publication_status NOT IN ('APPROVED', 'PUBLISHED') THEN
        RAISE EXCEPTION 'VERSION_NOT_APPROVED: Version ID % must be APPROVED before activation', p_version_id;
    END IF;

    IF v_target_version.reviewer_id IS NULL THEN
        RAISE EXCEPTION 'REVIEW_REQUIRED: Version ID % has no reviewer', p_version_id;
    END IF;

    IF v_doc.category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'PROMOTIONS_FINANCING', 'GENERAL_POLICY')
       AND NOT EXISTS (
           SELECT 1
           FROM public.sales_agent_knowledge_claims c
           JOIN public.sales_agent_knowledge_claim_sources cs ON cs.claim_id = c.id
           JOIN public.sales_agent_knowledge_sources s ON s.id = cs.source_id
           WHERE c.version_id = v_target_version.id
             AND s.revoked_at IS NULL
       ) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: Policy/legal version ID % has no sourced claim', p_version_id;
    END IF;

    IF v_doc.active_version_id IS NOT NULL THEN
        SELECT version_no INTO v_old_version_no
        FROM public.sales_agent_knowledge_versions
        WHERE id = v_doc.active_version_id;

        UPDATE public.sales_agent_knowledge_versions
        SET publication_status = 'SUPERSEDED'
        WHERE id = v_doc.active_version_id;
    END IF;

    UPDATE public.sales_agent_knowledge_versions
    SET publication_status = 'PUBLISHED'
    WHERE id = p_version_id;

    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = p_version_id,
        lifecycle_status = 'ACTIVE',
        deleted_at = NULL,
        status = 'PUBLISHED',
        published_version = v_target_version.version_no,
        published_at = timezone('utc', now()),
        content_markdown = v_target_version.content_markdown,
        summary = v_target_version.summary,
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;

    INSERT INTO public.sales_agent_knowledge_publication_events (
        document_id, version_id, action, from_version_no, to_version_no, actor_id, reason
    ) VALUES (
        p_document_id, p_version_id, 'PUBLISHED', v_old_version_no, v_target_version.version_no, p_actor_id, p_reason
    );

    UPDATE public.sales_agent_knowledge_runtime_state
    SET knowledge_epoch = knowledge_epoch + 1,
        updated_at = timezone('utc', now())
    WHERE singleton_id = 1
    RETURNING knowledge_epoch INTO v_new_epoch;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'active_version_id', p_version_id,
        'version_no', v_target_version.version_no,
        'epoch', v_new_epoch
    );
END;
$$;

-- 2. Rollback Version RPC
CREATE OR REPLACE FUNCTION public.sales_agent_rollback_version(
    p_document_id UUID,
    p_target_version_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Operational Rollback'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc RECORD;
    v_target_version RECORD;
    v_old_version_no INTEGER;
    v_new_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc
    FROM public.sales_agent_knowledge_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: Document % not found', p_document_id;
    END IF;

    SELECT * INTO v_target_version
    FROM public.sales_agent_knowledge_versions
    WHERE id = p_target_version_id AND document_id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_NOT_FOUND: Target version % does not belong to document %', p_target_version_id, p_document_id;
    END IF;

    IF v_target_version.index_status != 'READY' THEN
        RAISE EXCEPTION 'VERSION_NOT_READY: Target rollback version must have index_status = READY';
    END IF;

    IF v_target_version.publication_status NOT IN ('APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'VERSION_NOT_ROLLBACKABLE: Target rollback version has publication_status %, expected an approved or immutable snapshot', v_target_version.publication_status;
    END IF;

    IF v_doc.category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'PROMOTIONS_FINANCING', 'GENERAL_POLICY')
       AND (v_target_version.reviewer_id IS NULL OR NOT EXISTS (
           SELECT 1
           FROM public.sales_agent_knowledge_claims c
           JOIN public.sales_agent_knowledge_claim_sources cs ON cs.claim_id = c.id
           JOIN public.sales_agent_knowledge_sources s ON s.id = cs.source_id
           WHERE c.version_id = v_target_version.id
             AND s.revoked_at IS NULL
       )) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: Policy/legal rollback target % has no reviewer or active sourced claim', p_target_version_id;
    END IF;

    IF v_doc.active_version_id IS NOT NULL THEN
        SELECT version_no INTO v_old_version_no
        FROM public.sales_agent_knowledge_versions
        WHERE id = v_doc.active_version_id;

        UPDATE public.sales_agent_knowledge_versions
        SET publication_status = 'ARCHIVED'
        WHERE id = v_doc.active_version_id;
    END IF;

    UPDATE public.sales_agent_knowledge_versions
    SET publication_status = 'PUBLISHED'
    WHERE id = p_target_version_id;

    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = p_target_version_id,
        lifecycle_status = 'ACTIVE',
        deleted_at = NULL,
        status = 'PUBLISHED',
        published_version = v_target_version.version_no,
        published_at = timezone('utc', now()),
        content_markdown = v_target_version.content_markdown,
        summary = v_target_version.summary,
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;

    INSERT INTO public.sales_agent_knowledge_publication_events (
        document_id, version_id, action, from_version_no, to_version_no, actor_id, reason
    ) VALUES (
        p_document_id, p_target_version_id, 'ROLLED_BACK', v_old_version_no, v_target_version.version_no, p_actor_id, p_reason
    );

    UPDATE public.sales_agent_knowledge_runtime_state
    SET knowledge_epoch = knowledge_epoch + 1,
        updated_at = timezone('utc', now())
    WHERE singleton_id = 1
    RETURNING knowledge_epoch INTO v_new_epoch;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'active_version_id', p_target_version_id,
        'version_no', v_target_version.version_no,
        'epoch', v_new_epoch
    );
END;
$$;

-- 3. Archive Document RPC
CREATE OR REPLACE FUNCTION public.sales_agent_archive_document(
    p_document_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Archiving Document'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc RECORD;
    v_new_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc
    FROM public.sales_agent_knowledge_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: Document % not found', p_document_id;
    END IF;

    IF v_doc.active_version_id IS NOT NULL THEN
        UPDATE public.sales_agent_knowledge_versions
        SET publication_status = 'ARCHIVED'
        WHERE id = v_doc.active_version_id;
    END IF;

    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = NULL,
        lifecycle_status = 'ARCHIVED',
        status = 'ARCHIVED',
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;

    INSERT INTO public.sales_agent_knowledge_publication_events (
        document_id, version_id, action, actor_id, reason
    ) VALUES (
        p_document_id, v_doc.active_version_id, 'ARCHIVED', p_actor_id, p_reason
    );

    UPDATE public.sales_agent_knowledge_runtime_state
    SET knowledge_epoch = knowledge_epoch + 1,
        updated_at = timezone('utc', now())
    WHERE singleton_id = 1
    RETURNING knowledge_epoch INTO v_new_epoch;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'lifecycle_status', 'ARCHIVED',
        'epoch', v_new_epoch
    );
END;
$$;

-- 4. Soft Delete Document RPC
CREATE OR REPLACE FUNCTION public.sales_agent_soft_delete_document(
    p_document_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Soft Deleting Document'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc RECORD;
    v_new_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc
    FROM public.sales_agent_knowledge_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: Document % not found', p_document_id;
    END IF;

    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = NULL,
        lifecycle_status = 'DELETED',
        deleted_at = timezone('utc', now()),
        status = 'ARCHIVED',
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;

    INSERT INTO public.sales_agent_knowledge_publication_events (
        document_id, version_id, action, actor_id, reason
    ) VALUES (
        p_document_id, v_doc.active_version_id, 'SOFT_DELETED', p_actor_id, p_reason
    );

    UPDATE public.sales_agent_knowledge_runtime_state
    SET knowledge_epoch = knowledge_epoch + 1,
        updated_at = timezone('utc', now())
    WHERE singleton_id = 1
    RETURNING knowledge_epoch INTO v_new_epoch;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'lifecycle_status', 'DELETED',
        'epoch', v_new_epoch
    );
END;
$$;

-- 5. Restore Document RPC (Guarded against cross-document version attaching & non-ready versions)
CREATE OR REPLACE FUNCTION public.sales_agent_restore_document(
    p_document_id UUID,
    p_restore_version_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Restoring Document'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc RECORD;
    v_ver RECORD;
    v_target_version_id UUID;
    v_new_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc
    FROM public.sales_agent_knowledge_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: Document % not found', p_document_id;
    END IF;

    IF p_restore_version_id IS NOT NULL THEN
        -- Strict ownership and ready check
        SELECT * INTO v_ver
        FROM public.sales_agent_knowledge_versions
        WHERE id = p_restore_version_id AND document_id = p_document_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'VERSION_NOT_FOUND: Version ID % does not belong to document %', p_restore_version_id, p_document_id;
        END IF;

        v_target_version_id := p_restore_version_id;
    ELSE
        -- Pick the latest ready approved/published/immutable version of THIS document
        SELECT id INTO v_target_version_id
        FROM public.sales_agent_knowledge_versions
        WHERE document_id = p_document_id
          AND index_status = 'READY'
          AND publication_status IN ('APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED')
        ORDER BY version_no DESC
        LIMIT 1;
    END IF;

    IF v_target_version_id IS NULL THEN
        RAISE EXCEPTION 'RESTORE_VERSION_NOT_FOUND: No READY version exists for document %', p_document_id;
    END IF;

    SELECT * INTO v_ver
    FROM public.sales_agent_knowledge_versions
    WHERE id = v_target_version_id AND document_id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_NOT_FOUND: Restore target version % does not belong to document %', v_target_version_id, p_document_id;
    END IF;

    IF v_ver.index_status != 'READY' THEN
        RAISE EXCEPTION 'VERSION_NOT_READY: Restore target version % is not READY', v_target_version_id;
    END IF;

    IF v_ver.publication_status NOT IN ('APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'VERSION_NOT_RESTORABLE: Restore target version % has publication_status %, expected an approved or immutable snapshot', v_target_version_id, v_ver.publication_status;
    END IF;

    IF v_doc.category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'PROMOTIONS_FINANCING', 'GENERAL_POLICY')
       AND (v_ver.reviewer_id IS NULL OR NOT EXISTS (
           SELECT 1
           FROM public.sales_agent_knowledge_claims c
           JOIN public.sales_agent_knowledge_claim_sources cs ON cs.claim_id = c.id
           JOIN public.sales_agent_knowledge_sources s ON s.id = cs.source_id
           WHERE c.version_id = v_ver.id
             AND s.revoked_at IS NULL
       )) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: Policy/legal restore target % has no reviewer or active sourced claim', v_target_version_id;
    END IF;

    IF v_doc.active_version_id IS NOT NULL AND v_doc.active_version_id <> v_target_version_id THEN
        UPDATE public.sales_agent_knowledge_versions
        SET publication_status = 'ARCHIVED'
        WHERE id = v_doc.active_version_id;
    END IF;

    UPDATE public.sales_agent_knowledge_versions
    SET publication_status = 'PUBLISHED'
    WHERE id = v_target_version_id;

    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = v_target_version_id,
        lifecycle_status = 'ACTIVE',
        deleted_at = NULL,
        status = 'PUBLISHED',
        published_version = v_ver.version_no,
        published_at = timezone('utc', now()),
        content_markdown = v_ver.content_markdown,
        summary = v_ver.summary,
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;

    INSERT INTO public.sales_agent_knowledge_publication_events (
        document_id, version_id, action, actor_id, reason
    ) VALUES (
        p_document_id, v_target_version_id, 'RESTORED', p_actor_id, p_reason
    );

    UPDATE public.sales_agent_knowledge_runtime_state
    SET knowledge_epoch = knowledge_epoch + 1,
        updated_at = timezone('utc', now())
    WHERE singleton_id = 1
    RETURNING knowledge_epoch INTO v_new_epoch;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', p_document_id,
        'active_version_id', v_target_version_id,
        'lifecycle_status', 'ACTIVE',
        'epoch', v_new_epoch
    );
END;
$$;

-- 6. Enqueue Index Job RPC (Idempotent: returns existing active job if already pending/processing)
CREATE OR REPLACE FUNCTION public.sales_agent_enqueue_index_job(
    p_version_id UUID,
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-1536-v1'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job_id UUID;
    v_version RECORD;
BEGIN
    SELECT v.*, d.category
    INTO v_version
    FROM public.sales_agent_knowledge_versions v
    JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id
    WHERE v.id = p_version_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VERSION_NOT_FOUND: Version ID % does not exist', p_version_id;
    END IF;

    IF v_version.publication_status NOT IN ('APPROVED', 'PUBLISHED') THEN
        RAISE EXCEPTION 'VERSION_NOT_APPROVED: Version ID % must be APPROVED before indexing', p_version_id;
    END IF;

    IF v_version.reviewer_id IS NULL THEN
        RAISE EXCEPTION 'REVIEW_REQUIRED: Version ID % has no reviewer', p_version_id;
    END IF;

    IF v_version.category IN ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'PROMOTIONS_FINANCING', 'GENERAL_POLICY')
       AND NOT EXISTS (
           SELECT 1
           FROM public.sales_agent_knowledge_claims c
           JOIN public.sales_agent_knowledge_claim_sources cs ON cs.claim_id = c.id
           JOIN public.sales_agent_knowledge_sources s ON s.id = cs.source_id
           WHERE c.version_id = p_version_id
             AND s.revoked_at IS NULL
       ) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: Policy/legal version ID % has no active sourced claim', p_version_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_index_generations
        WHERE id = p_index_generation_id
    ) THEN
        RAISE EXCEPTION 'GENERATION_NOT_FOUND: Index generation % does not exist', p_index_generation_id;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_version_id::TEXT || ':' || p_index_generation_id, 0)
    );

    -- Idempotency check: Return existing pending or processing job
    SELECT id INTO v_job_id
    FROM public.sales_agent_knowledge_index_jobs
    WHERE version_id = p_version_id
      AND index_generation_id = p_index_generation_id
      AND status IN ('PENDING', 'PROCESSING')
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        RETURN v_job_id;
    END IF;

    INSERT INTO public.sales_agent_knowledge_index_jobs (
        version_id, index_generation_id, stage, status
    ) VALUES (
        p_version_id, p_index_generation_id, 'FETCH', 'PENDING'
    )
    RETURNING id INTO v_job_id;

    UPDATE public.sales_agent_knowledge_versions
    SET index_status = 'BUILDING'
    WHERE id = p_version_id;

    RETURN v_job_id;
END;
$$;

-- RPC SECURITY PRIVILEGES (Least Privilege: Revoke public, grant to service_role)
REVOKE EXECUTE ON FUNCTION public.sales_agent_activate_version(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_archive_document(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_soft_delete_document(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_restore_document(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_enqueue_index_job(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sales_agent_activate_version(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_archive_document(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_soft_delete_document(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_restore_document(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_enqueue_index_job(UUID, TEXT) TO service_role;
