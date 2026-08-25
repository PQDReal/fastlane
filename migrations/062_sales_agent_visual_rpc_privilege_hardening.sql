-- Supabase may retain direct function grants on API roles. Visual knowledge
-- SECURITY DEFINER RPCs are service-role-only regardless of PUBLIC defaults.

REVOKE EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sales_agent_review_knowledge_asset_annotation(UUID, TEXT, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_mark_knowledge_asset_stale(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_create_knowledge_asset_annotation_revision(UUID, TEXT, TEXT, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_bulk_review_knowledge_asset_annotations(UUID[], TEXT, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_agent_search_knowledge_visuals(TEXT, UUID[], TEXT[], TEXT[], INTEGER)
  TO service_role;
