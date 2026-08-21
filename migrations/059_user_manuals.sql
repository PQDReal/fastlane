-- 059_user_manuals.sql

CREATE TABLE IF NOT EXISTS public.manual_models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    model_series TEXT NOT NULL,
    year TEXT NOT NULL,
    thumbnail TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.manual_articles (
    id TEXT PRIMARY KEY,
    original_id INTEGER,
    model_id TEXT NOT NULL REFERENCES public.manual_models(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES public.manual_articles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    content_html TEXT,
    content_text TEXT,
    thumbnail TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_manual_articles_model_id ON public.manual_articles(model_id);
CREATE INDEX IF NOT EXISTS idx_manual_articles_parent_id ON public.manual_articles(parent_id);

-- RLS
ALTER TABLE public.manual_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to manual_models"
    ON public.manual_models FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to manual_articles"
    ON public.manual_articles FOR SELECT
    USING (true);
