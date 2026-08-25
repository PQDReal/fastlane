-- Optimize the two live retrieval hot paths without removing the previous
-- RPCs. Keeping the old contracts available makes rollout and rollback safe.

CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_vector_hnsw(
    p_query_embedding vector(512),
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1',
    p_limit INTEGER DEFAULT 20,
    p_candidate_limit INTEGER DEFAULT NULL,
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
    WITH limits AS MATERIALIZED (
        SELECT
            LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100) AS result_limit,
            LEAST(
                GREATEST(
                    COALESCE(
                        p_candidate_limit,
                        GREATEST(COALESCE(p_limit, 20) * 20, 100)
                    ),
                    COALESCE(p_limit, 20),
                    100
                ),
                2000
            ) AS candidate_limit
    ),
    knn AS MATERIALIZED (
        SELECT
            c.id,
            c.version_id,
            (c.embedding <=> p_query_embedding)::DOUBLE PRECISION AS distance
        FROM public.sales_agent_knowledge_chunks c
        WHERE c.embedding IS NOT NULL
          AND c.index_generation_id = p_index_generation_id
          AND c.is_active
        ORDER BY c.embedding <=> p_query_embedding, c.id
        LIMIT (SELECT candidate_limit FROM limits)
    )
    SELECT c.id, d.id, d.document_key, v.id, v.version_no, c.index_generation_id,
           c.chunk_level, c.hierarchy_path, c.section_anchor, c.section_title, c.content,
           c.content_hash, c.token_count, c.chunk_index, c.tags,
           jsonb_build_array(jsonb_build_object(
               'vehicleModel', d.vehicle_model, 'vehicleType', d.vehicle_type,
               'modelYearFrom', d.model_year, 'modelYearTo', d.model_year,
               'market', d.market, 'customerSegment', d.customer_segment
           )), c.source_node_id, c.image_refs, d.title, d.slug, d.category,
           v.effective_from, v.effective_to, v.publication_status, v.index_status,
           (1 - knn.distance)::DOUBLE PRECISION
    FROM knn
    JOIN public.sales_agent_knowledge_chunks c ON c.id = knn.id
    JOIN public.sales_agent_knowledge_versions v ON v.id = knn.version_id
    JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id AND d.active_version_id = v.id
    JOIN public.sales_agent_knowledge_index_generations g ON g.id = c.index_generation_id AND g.is_active
    WHERE d.lifecycle_status = 'ACTIVE' AND d.deleted_at IS NULL
      AND v.publication_status = 'PUBLISHED' AND v.index_status = 'READY'
      AND v.effective_from <= p_effective_at AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
      AND d.locale = p_locale AND d.market = p_market
      AND (p_category IS NULL OR d.category = p_category)
      AND (p_vehicle_model IS NULL OR d.vehicle_model IS NULL OR replace(lower(d.vehicle_model), ' ', '') = replace(lower(p_vehicle_model), ' ', ''))
      AND (p_vehicle_type IS NULL OR p_vehicle_type = 'ALL' OR d.vehicle_type = 'ALL' OR d.vehicle_type = p_vehicle_type)
      AND (p_model_year IS NULL OR d.model_year IS NULL OR d.model_year = p_model_year)
      AND (p_customer_segment = 'ALL' OR d.customer_segment = 'ALL' OR d.customer_segment = p_customer_segment)
    ORDER BY knn.distance, c.id
    LIMIT (SELECT result_limit FROM limits);
$$;

CREATE OR REPLACE FUNCTION public.sales_agent_load_knowledge_hierarchy_targets(
    p_chunk_ids UUID[],
    p_index_generation_id TEXT DEFAULT 'openai-text-embedding-3-small-512-v1',
    p_effective_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    p_max_neighbors INTEGER DEFAULT 1
) RETURNS TABLE (
    id UUID, document_id UUID, document_key TEXT, version_id UUID, version_no INTEGER,
    index_generation_id TEXT, chunk_level SMALLINT, hierarchy_path TEXT, section_anchor TEXT,
    section_title TEXT, content TEXT, content_hash TEXT, token_count INTEGER, chunk_ordinal INTEGER,
    tags TEXT[], scope_metadata JSONB, source_node_id TEXT, image_refs JSONB, title TEXT, slug TEXT,
    category TEXT, effective_from TIMESTAMPTZ, effective_to TIMESTAMPTZ,
    publication_status TEXT, index_status TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH params AS MATERIALIZED (
        SELECT LEAST(GREATEST(COALESCE(p_max_neighbors, 1), 0), 5) AS max_neighbors
    ),
    selected_ids AS MATERIALIZED (
        SELECT DISTINCT unnest(COALESCE(p_chunk_ids, ARRAY[]::UUID[])) AS id
    ),
    selected_versions AS MATERIALIZED (
        SELECT DISTINCT c.version_id
        FROM public.sales_agent_knowledge_chunks c
        JOIN selected_ids selected ON selected.id = c.id
        WHERE c.index_generation_id = p_index_generation_id
          AND c.is_active
    ),
    eligible AS MATERIALIZED (
        SELECT c.id, d.id AS document_id, d.document_key, v.id AS version_id, v.version_no,
               c.index_generation_id, c.chunk_level, c.hierarchy_path, c.section_anchor,
               c.section_title, c.content, c.content_hash, c.token_count, c.chunk_index,
               c.tags, jsonb_build_array(jsonb_build_object(
                   'vehicleModel', d.vehicle_model, 'vehicleType', d.vehicle_type,
                   'modelYearFrom', d.model_year, 'modelYearTo', d.model_year,
                   'market', d.market, 'customerSegment', d.customer_segment
               )) AS scope_metadata,
               c.source_node_id, c.image_refs, d.title, d.slug, d.category,
               v.effective_from, v.effective_to, v.publication_status, v.index_status
        FROM public.sales_agent_knowledge_chunks c
        JOIN selected_versions selected_version ON selected_version.version_id = c.version_id
        JOIN public.sales_agent_knowledge_versions v ON v.id = c.version_id
        JOIN public.sales_agent_knowledge_documents d ON d.id = v.document_id AND d.active_version_id = v.id
        JOIN public.sales_agent_knowledge_index_generations g ON g.id = c.index_generation_id AND g.is_active
        WHERE c.index_generation_id = p_index_generation_id
          AND c.is_active
          AND d.lifecycle_status = 'ACTIVE'
          AND d.deleted_at IS NULL
          AND v.publication_status = 'PUBLISHED'
          AND v.index_status = 'READY'
          AND v.effective_from <= p_effective_at
          AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
    ),
    selected AS MATERIALIZED (
        SELECT eligible.*
        FROM eligible
        JOIN selected_ids ON selected_ids.id = eligible.id
    ),
    parent_candidates AS MATERIALIZED (
        SELECT parent.id,
               row_number() OVER (
                   PARTITION BY selected.id
                   ORDER BY parent.chunk_level DESC, parent.chunk_index, parent.id
               ) AS parent_rank
        FROM selected
        JOIN eligible parent
          ON parent.version_id = selected.version_id
         AND parent.id <> selected.id
         AND parent.chunk_level < selected.chunk_level
         AND selected.hierarchy_path LIKE parent.hierarchy_path || '/%'
    ),
    procedure_hits AS MATERIALIZED (
        SELECT selected.*
        FROM selected
        WHERE lower(COALESCE(selected.section_anchor, '')) LIKE '%step%'
           OR lower(selected.content) LIKE '%bước%'
    ),
    neighbor_candidates AS MATERIALIZED (
        SELECT neighbor.id,
               row_number() OVER (
                   PARTITION BY procedure_hit.id
                   ORDER BY abs(neighbor.chunk_index - procedure_hit.chunk_index), neighbor.chunk_index, neighbor.id
               ) AS neighbor_rank
        FROM procedure_hits procedure_hit
        JOIN eligible neighbor
          ON neighbor.version_id = procedure_hit.version_id
         AND neighbor.id <> procedure_hit.id
         AND neighbor.chunk_level = procedure_hit.chunk_level
         AND regexp_replace(lower(neighbor.hierarchy_path), '/leaf(?:_|-)[^/]+$', '') =
             regexp_replace(lower(procedure_hit.hierarchy_path), '/leaf(?:_|-)[^/]+$', '')
         AND abs(neighbor.chunk_index - procedure_hit.chunk_index) = 1
    ),
    target_ids AS MATERIALIZED (
        SELECT id FROM selected
        UNION
        SELECT id FROM parent_candidates WHERE parent_rank = 1
        UNION
        SELECT neighbor_candidates.id
        FROM neighbor_candidates, params
        WHERE neighbor_candidates.neighbor_rank <= params.max_neighbors
    )
    SELECT eligible.id, eligible.document_id, eligible.document_key, eligible.version_id,
           eligible.version_no, eligible.index_generation_id, eligible.chunk_level,
           eligible.hierarchy_path, eligible.section_anchor, eligible.section_title,
           eligible.content, eligible.content_hash, eligible.token_count,
           eligible.chunk_index, eligible.tags, eligible.scope_metadata,
           eligible.source_node_id, eligible.image_refs, eligible.title, eligible.slug,
           eligible.category, eligible.effective_from, eligible.effective_to,
           eligible.publication_status, eligible.index_status
    FROM eligible
    JOIN target_ids ON target_ids.id = eligible.id
    ORDER BY eligible.version_id, eligible.chunk_index, eligible.id;
$$;

REVOKE ALL ON FUNCTION public.sales_agent_search_knowledge_vector_hnsw(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector_hnsw(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.sales_agent_load_knowledge_hierarchy_targets(
    UUID[], TEXT, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_agent_load_knowledge_hierarchy_targets(
    UUID[], TEXT, TIMESTAMPTZ, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.sales_agent_search_knowledge_vector_hnsw(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) IS 'HNSW-first vector candidate retrieval with bounded overfetch before lifecycle and scope filtering.';

COMMENT ON FUNCTION public.sales_agent_load_knowledge_hierarchy_targets(
    UUID[], TEXT, TIMESTAMPTZ, INTEGER
) IS 'Loads only selected chunks plus closest parents and adjacent procedure neighbors.';
