-- 060_user_manual_embeddings.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.manual_article_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id TEXT NOT NULL REFERENCES public.manual_articles(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    section_title TEXT,
    content TEXT NOT NULL,
    image_url TEXT,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_manual_article_chunks_article_id ON public.manual_article_chunks(article_id);
-- HNSW index for fast vector similarity search. Note: m and ef_construction are parameters that can be tuned.
CREATE INDEX IF NOT EXISTS idx_manual_article_chunks_embedding ON public.manual_article_chunks USING hnsw (embedding vector_cosine_ops);

-- RLS
ALTER TABLE public.manual_article_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to manual_article_chunks"
    ON public.manual_article_chunks FOR SELECT
    USING (true);

-- RPC for vector similarity search
CREATE OR REPLACE FUNCTION match_manual_chunks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_model_series text DEFAULT null,
    filter_year text DEFAULT null
)
RETURNS TABLE (
    chunk_id uuid,
    article_id text,
    article_title text,
    section_title text,
    content text,
    image_url text,
    similarity float
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.id as chunk_id,
        c.article_id,
        a.title as article_title,
        c.section_title,
        c.content,
        c.image_url,
        1 - (c.embedding <=> query_embedding) as similarity
    FROM public.manual_article_chunks c
    JOIN public.manual_articles a ON c.article_id = a.id
    JOIN public.manual_models m ON a.model_id = m.id
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
      AND (filter_model_series IS NULL OR m.model_series = filter_model_series)
      AND (filter_year IS NULL OR m.year = filter_year)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
