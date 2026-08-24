-- Migration 060: Versioned Hybrid Hierarchical RAG + Visual Knowledge (8-table baseline)
-- Evolves Migration 058 in place. This file is code-ready only until explicitly applied.
-- Embedding generation: OpenAI text-embedding-3-small, 512 dimensions, cosine distance.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.sales_agent_knowledge_epoch_seq AS BIGINT START 1;

-- 1/8 documents: stable identity, source and typed applicability.
ALTER TABLE public.sales_agent_knowledge_documents
    ADD COLUMN IF NOT EXISTS document_key TEXT,
    ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'vi-VN',
    ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'VN',
    ADD COLUMN IF NOT EXISTS vehicle_key TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_model TEXT,
    ADD COLUMN IF NOT EXISTS model_year INTEGER,
    ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'ALL',
    ADD COLUMN IF NOT EXISTS customer_segment TEXT NOT NULL DEFAULT 'ALL',
    ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'INTERNAL_DOCUMENT',
    ADD COLUMN IF NOT EXISTS source_uri TEXT,
    ADD COLUMN IF NOT EXISTS active_version_id UUID,
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retrieval_epoch BIGINT NOT NULL DEFAULT nextval('public.sales_agent_knowledge_epoch_seq'),
    ADD COLUMN IF NOT EXISTS lifecycle_actor_id UUID,
    ADD COLUMN IF NOT EXISTS lifecycle_reason TEXT;

UPDATE public.sales_agent_knowledge_documents
SET document_key = slug
WHERE document_key IS NULL;

UPDATE public.sales_agent_knowledge_documents
SET lifecycle_status = CASE WHEN status = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END
WHERE lifecycle_status NOT IN ('ACTIVE', 'ARCHIVED', 'DELETED') OR lifecycle_status IS NULL;

ALTER TABLE public.sales_agent_knowledge_documents
    ALTER COLUMN document_key SET NOT NULL;

ALTER TABLE public.sales_agent_knowledge_documents
    DROP CONSTRAINT IF EXISTS sales_agent_knowledge_documents_category_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_lifecycle_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_vehicle_type_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_customer_segment_check,
    DROP CONSTRAINT IF EXISTS knowledge_documents_model_year_check;

ALTER TABLE public.sales_agent_knowledge_documents
    ADD CONSTRAINT sales_agent_knowledge_documents_category_check CHECK (category IN (
        'WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE',
        'PROMOTIONS_FINANCING', 'CHARGING_NETWORK', 'GENERAL_POLICY'
    )),
    ADD CONSTRAINT knowledge_documents_lifecycle_check CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    ADD CONSTRAINT knowledge_documents_vehicle_type_check CHECK (vehicle_type IN ('CAR', 'MOTORBIKE', 'ALL')),
    ADD CONSTRAINT knowledge_documents_customer_segment_check CHECK (customer_segment IN ('ALL', 'RETAIL', 'FLEET', 'PARTNER')),
    ADD CONSTRAINT knowledge_documents_model_year_check CHECK (model_year IS NULL OR model_year BETWEEN 2000 AND 2100);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_knowledge_doc_key_locale') THEN
        ALTER TABLE public.sales_agent_knowledge_documents
            ADD CONSTRAINT uq_knowledge_doc_key_locale UNIQUE (document_key, locale);
    END IF;
END $$;

-- 2/8 immutable version snapshots. Source checksum and retrieval scope live here/document.
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_documents(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL CHECK (version_no >= 1),
    content_markdown TEXT NOT NULL,
    content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[0-9a-f]{64}$'),
    summary TEXT,
    source_uri TEXT,
    source_checksum TEXT CHECK (source_checksum IS NULL OR source_checksum ~ '^[0-9a-f]{64}$'),
    source_retrieved_at TIMESTAMPTZ,
    publication_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN (
        'DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED'
    )),
    index_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (index_status IN (
        'PENDING', 'BUILDING', 'VALIDATING', 'READY', 'FAILED'
    )),
    author_id UUID,
    reviewer_id UUID,
    approved_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    activation_actor_id UUID,
    activation_reason TEXT,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_knowledge_version_doc_no UNIQUE (document_id, version_no),
    CONSTRAINT knowledge_version_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT knowledge_version_reviewer_check CHECK (
        reviewer_id IS NULL OR author_id IS NULL OR reviewer_id <> author_id
    ),
    CONSTRAINT knowledge_version_approval_check CHECK (
        publication_status NOT IN ('APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED') OR
        (author_id IS NOT NULL AND reviewer_id IS NOT NULL AND author_id <> reviewer_id AND approved_at IS NOT NULL)
    )
);

-- Backfill 058 data as non-active, non-ready snapshots. No false-ready publication.
INSERT INTO public.sales_agent_knowledge_versions (
    document_id, version_no, content_markdown, content_checksum, summary,
    publication_status, index_status, effective_from, created_at
)
SELECT
    d.id,
    GREATEST(d.published_version, 1),
    d.content_markdown,
    encode(digest(d.content_markdown, 'sha256'), 'hex'),
    d.summary,
    CASE WHEN d.status = 'PUBLISHED' THEN 'IN_REVIEW' ELSE 'DRAFT' END,
    'PENDING',
    COALESCE(d.published_at, d.created_at),
    d.created_at
FROM public.sales_agent_knowledge_documents d
WHERE NOT EXISTS (
    SELECT 1 FROM public.sales_agent_knowledge_versions v WHERE v.document_id = d.id
)
ON CONFLICT (document_id, version_no) DO NOTHING;

-- Pending legacy snapshots are deliberately not active until indexed and explicitly activated.
UPDATE public.sales_agent_knowledge_documents SET active_version_id = NULL
WHERE active_version_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_doc_active_version') THEN
        ALTER TABLE public.sales_agent_knowledge_documents
            ADD CONSTRAINT fk_knowledge_doc_active_version
            FOREIGN KEY (active_version_id) REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3/8 index generation registry. Exactly one active embedding space.
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_index_generations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    distance_metric TEXT NOT NULL DEFAULT 'cosine' CHECK (distance_metric = 'cosine'),
    config_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_active_generation
    ON public.sales_agent_knowledge_index_generations ((is_active)) WHERE is_active;

INSERT INTO public.sales_agent_knowledge_index_generations (
    id, provider, embedding_model, dimensions, distance_metric, config_hash, is_active, activated_at
) VALUES (
    'openai-text-embedding-3-small-512-v1',
    'OPENAI',
    'text-embedding-3-small',
    512,
    'cosine',
    encode(digest('text-embedding-3-small:512:cosine:v1', 'sha256'), 'hex'),
    true,
    timezone('utc', now())
)
ON CONFLICT (id) DO UPDATE SET
    provider = EXCLUDED.provider,
    embedding_model = EXCLUDED.embedding_model,
    dimensions = EXCLUDED.dimensions,
    distance_metric = EXCLUDED.distance_metric,
    config_hash = EXCLUDED.config_hash;

-- Evolve 2/8 chunks from Migration 058.
ALTER TABLE public.sales_agent_knowledge_chunks
    ADD COLUMN IF NOT EXISTS version_id UUID,
    ADD COLUMN IF NOT EXISTS index_generation_id TEXT,
    ADD COLUMN IF NOT EXISTS parent_chunk_id UUID,
    ADD COLUMN IF NOT EXISTS parent_hierarchy_path TEXT,
    ADD COLUMN IF NOT EXISTS chunk_level SMALLINT NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS hierarchy_path TEXT,
    ADD COLUMN IF NOT EXISTS section_anchor TEXT,
    ADD COLUMN IF NOT EXISTS source_node_id TEXT,
    ADD COLUMN IF NOT EXISTS image_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS content_hash TEXT,
    ADD COLUMN IF NOT EXISTS token_count INTEGER,
    ADD COLUMN IF NOT EXISTS tsv_content TSVECTOR,
    ADD COLUMN IF NOT EXISTS embedding vector(512);

UPDATE public.sales_agent_knowledge_chunks c
SET
    version_id = v.id,
    index_generation_id = COALESCE(c.index_generation_id, 'openai-text-embedding-3-small-512-v1'),
    hierarchy_path = COALESCE(c.hierarchy_path, 'legacy/' || c.chunk_index::text),
    section_anchor = COALESCE(c.section_anchor, d.document_key || '#legacy-' || c.chunk_index::text),
    content_hash = COALESCE(c.content_hash, encode(digest(c.content, 'sha256'), 'hex')),
    token_count = COALESCE(c.token_count, GREATEST(1, ceil(array_length(regexp_split_to_array(trim(c.content), '\\s+'), 1) * 1.3)::integer)),
    is_active = false
FROM public.sales_agent_knowledge_documents d
JOIN public.sales_agent_knowledge_versions v ON v.document_id = d.id
WHERE c.document_id = d.id AND c.version = v.version_no AND c.version_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.sales_agent_knowledge_chunks WHERE version_id IS NULL) THEN
        RAISE EXCEPTION 'MIGRATION_060_BACKFILL_FAILED: chunk without version';
    END IF;
END $$;

ALTER TABLE public.sales_agent_knowledge_chunks
    ALTER COLUMN version_id SET NOT NULL,
    ALTER COLUMN index_generation_id SET NOT NULL,
    ALTER COLUMN hierarchy_path SET NOT NULL,
    ALTER COLUMN section_anchor SET NOT NULL,
    ALTER COLUMN content_hash SET NOT NULL,
    ALTER COLUMN token_count SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_chunk_version') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT fk_knowledge_chunk_version FOREIGN KEY (version_id)
            REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_chunk_generation') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT fk_knowledge_chunk_generation FOREIGN KEY (index_generation_id)
            REFERENCES public.sales_agent_knowledge_index_generations(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_chunk_parent') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT fk_knowledge_chunk_parent FOREIGN KEY (parent_chunk_id)
            REFERENCES public.sales_agent_knowledge_chunks(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunk_level_check') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT knowledge_chunk_level_check CHECK (chunk_level BETWEEN 0 AND 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunk_hash_check') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT knowledge_chunk_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunk_token_check') THEN
        ALTER TABLE public.sales_agent_knowledge_chunks
            ADD CONSTRAINT knowledge_chunk_token_check CHECK (token_count BETWEEN 1 AND 600);
    END IF;
END $$;

-- 4/8 durable index jobs.
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_index_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    index_generation_id TEXT NOT NULL REFERENCES public.sales_agent_knowledge_index_generations(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    chunk_count INTEGER,
    embedded_count INTEGER,
    reused_count INTEGER,
    error_code TEXT,
    error_message TEXT,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_index_jobs_active
    ON public.sales_agent_knowledge_index_jobs (version_id, index_generation_id)
    WHERE status IN ('PENDING', 'PROCESSING');

-- 6/8 canonical media assets (bytes deduplicated by SHA-256).
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha256 TEXT NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL CHECK (byte_size > 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    storage_key TEXT,
    active_annotation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_assets_storage_key
    ON public.sales_agent_knowledge_assets (storage_key) WHERE storage_key IS NOT NULL;

-- 7/8 contextual occurrences; source URL is not canonical identity.
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_asset_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_assets(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
    source_occurrence_id TEXT NOT NULL UNIQUE CHECK (source_occurrence_id ~ '^occ_[0-9a-f]{32}$'),
    source_packet_id TEXT NOT NULL CHECK (source_packet_id ~ '^visual_[0-9a-f]{32}$'),
    source_node_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_locator JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_locator) = 'object'),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    role TEXT NOT NULL DEFAULT 'ILLUSTRATION' CHECK (role IN ('ILLUSTRATION', 'DIAGRAM', 'SCREENSHOT', 'WARNING', 'INLINE_MARKER', 'DECORATIVE')),
    context_text TEXT CHECK (context_text IS NULL OR char_length(context_text) <= 2000),
    relation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(relation_metadata) = 'object'),
    retrieval_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_knowledge_asset_occurrence UNIQUE (version_id, source_node_id, ordinal)
);

-- 8/8 annotation revisions. Text embeddings only; no image embedding in v1.
CREATE TABLE IF NOT EXISTS public.sales_agent_knowledge_asset_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_assets(id) ON DELETE CASCADE,
    revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
    status TEXT NOT NULL DEFAULT 'AI_DRAFT' CHECK (status IN ('AI_DRAFT', 'APPROVED', 'REJECTED', 'IGNORED', 'STALE')),
    decision TEXT NOT NULL DEFAULT 'ANNOTATE' CHECK (decision IN ('ANNOTATE', 'DECORATIVE', 'UNREADABLE', 'NEEDS_REVIEW')),
    image_type TEXT NOT NULL DEFAULT 'OTHER' CHECK (image_type IN ('DIAGRAM', 'PROCEDURE_STEP', 'SCREENSHOT', 'WARNING', 'CONTROL_LOCATION', 'TABLE_LEGEND', 'ICON_MARKER', 'PHOTO', 'OTHER')),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 800),
    keywords TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(keywords) <= 12),
    visible_text TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(visible_text) <= 24),
    relations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(relations) = 'array' AND jsonb_array_length(relations) <= 24),
    confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    retrieval_recommendation TEXT NOT NULL DEFAULT 'REVIEW' CHECK (retrieval_recommendation IN ('INCLUDE', 'EXCLUDE', 'REVIEW')),
    safety_critical BOOLEAN NOT NULL DEFAULT false,
    content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    source_asset_sha256 TEXT NOT NULL CHECK (source_asset_sha256 ~ '^[0-9a-f]{64}$'),
    source_packet_id TEXT CHECK (source_packet_id IS NULL OR source_packet_id ~ '^visual_[0-9a-f]{32}$'),
    vision_provider TEXT,
    model_id TEXT,
    request_id TEXT,
    prompt_hash TEXT CHECK (prompt_hash IS NULL OR prompt_hash ~ '^[0-9a-f]{64}$'),
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
    index_generation_id TEXT REFERENCES public.sales_agent_knowledge_index_generations(id),
    embedding vector(512),
    tsv_content TSVECTOR,
    created_by UUID,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_knowledge_asset_annotation_revision UNIQUE (asset_id, revision_no),
    CONSTRAINT knowledge_asset_annotation_review_check CHECK (
        status = 'AI_DRAFT' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT knowledge_asset_annotation_embedding_check CHECK (
        (embedding IS NULL AND index_generation_id IS NULL)
        OR (embedding IS NOT NULL AND index_generation_id IS NOT NULL AND status = 'APPROVED')
    )
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_knowledge_asset_active_annotation') THEN
        ALTER TABLE public.sales_agent_knowledge_assets
            ADD CONSTRAINT fk_knowledge_asset_active_annotation FOREIGN KEY (active_annotation_id)
            REFERENCES public.sales_agent_knowledge_asset_annotations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Search/index helpers.
CREATE OR REPLACE FUNCTION public.sync_knowledge_chunk_tsv()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    NEW.tsv_content := setweight(to_tsvector('simple', coalesce(NEW.section_title, '')), 'A') ||
                       setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'B');
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_knowledge_chunk_tsv ON public.sales_agent_knowledge_chunks;
CREATE TRIGGER trg_sync_knowledge_chunk_tsv
BEFORE INSERT OR UPDATE OF section_title, content ON public.sales_agent_knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.sync_knowledge_chunk_tsv();

UPDATE public.sales_agent_knowledge_chunks
SET tsv_content = setweight(to_tsvector('simple', coalesce(section_title, '')), 'A') ||
                  setweight(to_tsvector('simple', coalesce(content, '')), 'B')
WHERE tsv_content IS NULL;

CREATE OR REPLACE FUNCTION public.sync_knowledge_asset_annotation_tsv()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    NEW.tsv_content := setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                       setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
                       setweight(to_tsvector('simple', array_to_string(coalesce(NEW.keywords, '{}'), ' ')), 'C');
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_knowledge_asset_annotation_tsv ON public.sales_agent_knowledge_asset_annotations;
CREATE TRIGGER trg_sync_knowledge_asset_annotation_tsv
BEFORE INSERT OR UPDATE OF title, summary, keywords ON public.sales_agent_knowledge_asset_annotations
FOR EACH ROW EXECUTE FUNCTION public.sync_knowledge_asset_annotation_tsv();

CREATE OR REPLACE FUNCTION public.enforce_knowledge_asset_active_annotation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.active_annotation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_asset_annotations annotation
        WHERE annotation.id = NEW.active_annotation_id
          AND annotation.asset_id = NEW.id
          AND annotation.status = 'APPROVED'
          AND annotation.source_asset_sha256 = NEW.sha256
    ) THEN
        RAISE EXCEPTION 'INVALID_ACTIVE_ANNOTATION: annotation % must be approved and belong to asset %',
            NEW.active_annotation_id, NEW.id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_knowledge_asset_active_annotation ON public.sales_agent_knowledge_assets;
CREATE TRIGGER trg_enforce_knowledge_asset_active_annotation
BEFORE INSERT OR UPDATE OF active_annotation_id, sha256 ON public.sales_agent_knowledge_assets
FOR EACH ROW EXECUTE FUNCTION public.enforce_knowledge_asset_active_annotation();

CREATE OR REPLACE FUNCTION public.enforce_knowledge_asset_annotation_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.asset_id IS DISTINCT FROM OLD.asset_id
       OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
       OR NEW.decision IS DISTINCT FROM OLD.decision
       OR NEW.image_type IS DISTINCT FROM OLD.image_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.keywords IS DISTINCT FROM OLD.keywords
       OR NEW.visible_text IS DISTINCT FROM OLD.visible_text
       OR NEW.relations IS DISTINCT FROM OLD.relations
       OR NEW.confidence IS DISTINCT FROM OLD.confidence
       OR NEW.retrieval_recommendation IS DISTINCT FROM OLD.retrieval_recommendation
       OR NEW.safety_critical IS DISTINCT FROM OLD.safety_critical
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.source_asset_sha256 IS DISTINCT FROM OLD.source_asset_sha256
       OR NEW.source_packet_id IS DISTINCT FROM OLD.source_packet_id
       OR NEW.vision_provider IS DISTINCT FROM OLD.vision_provider
       OR NEW.model_id IS DISTINCT FROM OLD.model_id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.prompt_hash IS DISTINCT FROM OLD.prompt_hash
       OR NEW.provenance IS DISTINCT FROM OLD.provenance
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
        RAISE EXCEPTION 'IMMUTABLE_ANNOTATION_REVISION: create a new revision instead of editing annotation content';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'AI_DRAFT' AND NEW.status IN ('APPROVED', 'REJECTED', 'IGNORED'))
        OR (OLD.status = 'APPROVED' AND NEW.status = 'STALE')
    ) THEN
        RAISE EXCEPTION 'INVALID_ANNOTATION_STATUS_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'APPROVED' AND NEW.status = 'STALE' AND EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_assets asset
        WHERE asset.id = OLD.asset_id AND asset.active_annotation_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'ACTIVE_ANNOTATION_MUST_BE_DEACTIVATED: clear asset pointer before marking stale';
    END IF;

    IF NEW.status = 'APPROVED' AND NOT EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_assets asset
        WHERE asset.id = NEW.asset_id AND asset.sha256 = NEW.source_asset_sha256
    ) THEN
        RAISE EXCEPTION 'ANNOTATION_ASSET_HASH_MISMATCH: annotation bytes do not match the asset';
    END IF;
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_knowledge_asset_annotation_revision ON public.sales_agent_knowledge_asset_annotations;
CREATE TRIGGER trg_enforce_knowledge_asset_annotation_revision
BEFORE UPDATE ON public.sales_agent_knowledge_asset_annotations
FOR EACH ROW EXECUTE FUNCTION public.enforce_knowledge_asset_annotation_revision();

CREATE OR REPLACE FUNCTION public.sales_agent_review_knowledge_asset_annotation(
    p_annotation_id UUID,
    p_target_status TEXT,
    p_actor_id UUID,
    p_review_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_annotation public.sales_agent_knowledge_asset_annotations%ROWTYPE;
    v_asset public.sales_agent_knowledge_assets%ROWTYPE;
BEGIN
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'REVIEW_ACTOR_REQUIRED'; END IF;
    IF p_target_status NOT IN ('APPROVED', 'REJECTED', 'IGNORED') THEN
        RAISE EXCEPTION 'INVALID_REVIEW_STATUS: %', p_target_status;
    END IF;

    SELECT * INTO v_annotation
    FROM public.sales_agent_knowledge_asset_annotations
    WHERE id = p_annotation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ANNOTATION_NOT_FOUND: %', p_annotation_id; END IF;
    IF v_annotation.status <> 'AI_DRAFT' THEN
        RAISE EXCEPTION 'ANNOTATION_NOT_REVIEWABLE: %', v_annotation.status;
    END IF;
    IF v_annotation.created_by IS NOT NULL AND v_annotation.created_by = p_actor_id THEN
        RAISE EXCEPTION 'MAKER_CHECKER_REQUIRED: creator cannot review the same revision';
    END IF;

    SELECT * INTO v_asset
    FROM public.sales_agent_knowledge_assets
    WHERE id = v_annotation.asset_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_NOT_FOUND: %', v_annotation.asset_id; END IF;
    IF v_asset.sha256 <> v_annotation.source_asset_sha256 THEN
        RAISE EXCEPTION 'ANNOTATION_ASSET_HASH_MISMATCH';
    END IF;

    IF p_target_status = 'APPROVED' AND v_asset.active_annotation_id IS NOT NULL THEN
        UPDATE public.sales_agent_knowledge_assets
        SET active_annotation_id = NULL, updated_at = timezone('utc', now())
        WHERE id = v_asset.id;
        UPDATE public.sales_agent_knowledge_asset_annotations
        SET status = 'STALE', reviewed_by = p_actor_id, reviewed_at = timezone('utc', now()),
            review_note = coalesce(p_review_note, 'Superseded by a newly approved revision')
        WHERE id = v_asset.active_annotation_id AND status = 'APPROVED';
    END IF;

    UPDATE public.sales_agent_knowledge_asset_annotations
    SET status = p_target_status, reviewed_by = p_actor_id,
        reviewed_at = timezone('utc', now()), review_note = p_review_note
    WHERE id = p_annotation_id;

    IF p_target_status = 'APPROVED' THEN
        UPDATE public.sales_agent_knowledge_assets
        SET active_annotation_id = p_annotation_id, updated_at = timezone('utc', now())
        WHERE id = v_asset.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'asset_id', v_asset.id,
        'annotation_id', p_annotation_id,
        'status', p_target_status
    );
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(
    p_annotation_id UUID,
    p_title TEXT,
    p_summary TEXT,
    p_keywords TEXT[],
    p_visible_text TEXT[],
    p_image_type TEXT,
    p_retrieval_recommendation TEXT,
    p_safety_critical BOOLEAN,
    p_actor_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_base public.sales_agent_knowledge_asset_annotations%ROWTYPE;
    v_revision_no INTEGER;
    v_annotation_id UUID;
    v_content_hash TEXT;
BEGIN
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'REVISION_ACTOR_REQUIRED'; END IF;
    IF char_length(trim(coalesce(p_title, ''))) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'INVALID_ANNOTATION_TITLE';
    END IF;
    IF char_length(trim(coalesce(p_summary, ''))) NOT BETWEEN 1 AND 800 THEN
        RAISE EXCEPTION 'INVALID_ANNOTATION_SUMMARY';
    END IF;
    IF cardinality(coalesce(p_keywords, '{}')) > 12 OR cardinality(coalesce(p_visible_text, '{}')) > 24 THEN
        RAISE EXCEPTION 'INVALID_ANNOTATION_ARRAY_LIMIT';
    END IF;
    IF p_image_type NOT IN ('DIAGRAM', 'PROCEDURE_STEP', 'SCREENSHOT', 'WARNING', 'CONTROL_LOCATION', 'TABLE_LEGEND', 'ICON_MARKER', 'PHOTO', 'OTHER') THEN
        RAISE EXCEPTION 'INVALID_ANNOTATION_IMAGE_TYPE: %', p_image_type;
    END IF;
    IF p_retrieval_recommendation NOT IN ('INCLUDE', 'EXCLUDE', 'REVIEW') THEN
        RAISE EXCEPTION 'INVALID_RETRIEVAL_RECOMMENDATION: %', p_retrieval_recommendation;
    END IF;

    SELECT * INTO v_base
    FROM public.sales_agent_knowledge_asset_annotations
    WHERE id = p_annotation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ANNOTATION_NOT_FOUND: %', p_annotation_id; END IF;
    IF v_base.status <> 'AI_DRAFT' THEN
        RAISE EXCEPTION 'ANNOTATION_NOT_EDITABLE: %', v_base.status;
    END IF;
    PERFORM 1 FROM public.sales_agent_knowledge_assets WHERE id = v_base.asset_id FOR UPDATE;

    SELECT coalesce(max(revision_no), 0) + 1 INTO v_revision_no
    FROM public.sales_agent_knowledge_asset_annotations
    WHERE asset_id = v_base.asset_id;

    v_content_hash := encode(digest(jsonb_build_object(
        'decision', v_base.decision,
        'imageType', p_image_type,
        'title', trim(p_title),
        'summary', trim(p_summary),
        'keywords', coalesce(p_keywords, '{}'),
        'visibleText', coalesce(p_visible_text, '{}'),
        'relations', v_base.relations,
        'confidence', v_base.confidence,
        'retrievalRecommendation', p_retrieval_recommendation,
        'safetyCritical', p_safety_critical
    )::text, 'sha256'), 'hex');

    UPDATE public.sales_agent_knowledge_asset_annotations
    SET status = 'IGNORED', reviewed_by = p_actor_id, reviewed_at = timezone('utc', now()),
        review_note = 'SUPERSEDED_BY_ADMIN_EDIT'
    WHERE id = v_base.id;

    INSERT INTO public.sales_agent_knowledge_asset_annotations (
        asset_id, revision_no, status, decision, image_type, title, summary,
        keywords, visible_text, relations, confidence, retrieval_recommendation,
        safety_critical, content_hash, source_asset_sha256, source_packet_id,
        vision_provider, model_id, request_id, prompt_hash, provenance, created_by
    ) VALUES (
        v_base.asset_id, v_revision_no, 'AI_DRAFT', v_base.decision, p_image_type,
        trim(p_title), trim(p_summary), coalesce(p_keywords, '{}'),
        coalesce(p_visible_text, '{}'), v_base.relations, v_base.confidence,
        p_retrieval_recommendation, p_safety_critical, v_content_hash,
        v_base.source_asset_sha256, v_base.source_packet_id, v_base.vision_provider,
        v_base.model_id, v_base.request_id, v_base.prompt_hash,
        v_base.provenance || jsonb_build_object(
            'editedFromAnnotationId', v_base.id,
            'editedAt', timezone('utc', now()),
            'editKind', 'ADMIN_REVISION'
        ),
        p_actor_id
    ) RETURNING id INTO v_annotation_id;

    RETURN jsonb_build_object(
        'success', true,
        'asset_id', v_base.asset_id,
        'annotation_id', v_annotation_id,
        'revision_no', v_revision_no,
        'status', 'AI_DRAFT'
    );
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(
    p_annotation_ids UUID[],
    p_target_status TEXT,
    p_actor_id UUID,
    p_review_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_annotation_id UUID;
    v_results JSONB := '[]'::jsonb;
    v_count INTEGER := coalesce(array_length(p_annotation_ids, 1), 0);
BEGIN
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'REVIEW_ACTOR_REQUIRED'; END IF;
    IF v_count NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_BULK_REVIEW_COUNT: %', v_count; END IF;
    IF (SELECT count(*) FROM unnest(p_annotation_ids) value)
       <> (SELECT count(DISTINCT value) FROM unnest(p_annotation_ids) value) THEN
        RAISE EXCEPTION 'DUPLICATE_BULK_REVIEW_ANNOTATION';
    END IF;

    FOREACH v_annotation_id IN ARRAY p_annotation_ids LOOP
        v_results := v_results || jsonb_build_array(
            public.sales_agent_review_knowledge_asset_annotation(
                v_annotation_id, p_target_status, p_actor_id, p_review_note
            )
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_count, 'results', v_results);
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_mark_knowledge_asset_stale(
    p_asset_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_active_annotation_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'STALE_ACTOR_REQUIRED'; END IF;
    SELECT active_annotation_id INTO v_active_annotation_id
    FROM public.sales_agent_knowledge_assets WHERE id = p_asset_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ASSET_NOT_FOUND: %', p_asset_id; END IF;
    IF v_active_annotation_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'asset_id', p_asset_id, 'already_inactive', true);
    END IF;
    UPDATE public.sales_agent_knowledge_assets
    SET active_annotation_id = NULL, updated_at = timezone('utc', now())
    WHERE id = p_asset_id;
    UPDATE public.sales_agent_knowledge_asset_annotations
    SET status = 'STALE', reviewed_by = p_actor_id, reviewed_at = timezone('utc', now()), review_note = p_reason
    WHERE id = v_active_annotation_id AND status = 'APPROVED';
    RETURN jsonb_build_object('success', true, 'asset_id', p_asset_id, 'annotation_id', v_active_annotation_id);
END $$;

CREATE OR REPLACE FUNCTION public.enforce_knowledge_version_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.publication_status IN ('APPROVED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED') AND (
        NEW.document_id IS DISTINCT FROM OLD.document_id OR
        NEW.version_no IS DISTINCT FROM OLD.version_no OR
        NEW.content_markdown IS DISTINCT FROM OLD.content_markdown OR
        NEW.content_checksum IS DISTINCT FROM OLD.content_checksum OR
        NEW.source_uri IS DISTINCT FROM OLD.source_uri OR
        NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR
        NEW.author_id IS DISTINCT FROM OLD.author_id OR
        NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
    ) THEN
        RAISE EXCEPTION 'IMMUTABLE_VERSION: approved/published version content and provenance cannot change';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_knowledge_version_immutability ON public.sales_agent_knowledge_versions;
CREATE TRIGGER trg_enforce_knowledge_version_immutability
BEFORE UPDATE ON public.sales_agent_knowledge_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_knowledge_version_immutability();

CREATE OR REPLACE FUNCTION public.enforce_knowledge_document_active_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.active_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_versions version
        WHERE version.id = NEW.active_version_id
          AND version.document_id = NEW.id
          AND version.publication_status = 'PUBLISHED'
          AND version.index_status = 'READY'
    ) THEN
        RAISE EXCEPTION 'INVALID_ACTIVE_VERSION: version % must be published, ready, and belong to document %',
            NEW.active_version_id, NEW.id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_knowledge_document_active_version ON public.sales_agent_knowledge_documents;
CREATE TRIGGER trg_enforce_knowledge_document_active_version
BEFORE INSERT OR UPDATE OF active_version_id ON public.sales_agent_knowledge_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_knowledge_document_active_version();

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_active_scope
    ON public.sales_agent_knowledge_documents (lifecycle_status, locale, market, vehicle_key, model_year);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_document
    ON public.sales_agent_knowledge_versions (document_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_ready
    ON public.sales_agent_knowledge_versions (index_status, publication_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_chunks_version_path
    ON public.sales_agent_knowledge_chunks (version_id, hierarchy_path);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_parent
    ON public.sales_agent_knowledge_chunks (parent_chunk_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_node
    ON public.sales_agent_knowledge_chunks (version_id, source_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
    ON public.sales_agent_knowledge_chunks USING gin (tsv_content);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw
    ON public.sales_agent_knowledge_chunks USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_asset_occurrences_version_node
    ON public.sales_agent_knowledge_asset_occurrences (version_id, source_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_asset_occurrences_asset
    ON public.sales_agent_knowledge_asset_occurrences (asset_id, retrieval_enabled);
CREATE INDEX IF NOT EXISTS idx_knowledge_asset_annotations_asset_status
    ON public.sales_agent_knowledge_asset_annotations (asset_id, status, revision_no DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_asset_annotations_tsv
    ON public.sales_agent_knowledge_asset_annotations USING gin (tsv_content) WHERE status = 'APPROVED';
CREATE INDEX IF NOT EXISTS idx_knowledge_asset_annotations_embedding_hnsw
    ON public.sales_agent_knowledge_asset_annotations USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL AND status = 'APPROVED';

-- Runtime state without a ninth table.
CREATE OR REPLACE FUNCTION public.sales_agent_get_knowledge_runtime_state()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'knowledge_epoch', COALESCE((SELECT max(retrieval_epoch) FROM public.sales_agent_knowledge_documents), 1),
        'active_index_generation_id', (
            SELECT id FROM public.sales_agent_knowledge_index_generations WHERE is_active ORDER BY activated_at DESC NULLS LAST LIMIT 1
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.sales_agent_enqueue_index_job(
    p_version_id UUID,
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_version public.sales_agent_knowledge_versions%ROWTYPE;
    v_job_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_version_id::text || ':' || p_index_generation_id));
    SELECT * INTO v_version FROM public.sales_agent_knowledge_versions WHERE id = p_version_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_NOT_FOUND: %', p_version_id; END IF;
    IF v_version.publication_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'VERSION_NOT_APPROVED: Version ID % must be APPROVED before indexing', p_version_id;
    END IF;
    IF v_version.reviewer_id IS NULL THEN
        RAISE EXCEPTION 'REVIEW_REQUIRED: Version ID % has no reviewer', p_version_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_agent_knowledge_index_generations WHERE id = p_index_generation_id) THEN
        RAISE EXCEPTION 'INDEX_GENERATION_NOT_FOUND: %', p_index_generation_id;
    END IF;

    SELECT id INTO v_job_id FROM public.sales_agent_knowledge_index_jobs
    WHERE version_id = p_version_id
      AND index_generation_id = p_index_generation_id
      AND status IN ('PENDING', 'PROCESSING')
    ORDER BY created_at LIMIT 1;
    IF v_job_id IS NOT NULL THEN RETURN v_job_id; END IF;

    INSERT INTO public.sales_agent_knowledge_index_jobs (version_id, index_generation_id)
    VALUES (p_version_id, p_index_generation_id) RETURNING id INTO v_job_id;
    UPDATE public.sales_agent_knowledge_versions SET index_status = 'BUILDING' WHERE id = p_version_id;
    RETURN v_job_id;
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_finalize_knowledge_hierarchy(p_version_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_count INTEGER;
BEGIN
    UPDATE public.sales_agent_knowledge_chunks child
    SET parent_chunk_id = parent.id
    FROM public.sales_agent_knowledge_chunks parent
    WHERE child.version_id = p_version_id
      AND parent.version_id = p_version_id
      AND child.parent_hierarchy_path IS NOT NULL
      AND parent.hierarchy_path = child.parent_hierarchy_path;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF EXISTS (
        SELECT 1 FROM public.sales_agent_knowledge_chunks
        WHERE version_id = p_version_id AND parent_hierarchy_path IS NOT NULL AND parent_chunk_id IS NULL
    ) THEN
        RAISE EXCEPTION 'HIERARCHY_PARENT_MISSING: version %', p_version_id;
    END IF;
    RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_activate_version(
    p_document_id UUID, p_version_id UUID, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_doc public.sales_agent_knowledge_documents%ROWTYPE;
    v_ver public.sales_agent_knowledge_versions%ROWTYPE;
    v_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc FROM public.sales_agent_knowledge_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', p_document_id; END IF;
    SELECT * INTO v_ver FROM public.sales_agent_knowledge_versions
    WHERE id = p_version_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_NOT_FOUND: Version ID % does not belong to document %', p_version_id, p_document_id; END IF;
    IF v_ver.publication_status <> 'APPROVED' THEN RAISE EXCEPTION 'VERSION_NOT_APPROVED: %', p_version_id; END IF;
    IF v_ver.reviewer_id IS NULL THEN RAISE EXCEPTION 'REVIEW_REQUIRED: %', p_version_id; END IF;
    IF v_ver.index_status <> 'READY' THEN RAISE EXCEPTION 'VERSION_NOT_READY: %', p_version_id; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_agent_knowledge_chunks WHERE version_id = p_version_id) THEN
        RAISE EXCEPTION 'VERSION_HAS_NO_CHUNKS: %', p_version_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_chunks c
        LEFT JOIN public.sales_agent_knowledge_index_generations g
          ON g.id = c.index_generation_id AND g.is_active
        WHERE c.version_id = p_version_id
          AND (c.embedding IS NULL OR c.index_generation_id IS NULL OR g.id IS NULL)
    ) THEN RAISE EXCEPTION 'VERSION_INDEX_INCOMPLETE_OR_STALE: %', p_version_id; END IF;

    IF v_doc.active_version_id IS NOT NULL AND v_doc.active_version_id <> p_version_id THEN
        UPDATE public.sales_agent_knowledge_versions
        SET publication_status = 'SUPERSEDED', effective_to = timezone('utc', now())
        WHERE id = v_doc.active_version_id;
    END IF;
    UPDATE public.sales_agent_knowledge_versions
    SET publication_status = 'PUBLISHED', activated_at = timezone('utc', now()),
        activation_actor_id = p_actor_id, activation_reason = p_reason, effective_to = NULL
    WHERE id = p_version_id;
    v_epoch := nextval('public.sales_agent_knowledge_epoch_seq');
    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = p_version_id, lifecycle_status = 'ACTIVE', deleted_at = NULL,
        retrieval_epoch = v_epoch, lifecycle_actor_id = p_actor_id, lifecycle_reason = p_reason,
        status = 'PUBLISHED', published_version = v_ver.version_no,
        content_markdown = v_ver.content_markdown, summary = v_ver.summary,
        published_at = timezone('utc', now()), updated_at = timezone('utc', now())
    WHERE id = p_document_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = true WHERE version_id = p_version_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = false
    WHERE document_id = p_document_id AND version_id <> p_version_id;
    RETURN jsonb_build_object('success', true, 'epoch', v_epoch);
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_rollback_version(
    p_document_id UUID, p_target_version_id UUID, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_doc public.sales_agent_knowledge_documents%ROWTYPE;
    v_target public.sales_agent_knowledge_versions%ROWTYPE;
    v_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc FROM public.sales_agent_knowledge_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', p_document_id; END IF;
    SELECT * INTO v_target FROM public.sales_agent_knowledge_versions
    WHERE id = p_target_version_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VERSION_NOT_FOUND: %', p_target_version_id; END IF;
    IF v_target.publication_status NOT IN ('PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'VERSION_NOT_ROLLBACKABLE: %', v_target.publication_status;
    END IF;
    IF v_target.index_status <> 'READY' THEN RAISE EXCEPTION 'VERSION_NOT_READY: %', p_target_version_id; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_agent_knowledge_chunks WHERE version_id = p_target_version_id) OR EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_chunks c
        LEFT JOIN public.sales_agent_knowledge_index_generations g
          ON g.id = c.index_generation_id AND g.is_active
        WHERE c.version_id = p_target_version_id
          AND (c.embedding IS NULL OR c.index_generation_id IS NULL OR g.id IS NULL)
    ) THEN RAISE EXCEPTION 'VERSION_INDEX_INCOMPLETE_OR_STALE: %', p_target_version_id; END IF;
    IF v_doc.active_version_id = p_target_version_id THEN RAISE EXCEPTION 'VERSION_ALREADY_ACTIVE: %', p_target_version_id; END IF;
    IF v_doc.active_version_id IS NOT NULL THEN
        UPDATE public.sales_agent_knowledge_versions SET publication_status = 'SUPERSEDED', effective_to = timezone('utc', now())
        WHERE id = v_doc.active_version_id;
    END IF;
    UPDATE public.sales_agent_knowledge_versions
    SET publication_status = 'PUBLISHED', effective_to = NULL, activated_at = timezone('utc', now()),
        activation_actor_id = p_actor_id, activation_reason = p_reason
    WHERE id = p_target_version_id;
    v_epoch := nextval('public.sales_agent_knowledge_epoch_seq');
    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = p_target_version_id, lifecycle_status = 'ACTIVE', deleted_at = NULL,
        retrieval_epoch = v_epoch, lifecycle_actor_id = p_actor_id, lifecycle_reason = p_reason,
        status = 'PUBLISHED', published_version = v_target.version_no,
        content_markdown = v_target.content_markdown, summary = v_target.summary,
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = (version_id = p_target_version_id)
    WHERE document_id = p_document_id;
    RETURN jsonb_build_object('success', true, 'epoch', v_epoch);
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_archive_document(
    p_document_id UUID, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_epoch BIGINT;
BEGIN
    PERFORM 1 FROM public.sales_agent_knowledge_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', p_document_id; END IF;
    v_epoch := nextval('public.sales_agent_knowledge_epoch_seq');
    UPDATE public.sales_agent_knowledge_documents
    SET lifecycle_status = 'ARCHIVED', status = 'ARCHIVED', retrieval_epoch = v_epoch,
        lifecycle_actor_id = p_actor_id, lifecycle_reason = p_reason, updated_at = timezone('utc', now())
    WHERE id = p_document_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = false WHERE document_id = p_document_id;
    RETURN jsonb_build_object('success', true, 'epoch', v_epoch);
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_soft_delete_document(
    p_document_id UUID, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_epoch BIGINT;
BEGIN
    PERFORM 1 FROM public.sales_agent_knowledge_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', p_document_id; END IF;
    v_epoch := nextval('public.sales_agent_knowledge_epoch_seq');
    UPDATE public.sales_agent_knowledge_documents
    SET lifecycle_status = 'DELETED', deleted_at = timezone('utc', now()), retrieval_epoch = v_epoch,
        lifecycle_actor_id = p_actor_id, lifecycle_reason = p_reason, updated_at = timezone('utc', now())
    WHERE id = p_document_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = false WHERE document_id = p_document_id;
    RETURN jsonb_build_object('success', true, 'epoch', v_epoch);
END $$;

CREATE OR REPLACE FUNCTION public.sales_agent_restore_document(
    p_document_id UUID, p_restore_version_id UUID DEFAULT NULL, p_actor_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_doc public.sales_agent_knowledge_documents%ROWTYPE;
    v_ver public.sales_agent_knowledge_versions%ROWTYPE;
    v_version_id UUID;
    v_epoch BIGINT;
BEGIN
    SELECT * INTO v_doc FROM public.sales_agent_knowledge_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: %', p_document_id; END IF;
    v_version_id := COALESCE(p_restore_version_id, v_doc.active_version_id);
    SELECT * INTO v_ver FROM public.sales_agent_knowledge_versions
    WHERE id = v_version_id AND document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RESTORE_VERSION_NOT_FOUND: Version ID % does not belong to document %', v_version_id, p_document_id; END IF;
    IF v_ver.index_status <> 'READY' THEN RAISE EXCEPTION 'VERSION_NOT_READY: %', v_version_id; END IF;
    IF v_ver.publication_status NOT IN ('PUBLISHED', 'ARCHIVED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'VERSION_NOT_RESTORABLE: %', v_ver.publication_status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_agent_knowledge_chunks WHERE version_id = v_version_id) OR EXISTS (
        SELECT 1
        FROM public.sales_agent_knowledge_chunks c
        LEFT JOIN public.sales_agent_knowledge_index_generations g
          ON g.id = c.index_generation_id AND g.is_active
        WHERE c.version_id = v_version_id
          AND (c.embedding IS NULL OR c.index_generation_id IS NULL OR g.id IS NULL)
    ) THEN RAISE EXCEPTION 'VERSION_INDEX_INCOMPLETE_OR_STALE: %', v_version_id; END IF;
    IF v_doc.active_version_id IS NOT NULL AND v_doc.active_version_id <> v_version_id THEN
        UPDATE public.sales_agent_knowledge_versions SET publication_status = 'ARCHIVED', effective_to = timezone('utc', now())
        WHERE id = v_doc.active_version_id;
    END IF;
    UPDATE public.sales_agent_knowledge_versions SET publication_status = 'PUBLISHED', effective_to = NULL WHERE id = v_version_id;
    v_epoch := nextval('public.sales_agent_knowledge_epoch_seq');
    UPDATE public.sales_agent_knowledge_documents
    SET active_version_id = v_version_id, lifecycle_status = 'ACTIVE', deleted_at = NULL,
        status = 'PUBLISHED', published_version = v_ver.version_no,
        content_markdown = v_ver.content_markdown, summary = v_ver.summary,
        retrieval_epoch = v_epoch, lifecycle_actor_id = p_actor_id, lifecycle_reason = p_reason,
        updated_at = timezone('utc', now())
    WHERE id = p_document_id;
    UPDATE public.sales_agent_knowledge_chunks SET is_active = (version_id = v_version_id)
    WHERE document_id = p_document_id;
    RETURN jsonb_build_object('success', true, 'epoch', v_epoch);
END $$;

-- Shared active-candidate projection used by FTS/vector/hierarchy RPCs.
CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_fts(
    p_query TEXT,
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1',
    p_limit INTEGER DEFAULT 20,
    p_vehicle_model TEXT DEFAULT NULL,
    p_vehicle_type TEXT DEFAULT NULL,
    p_model_year INTEGER DEFAULT NULL,
    p_market TEXT DEFAULT 'VN',
    p_customer_segment TEXT DEFAULT 'ALL',
    p_category TEXT DEFAULT NULL,
    p_locale TEXT DEFAULT 'vi-VN',
    p_effective_at TIMESTAMPTZ DEFAULT timezone('utc', now())
) RETURNS TABLE (
    id UUID, document_id UUID, document_key TEXT, version_id UUID, version_no INTEGER,
    index_generation_id TEXT, chunk_level SMALLINT, hierarchy_path TEXT, section_anchor TEXT,
    section_title TEXT, content TEXT, content_hash TEXT, token_count INTEGER, chunk_ordinal INTEGER,
    tags TEXT[], scope_metadata JSONB, source_node_id TEXT, image_refs JSONB, title TEXT, slug TEXT,
    category TEXT, effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
    publication_status TEXT, index_status TEXT, fts_score REAL
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH q AS (SELECT websearch_to_tsquery('simple', p_query) AS query)
    SELECT c.id, d.id, d.document_key, v.id, v.version_no, c.index_generation_id,
           c.chunk_level, c.hierarchy_path, c.section_anchor, c.section_title, c.content,
           c.content_hash, c.token_count, c.chunk_index, c.tags,
           jsonb_build_array(jsonb_build_object(
               'vehicleModel', d.vehicle_model, 'vehicleType', d.vehicle_type,
               'modelYearFrom', d.model_year, 'modelYearTo', d.model_year,
               'market', d.market, 'customerSegment', d.customer_segment
           )), c.source_node_id, c.image_refs, d.title, d.slug, d.category,
           v.effective_from, v.effective_to, v.publication_status, v.index_status,
           ts_rank_cd(c.tsv_content, q.query)::real
    FROM q, public.sales_agent_knowledge_chunks c
    JOIN public.sales_agent_knowledge_versions v ON v.id = c.version_id
    JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id AND d.active_version_id = v.id
    JOIN public.sales_agent_knowledge_index_generations g ON g.id = c.index_generation_id AND g.is_active
    WHERE d.lifecycle_status = 'ACTIVE' AND d.deleted_at IS NULL AND c.is_active
      AND v.publication_status = 'PUBLISHED' AND v.index_status = 'READY'
      AND c.index_generation_id = p_index_generation_id AND c.tsv_content @@ q.query
      AND v.effective_from <= p_effective_at AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
      AND d.locale = p_locale AND d.market = p_market
      AND (p_category IS NULL OR d.category = p_category)
      AND (p_vehicle_model IS NULL OR d.vehicle_model IS NULL OR replace(lower(d.vehicle_model), ' ', '') = replace(lower(p_vehicle_model), ' ', ''))
      AND (p_vehicle_type IS NULL OR p_vehicle_type = 'ALL' OR d.vehicle_type = 'ALL' OR d.vehicle_type = p_vehicle_type)
      AND (p_model_year IS NULL OR d.model_year IS NULL OR d.model_year = p_model_year)
      AND (p_customer_segment = 'ALL' OR d.customer_segment = 'ALL' OR d.customer_segment = p_customer_segment)
    ORDER BY ts_rank_cd(c.tsv_content, q.query) DESC, c.id
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_vector(
    p_query_embedding vector(512),
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1',
    p_limit INTEGER DEFAULT 20,
    p_vehicle_model TEXT DEFAULT NULL,
    p_vehicle_type TEXT DEFAULT NULL,
    p_model_year INTEGER DEFAULT NULL,
    p_customer_segment TEXT DEFAULT 'ALL',
    p_category TEXT DEFAULT NULL,
    p_market TEXT DEFAULT 'VN',
    p_locale TEXT DEFAULT 'vi-VN',
    p_effective_at TIMESTAMPTZ DEFAULT timezone('utc', now())
) RETURNS TABLE (
    id UUID, document_id UUID, document_key TEXT, version_id UUID, version_no INTEGER,
    index_generation_id TEXT, chunk_level SMALLINT, hierarchy_path TEXT, section_anchor TEXT,
    section_title TEXT, content TEXT, content_hash TEXT, token_count INTEGER, chunk_ordinal INTEGER,
    tags TEXT[], scope_metadata JSONB, source_node_id TEXT, image_refs JSONB, title TEXT, slug TEXT,
    category TEXT, effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
    publication_status TEXT, index_status TEXT, vector_score DOUBLE PRECISION
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT c.id, d.id, d.document_key, v.id, v.version_no, c.index_generation_id,
           c.chunk_level, c.hierarchy_path, c.section_anchor, c.section_title, c.content,
           c.content_hash, c.token_count, c.chunk_index, c.tags,
           jsonb_build_array(jsonb_build_object(
               'vehicleModel', d.vehicle_model, 'vehicleType', d.vehicle_type,
               'modelYearFrom', d.model_year, 'modelYearTo', d.model_year,
               'market', d.market, 'customerSegment', d.customer_segment
           )), c.source_node_id, c.image_refs, d.title, d.slug, d.category,
           v.effective_from, v.effective_to, v.publication_status, v.index_status,
           (1 - (c.embedding <=> p_query_embedding))::double precision
    FROM public.sales_agent_knowledge_chunks c
    JOIN public.sales_agent_knowledge_versions v ON v.id = c.version_id
    JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id AND d.active_version_id = v.id
    JOIN public.sales_agent_knowledge_index_generations g ON g.id = c.index_generation_id AND g.is_active
    WHERE d.lifecycle_status = 'ACTIVE' AND d.deleted_at IS NULL AND c.is_active AND c.embedding IS NOT NULL
      AND v.publication_status = 'PUBLISHED' AND v.index_status = 'READY'
      AND c.index_generation_id = p_index_generation_id
      AND v.effective_from <= p_effective_at AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
      AND d.locale = p_locale AND d.market = p_market
      AND (p_category IS NULL OR d.category = p_category)
      AND (p_vehicle_model IS NULL OR d.vehicle_model IS NULL OR replace(lower(d.vehicle_model), ' ', '') = replace(lower(p_vehicle_model), ' ', ''))
      AND (p_vehicle_type IS NULL OR p_vehicle_type = 'ALL' OR d.vehicle_type = 'ALL' OR d.vehicle_type = p_vehicle_type)
      AND (p_model_year IS NULL OR d.model_year IS NULL OR d.model_year = p_model_year)
      AND (p_customer_segment = 'ALL' OR d.customer_segment = 'ALL' OR d.customer_segment = p_customer_segment)
    ORDER BY c.embedding <=> p_query_embedding, c.id
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.sales_agent_load_knowledge_hierarchy_context(
    p_version_ids UUID[],
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1',
    p_limit INTEGER DEFAULT 5000,
    p_effective_at TIMESTAMPTZ DEFAULT timezone('utc', now())
) RETURNS TABLE (
    id UUID, document_id UUID, document_key TEXT, version_id UUID, version_no INTEGER,
    index_generation_id TEXT, chunk_level SMALLINT, hierarchy_path TEXT, section_anchor TEXT,
    section_title TEXT, content TEXT, content_hash TEXT, token_count INTEGER, chunk_ordinal INTEGER,
    tags TEXT[], scope_metadata JSONB, source_node_id TEXT, image_refs JSONB, title TEXT, slug TEXT,
    category TEXT, effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
    publication_status TEXT, index_status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT c.id, d.id, d.document_key, v.id, v.version_no, c.index_generation_id,
           c.chunk_level, c.hierarchy_path, c.section_anchor, c.section_title, c.content,
           c.content_hash, c.token_count, c.chunk_index, c.tags,
           jsonb_build_array(jsonb_build_object(
               'vehicleModel', d.vehicle_model, 'vehicleType', d.vehicle_type,
               'modelYearFrom', d.model_year, 'modelYearTo', d.model_year,
               'market', d.market, 'customerSegment', d.customer_segment
           )), c.source_node_id, c.image_refs, d.title, d.slug, d.category,
           v.effective_from, v.effective_to, v.publication_status, v.index_status
    FROM public.sales_agent_knowledge_chunks c
    JOIN public.sales_agent_knowledge_versions v ON v.id = c.version_id
    JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id AND d.active_version_id = v.id
    WHERE v.id = ANY(p_version_ids) AND c.index_generation_id = p_index_generation_id
      AND d.lifecycle_status = 'ACTIVE' AND d.deleted_at IS NULL AND c.is_active
      AND v.publication_status = 'PUBLISHED' AND v.index_status = 'READY'
      AND v.effective_from <= p_effective_at AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
    ORDER BY v.id, c.chunk_index
    LIMIT LEAST(GREATEST(p_limit, 1), 10000);
$$;

-- Contextual visual pointers for text evidence. This RPC is deliberately
-- approval-only and never searches AI_DRAFT annotation text.
CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_visuals(
    p_query TEXT,
    p_version_ids UUID[],
    p_source_node_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_section_anchors TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_limit INTEGER DEFAULT 6
) RETURNS TABLE (
    asset_id UUID, annotation_id UUID, version_id UUID, source_node_id TEXT,
    section_anchor TEXT, source_url TEXT, title TEXT, summary TEXT,
    image_type TEXT, mime_type TEXT, width INTEGER, height INTEGER,
    safety_critical BOOLEAN, ordinal INTEGER
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH candidates AS (
        SELECT
            asset.id AS asset_id,
            annotation.id AS annotation_id,
            occurrence.version_id,
            occurrence.source_node_id,
            occurrence.source_locator ->> 'sectionAnchor' AS section_anchor,
            occurrence.source_url,
            annotation.title,
            annotation.summary,
            annotation.image_type,
            asset.mime_type,
            asset.width,
            asset.height,
            annotation.safety_critical,
            occurrence.ordinal,
            CASE
              WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
              ELSE ts_rank_cd(
                annotation.tsv_content,
                websearch_to_tsquery('simple', p_query)
              )
            END AS text_rank,
            row_number() OVER (
                PARTITION BY asset.id
                ORDER BY
                  CASE
                    WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
                    ELSE ts_rank_cd(
                      annotation.tsv_content,
                      websearch_to_tsquery('simple', p_query)
                    )
                  END DESC,
                  annotation.safety_critical DESC,
                  occurrence.ordinal,
                  occurrence.id
            ) AS asset_rank
        FROM public.sales_agent_knowledge_asset_occurrences occurrence
        JOIN public.sales_agent_knowledge_assets asset
          ON asset.id = occurrence.asset_id
        JOIN public.sales_agent_knowledge_asset_annotations annotation
          ON annotation.id = asset.active_annotation_id
         AND annotation.asset_id = asset.id
         AND annotation.status = 'APPROVED'
        JOIN public.sales_agent_knowledge_versions version
          ON version.id = occurrence.version_id
         AND version.publication_status = 'PUBLISHED'
         AND version.index_status = 'READY'
        JOIN public.sales_agent_knowledge_documents document
          ON document.id = version.document_id
         AND document.active_version_id = version.id
         AND document.lifecycle_status = 'ACTIVE'
         AND document.deleted_at IS NULL
        WHERE occurrence.version_id = ANY(p_version_ids)
          AND occurrence.retrieval_enabled
          AND occurrence.role NOT IN ('DECORATIVE', 'INLINE_MARKER')
          AND annotation.decision = 'ANNOTATE'
          AND annotation.retrieval_recommendation <> 'EXCLUDE'
          AND (
              occurrence.source_node_id = ANY(COALESCE(p_source_node_ids, ARRAY[]::TEXT[]))
              OR occurrence.source_locator ->> 'sectionAnchor' = ANY(COALESCE(p_section_anchors, ARRAY[]::TEXT[]))
          )
    )
    SELECT
        candidates.asset_id, candidates.annotation_id, candidates.version_id,
        candidates.source_node_id, candidates.section_anchor, candidates.source_url,
        candidates.title, candidates.summary, candidates.image_type,
        candidates.mime_type, candidates.width, candidates.height,
        candidates.safety_critical, candidates.ordinal
    FROM candidates
    WHERE candidates.asset_rank = 1
    ORDER BY candidates.text_rank DESC, candidates.safety_critical DESC, candidates.ordinal, candidates.asset_id
    LIMIT LEAST(GREATEST(p_limit, 1), 6);
$$;

-- Strict service-role-only access for all eight tables.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sales_agent_knowledge_documents', 'sales_agent_knowledge_versions',
        'sales_agent_knowledge_chunks', 'sales_agent_knowledge_index_generations',
        'sales_agent_knowledge_index_jobs', 'sales_agent_knowledge_assets',
        'sales_agent_knowledge_asset_occurrences', 'sales_agent_knowledge_asset_annotations'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Service role full access on ' || replace(t, 'sales_agent_', ''), t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'Service role full access on ' || replace(t, 'sales_agent_', ''), t);
    END LOOP;
END $$;

GRANT USAGE, SELECT ON SEQUENCE public.sales_agent_knowledge_epoch_seq TO service_role;

REVOKE EXECUTE ON FUNCTION public.sales_agent_get_knowledge_runtime_state() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_enqueue_index_job(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_finalize_knowledge_hierarchy(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_activate_version(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_archive_document(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_soft_delete_document(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_restore_document(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_fts(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_load_knowledge_hierarchy_context(UUID[], TEXT, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sales_agent_get_knowledge_runtime_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_enqueue_index_job(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_finalize_knowledge_hierarchy(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_activate_version(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_rollback_version(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_archive_document(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_soft_delete_document(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_restore_document(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_fts(TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_load_knowledge_hierarchy_context(UUID[], TEXT, INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER) TO service_role;
