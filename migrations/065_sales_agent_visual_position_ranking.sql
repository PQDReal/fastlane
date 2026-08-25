-- Keep visual lookup anchored to the ordered evidence supplied by the runtime.
-- Position is only a tie-breaker inside that evidence; a low image ordinal in
-- an unrelated section must never outrank an image attached to the answer.

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
      COALESCE(
        array_position(
          COALESCE(p_section_anchors, ARRAY[]::TEXT[]),
          occurrence.source_locator ->> 'sectionAnchor'
        ),
        100000 + array_position(
          COALESCE(p_source_node_ids, ARRAY[]::TEXT[]),
          occurrence.source_node_id
        ),
        2147483647
      ) AS evidence_rank,
      CASE
        WHEN occurrence.source_locator ->> 'blockOrdinal' ~ '^[0-9]+$'
          THEN (occurrence.source_locator ->> 'blockOrdinal')::INTEGER
        ELSE 2147483647
      END AS block_ordinal,
      CASE
        WHEN occurrence.source_locator ->> 'imageOrdinalInBlock' ~ '^[0-9]+$'
          THEN (occurrence.source_locator ->> 'imageOrdinalInBlock')::INTEGER
        ELSE occurrence.ordinal
      END AS image_ordinal_in_block,
      CASE
        WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
        ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
      END AS text_rank,
      row_number() OVER (
        PARTITION BY asset.id
        ORDER BY
          CASE
            WHEN annotation.image_type IN ('DIAGRAM', 'CONTROL_LOCATION', 'SCHEMATIC') THEN 0
            WHEN annotation.image_type IN ('SCREENSHOT', 'PHOTO') THEN 1
            ELSE 2
          END,
          COALESCE(
            array_position(
              COALESCE(p_section_anchors, ARRAY[]::TEXT[]),
              occurrence.source_locator ->> 'sectionAnchor'
            ),
            100000 + array_position(
              COALESCE(p_source_node_ids, ARRAY[]::TEXT[]),
              occurrence.source_node_id
            ),
            2147483647
          ),
          CASE
            WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
            ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
          END DESC,
          CASE
            WHEN occurrence.source_locator ->> 'blockOrdinal' ~ '^[0-9]+$'
              THEN (occurrence.source_locator ->> 'blockOrdinal')::INTEGER
            ELSE 2147483647
          END,
          CASE
            WHEN occurrence.source_locator ->> 'imageOrdinalInBlock' ~ '^[0-9]+$'
              THEN (occurrence.source_locator ->> 'imageOrdinalInBlock')::INTEGER
            ELSE occurrence.ordinal
          END,
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
  ORDER BY CASE
             WHEN candidates.image_type IN ('DIAGRAM', 'CONTROL_LOCATION', 'SCHEMATIC') THEN 0
             WHEN candidates.image_type IN ('SCREENSHOT', 'PHOTO') THEN 1
             ELSE 2
           END,
           candidates.evidence_rank,
           candidates.text_rank DESC,
           candidates.block_ordinal,
           candidates.image_ordinal_in_block,
           candidates.ordinal,
           candidates.asset_id
  LIMIT LEAST(GREATEST(p_limit, 1), 6);
$$;

CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_visuals_with_drafts(
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
      COALESCE(
        array_position(
          COALESCE(p_section_anchors, ARRAY[]::TEXT[]),
          occurrence.source_locator ->> 'sectionAnchor'
        ),
        100000 + array_position(
          COALESCE(p_source_node_ids, ARRAY[]::TEXT[]),
          occurrence.source_node_id
        ),
        2147483647
      ) AS evidence_rank,
      CASE
        WHEN occurrence.source_locator ->> 'blockOrdinal' ~ '^[0-9]+$'
          THEN (occurrence.source_locator ->> 'blockOrdinal')::INTEGER
        ELSE 2147483647
      END AS block_ordinal,
      CASE
        WHEN occurrence.source_locator ->> 'imageOrdinalInBlock' ~ '^[0-9]+$'
          THEN (occurrence.source_locator ->> 'imageOrdinalInBlock')::INTEGER
        ELSE occurrence.ordinal
      END AS image_ordinal_in_block,
      CASE
        WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
        ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
      END AS text_rank,
      row_number() OVER (
        PARTITION BY asset.id
        ORDER BY
          CASE
            WHEN annotation.image_type IN ('DIAGRAM', 'CONTROL_LOCATION', 'SCHEMATIC') THEN 0
            WHEN annotation.image_type IN ('SCREENSHOT', 'PHOTO') THEN 1
            ELSE 2
          END,
          COALESCE(
            array_position(
              COALESCE(p_section_anchors, ARRAY[]::TEXT[]),
              occurrence.source_locator ->> 'sectionAnchor'
            ),
            100000 + array_position(
              COALESCE(p_source_node_ids, ARRAY[]::TEXT[]),
              occurrence.source_node_id
            ),
            2147483647
          ),
          CASE
            WHEN btrim(COALESCE(p_query, '')) = '' THEN 0::REAL
            ELSE ts_rank_cd(annotation.tsv_content, websearch_to_tsquery('simple', p_query))
          END DESC,
          CASE
            WHEN occurrence.source_locator ->> 'blockOrdinal' ~ '^[0-9]+$'
              THEN (occurrence.source_locator ->> 'blockOrdinal')::INTEGER
            ELSE 2147483647
          END,
          CASE
            WHEN occurrence.source_locator ->> 'imageOrdinalInBlock' ~ '^[0-9]+$'
              THEN (occurrence.source_locator ->> 'imageOrdinalInBlock')::INTEGER
            ELSE occurrence.ordinal
          END,
          occurrence.ordinal,
          occurrence.id
      ) AS asset_rank
    FROM public.sales_agent_knowledge_asset_occurrences occurrence
    JOIN public.sales_agent_knowledge_assets asset
      ON asset.id = occurrence.asset_id
    JOIN LATERAL (
      SELECT candidate.*
      FROM public.sales_agent_knowledge_asset_annotations candidate
      WHERE candidate.asset_id = asset.id
        AND (
          (candidate.status = 'APPROVED' AND candidate.id = asset.active_annotation_id)
          OR candidate.status = 'AI_DRAFT'
        )
      ORDER BY
        CASE WHEN candidate.id = asset.active_annotation_id THEN 0 ELSE 1 END,
        candidate.revision_no DESC,
        candidate.created_at DESC,
        candidate.id
      LIMIT 1
    ) annotation ON TRUE
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
  ORDER BY CASE
             WHEN candidates.image_type IN ('DIAGRAM', 'CONTROL_LOCATION', 'SCHEMATIC') THEN 0
             WHEN candidates.image_type IN ('SCREENSHOT', 'PHOTO') THEN 1
             ELSE 2
           END,
           candidates.evidence_rank,
           candidates.text_rank DESC,
           candidates.block_ordinal,
           candidates.image_ordinal_in_block,
           candidates.ordinal,
           candidates.asset_id
  LIMIT LEAST(GREATEST(p_limit, 1), 6);
$$;

REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals_with_drafts(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals_with_drafts(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  TO service_role;
