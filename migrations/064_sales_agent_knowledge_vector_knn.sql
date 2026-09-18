-- Keep the existing RPC contract; make the planner's filtered KNN path
-- explicit and add the small btree predicates used before HNSW ordering.
-- Benchmark with:
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.sales_agent_search_knowledge_vector(...);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_generation_active_embedding
  ON public.sales_agent_knowledge_chunks (index_generation_id, version_id, is_active)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_active_scope_lookup
  ON public.sales_agent_knowledge_documents
    (active_version_id, lifecycle_status, locale, market, category, vehicle_model, model_year)
  WHERE deleted_at IS NULL;

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
    JOIN public.sales_agent_knowledge_versions v
      ON v.id = c.version_id
    JOIN public.sales_agent_knowledge_documents d
      ON d.id = v.document_id
     AND d.active_version_id = v.id
    JOIN public.sales_agent_knowledge_index_generations g
      ON g.id = c.index_generation_id
     AND g.is_active
    WHERE c.embedding IS NOT NULL
      AND c.index_generation_id = p_index_generation_id
      AND c.is_active
      AND d.lifecycle_status = 'ACTIVE'
      AND d.deleted_at IS NULL
      AND v.publication_status = 'PUBLISHED'
      AND v.index_status = 'READY'
      AND v.effective_from <= p_effective_at
      AND (v.effective_to IS NULL OR v.effective_to > p_effective_at)
      AND d.locale = p_locale
      AND d.market = p_market
      AND (p_category IS NULL OR d.category = p_category)
      AND (p_vehicle_model IS NULL OR d.vehicle_model IS NULL
           OR replace(lower(d.vehicle_model), ' ', '') = replace(lower(p_vehicle_model), ' ', ''))
      AND (p_vehicle_type IS NULL OR p_vehicle_type = 'ALL'
           OR d.vehicle_type = 'ALL' OR d.vehicle_type = p_vehicle_type)
      AND (p_model_year IS NULL OR d.model_year IS NULL OR d.model_year = p_model_year)
      AND (p_customer_segment = 'ALL' OR d.customer_segment = 'ALL'
           OR d.customer_segment = p_customer_segment)
    -- This is deliberately the final operation over the already constrained
    -- active scope so pgvector can use idx_knowledge_chunks_embedding_hnsw.
    ORDER BY c.embedding <=> p_query_embedding, c.id
    LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector(vector, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
