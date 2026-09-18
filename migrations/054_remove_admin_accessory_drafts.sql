-- Accessory authoring is intentionally session-scoped. Incomplete product data
-- must not be retained as server-side drafts; the canonical products tables are
-- written only after the publish validation succeeds.
drop table if exists public.admin_accessory_drafts;
