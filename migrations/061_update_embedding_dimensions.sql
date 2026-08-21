-- 061_update_embedding_dimensions.sql

-- 1. Drop existing functions and indexes that depend on the column
DROP FUNCTION IF EXISTS public.match_manual_chunks(vector(1536), float, int, text, text);
DROP INDEX IF EXISTS public.idx_manual_article_chunks_embedding;

-- 2. Empty the table to safely alter the column type since dimensions are shrinking
-- (Since we can't easily cast 1536-dim vectors to 512-dim vectors, we'll truncate it and let the sync script re-populate)
TRUNCATE TABLE public.manual_article_chunks;

-- 3. Alter the column to 512 dimensions
ALTER TABLE public.manual_article_chunks 
ALTER COLUMN embedding TYPE vector(512);

-- 4. Recreate the HNSW index for the new dimension
CREATE INDEX IF NOT EXISTS idx_manual_article_chunks_embedding 
ON public.manual_article_chunks USING hnsw (embedding vector_cosine_ops);

-- 5. Recreate the RPC function for 512 dimensions
CREATE OR REPLACE FUNCTION public.match_manual_chunks(
    query_embedding vector(512),
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
