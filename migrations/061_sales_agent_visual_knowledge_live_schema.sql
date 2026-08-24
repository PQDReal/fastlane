-- Upgrade the empty visual knowledge prototype from the original Migration 060
-- to the reviewed Task 020 contract. Fail closed if any visual data appeared.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sales_agent_knowledge_assets LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.sales_agent_knowledge_asset_occurrences LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.sales_agent_knowledge_asset_annotations LIMIT 1)
  THEN
    RAISE EXCEPTION 'VISUAL_SCHEMA_REBUILD_REQUIRES_EMPTY_TABLES';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_visuals(UUID[], TEXT[], TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], UUID);
DROP FUNCTION IF EXISTS public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.enforce_knowledge_asset_annotation_revision() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_knowledge_asset_active_annotation() CASCADE;
DROP FUNCTION IF EXISTS public.sync_knowledge_asset_annotation_tsv() CASCADE;

DROP TABLE public.sales_agent_knowledge_asset_annotations CASCADE;
DROP TABLE public.sales_agent_knowledge_asset_occurrences CASCADE;
DROP TABLE public.sales_agent_knowledge_assets CASCADE;

CREATE TABLE public.sales_agent_knowledge_assets (
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

CREATE UNIQUE INDEX uq_knowledge_assets_storage_key
  ON public.sales_agent_knowledge_assets (storage_key)
  WHERE storage_key IS NOT NULL;

CREATE TABLE public.sales_agent_knowledge_asset_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_assets(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_versions(id) ON DELETE CASCADE,
  source_occurrence_id TEXT NOT NULL UNIQUE CHECK (source_occurrence_id ~ '^occ_[0-9a-f]{32}$'),
  source_packet_id TEXT NOT NULL CHECK (source_packet_id ~ '^visual_[0-9a-f]{32}$'),
  source_node_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_locator JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_locator) = 'object'),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  role TEXT NOT NULL DEFAULT 'ILLUSTRATION'
    CHECK (role IN ('ILLUSTRATION', 'DIAGRAM', 'SCREENSHOT', 'WARNING', 'INLINE_MARKER', 'DECORATIVE')),
  context_text TEXT CHECK (context_text IS NULL OR char_length(context_text) <= 2000),
  relation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(relation_metadata) = 'object'),
  retrieval_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_knowledge_asset_occurrence UNIQUE (version_id, source_node_id, ordinal)
);

CREATE TABLE public.sales_agent_knowledge_asset_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.sales_agent_knowledge_assets(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  status TEXT NOT NULL DEFAULT 'AI_DRAFT'
    CHECK (status IN ('AI_DRAFT', 'APPROVED', 'REJECTED', 'IGNORED', 'STALE')),
  decision TEXT NOT NULL DEFAULT 'ANNOTATE'
    CHECK (decision IN ('ANNOTATE', 'DECORATIVE', 'UNREADABLE', 'NEEDS_REVIEW')),
  image_type TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (image_type IN ('DIAGRAM', 'PROCEDURE_STEP', 'SCREENSHOT', 'WARNING', 'CONTROL_LOCATION', 'TABLE_LEGEND', 'ICON_MARKER', 'PHOTO', 'OTHER')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 800),
  keywords TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(keywords) <= 12),
  visible_text TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(visible_text) <= 24),
  relations JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(relations) = 'array' AND jsonb_array_length(relations) <= 24),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  retrieval_recommendation TEXT NOT NULL DEFAULT 'REVIEW'
    CHECK (retrieval_recommendation IN ('INCLUDE', 'EXCLUDE', 'REVIEW')),
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

ALTER TABLE public.sales_agent_knowledge_assets
  ADD CONSTRAINT fk_knowledge_asset_active_annotation
  FOREIGN KEY (active_annotation_id)
  REFERENCES public.sales_agent_knowledge_asset_annotations(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_knowledge_asset_annotation_tsv()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.tsv_content := setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
                     setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B') ||
                     setweight(to_tsvector('simple', array_to_string(coalesce(NEW.keywords, '{}'), ' ')), 'C');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_knowledge_asset_annotation_tsv
BEFORE INSERT OR UPDATE OF title, summary, keywords
ON public.sales_agent_knowledge_asset_annotations
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

CREATE TRIGGER trg_enforce_knowledge_asset_active_annotation
BEFORE INSERT OR UPDATE OF active_annotation_id, sha256
ON public.sales_agent_knowledge_assets
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
  SET status = 'STALE', reviewed_by = p_actor_id,
      reviewed_at = timezone('utc', now()), review_note = p_reason
  WHERE id = v_active_annotation_id AND status = 'APPROVED';
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'annotation_id', v_active_annotation_id
  );
END $$;

CREATE INDEX idx_knowledge_asset_occurrences_version_node
  ON public.sales_agent_knowledge_asset_occurrences (version_id, source_node_id);
CREATE INDEX idx_knowledge_asset_occurrences_asset
  ON public.sales_agent_knowledge_asset_occurrences (asset_id, retrieval_enabled);
CREATE INDEX idx_knowledge_asset_annotations_asset_status
  ON public.sales_agent_knowledge_asset_annotations (asset_id, status, revision_no DESC);
CREATE INDEX idx_knowledge_asset_annotations_tsv
  ON public.sales_agent_knowledge_asset_annotations USING gin (tsv_content)
  WHERE status = 'APPROVED';
CREATE INDEX idx_knowledge_asset_annotations_embedding_hnsw
  ON public.sales_agent_knowledge_asset_annotations USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND status = 'APPROVED';

CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_visuals(
  p_query TEXT,
  p_version_ids UUID[],
  p_source_node_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_section_anchors TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_limit INTEGER DEFAULT 6
) RETURNS TABLE (
  asset_id UUID,
  annotation_id UUID,
  version_id UUID,
  source_node_id TEXT,
  section_anchor TEXT,
  source_url TEXT,
  title TEXT,
  summary TEXT,
  image_type TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  safety_critical BOOLEAN,
  ordinal INTEGER
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
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
        ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
      END AS text_rank,
      row_number() OVER (
        PARTITION BY asset.id
        ORDER BY
          CASE
            WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
            ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
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
    candidates.asset_id,
    candidates.annotation_id,
    candidates.version_id,
    candidates.source_node_id,
    candidates.section_anchor,
    candidates.source_url,
    candidates.title,
    candidates.summary,
    candidates.image_type,
    candidates.mime_type,
    candidates.width,
    candidates.height,
    candidates.safety_critical,
    candidates.ordinal
  FROM candidates
  WHERE candidates.asset_rank = 1
  ORDER BY candidates.text_rank DESC,
           candidates.safety_critical DESC,
           candidates.ordinal,
           candidates.asset_id
  LIMIT LEAST(GREATEST(p_limit, 1), 6);
$$;

ALTER TABLE public.sales_agent_knowledge_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_asset_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_knowledge_asset_annotations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sales_agent_knowledge_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_agent_knowledge_asset_occurrences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_agent_knowledge_asset_annotations FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_agent_knowledge_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_agent_knowledge_asset_occurrences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_agent_knowledge_asset_annotations TO service_role;

CREATE POLICY "Service role full access on knowledge_assets"
  ON public.sales_agent_knowledge_assets FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on knowledge_asset_occurrences"
  ON public.sales_agent_knowledge_asset_occurrences FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on knowledge_asset_annotations"
  ON public.sales_agent_knowledge_asset_annotations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER) TO service_role;
