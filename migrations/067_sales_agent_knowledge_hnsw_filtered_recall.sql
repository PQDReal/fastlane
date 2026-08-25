-- The HNSW core from migration 066 uses a bounded global candidate set.
-- Pgvector's default fixed scan may stop before enough rows survive document
-- scope filters. This wrapper enables bounded iterative scanning for the
-- transaction before delegating to that core query.

CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_vector_hnsw_filtered(
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
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM set_config('hnsw.iterative_scan', 'strict_order', true);
    PERFORM set_config('hnsw.ef_search', '100', true);
    PERFORM set_config('hnsw.max_scan_tuples', '20000', true);

    RETURN QUERY
    SELECT core.*
    FROM public.sales_agent_search_knowledge_vector_hnsw(
        p_query_embedding,
        p_index_generation_id,
        p_limit,
        p_candidate_limit,
        p_vehicle_model,
        p_vehicle_type,
        p_model_year,
        p_customer_segment,
        p_category,
        p_market,
        p_locale,
        p_effective_at
    ) AS core;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_agent_search_knowledge_vector_hnsw_filtered(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_vector_hnsw_filtered(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;
