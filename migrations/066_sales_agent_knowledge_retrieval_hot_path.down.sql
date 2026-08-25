DROP FUNCTION IF EXISTS public.sales_agent_load_knowledge_hierarchy_targets(
    UUID[], TEXT, TIMESTAMPTZ, INTEGER
);

DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_vector_hnsw(
    vector, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
);
