-- Migration 068: Deterministic Target URLs and Pointer Mapping for Knowledge Documents and Chunks
-- Adds target_url to documents, versions, and chunks, and populates verified deterministic links.

-- 1. Add target_url columns
ALTER TABLE public.sales_agent_knowledge_documents
    ADD COLUMN IF NOT EXISTS target_url TEXT;

ALTER TABLE public.sales_agent_knowledge_versions
    ADD COLUMN IF NOT EXISTS target_url TEXT;

ALTER TABLE public.sales_agent_knowledge_chunks
    ADD COLUMN IF NOT EXISTS target_url TEXT;

-- 2. Populate deterministic target_url for General Policies & Services
UPDATE public.sales_agent_knowledge_documents
SET target_url = '/after-sales'
WHERE document_key IN (
    'chinh-sach-bao-hanh-xe-dien-vinfast',
    'chinh-sach-bao-hanh-pin-xe-may-dien-vinfast',
    'chinh-sach-thue-pin-va-he-thong-tram-sac'
);

UPDATE public.sales_agent_knowledge_documents
SET target_url = '/deposit'
WHERE document_key = 'quy-trinh-dat-coc-va-nhan-xe-fastlane';

UPDATE public.sales_agent_knowledge_documents
SET target_url = '/cost-estimator'
WHERE document_key = 'chinh-sach-tra-gop-va-uu-dai-tai-chinh';

-- 3. Populate deterministic target_url for VinFast Owner Manuals (Document level)
-- ONLY map models that actually exist in manual_models to prevent 404s
UPDATE public.sales_agent_knowledge_documents d
SET target_url = '/user-manual/' || replace(d.vehicle_model || '_' || d.model_year::text, ' ', '%20')
FROM public.manual_models m
WHERE d.source_kind = 'VINFAST_OWNER_MANUAL'
  AND (d.vehicle_model || '_' || d.model_year::text) = m.id;

-- Clear target_url for non-existent models (e.g. Lac Hong, VF e34, zzed 1000) so they safely use /knowledge/source/...
UPDATE public.sales_agent_knowledge_documents
SET target_url = NULL
WHERE source_kind = 'VINFAST_OWNER_MANUAL'
  AND (vehicle_model || '_' || model_year::text) NOT IN (SELECT id FROM public.manual_models);

-- 4. Sync target_url to versions
UPDATE public.sales_agent_knowledge_versions v
SET target_url = d.target_url
FROM public.sales_agent_knowledge_documents d
WHERE v.document_id = d.id;

-- 5. Populate deterministic target_url for Chunks
-- 5a. For Chunks with specific source_node_id matching an actual manual_article
UPDATE public.sales_agent_knowledge_chunks c
SET target_url = '/user-manual/' || replace(d.vehicle_model || '_' || d.model_year::text, ' ', '%20') || '/' || replace(d.vehicle_model || '_' || d.model_year::text || '_' || c.source_node_id, ' ', '%20')
FROM public.sales_agent_knowledge_documents d
JOIN public.manual_models m ON (d.vehicle_model || '_' || d.model_year::text) = m.id
WHERE c.document_id = d.id
  AND d.source_kind = 'VINFAST_OWNER_MANUAL'
  AND c.source_node_id IS NOT NULL;

-- 5b. For Chunks without specific source_node_id or non-manual docs (inherit document target_url)
UPDATE public.sales_agent_knowledge_chunks c
SET target_url = d.target_url
FROM public.sales_agent_knowledge_documents d
WHERE c.document_id = d.id
  AND (c.source_node_id IS NULL OR d.source_kind != 'VINFAST_OWNER_MANUAL');

-- 5c. Clear target_url on chunks where document target_url is NULL
UPDATE public.sales_agent_knowledge_chunks c
SET target_url = NULL
FROM public.sales_agent_knowledge_documents d
WHERE c.document_id = d.id
  AND d.target_url IS NULL;
