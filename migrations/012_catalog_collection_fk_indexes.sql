begin;

-- Cover both composite membership foreign keys using the referenced-column
-- order reported by PostgreSQL/Supabase advisors. The partial product and
-- collection lookup indexes from migration 011 remain useful for active-row
-- storefront reads, but cannot cover FK maintenance because they omit the
-- leading root_category_id column and exclude inactive rows.
create index product_collection_memberships_root_product_idx
  on public.product_collection_memberships (root_category_id, product_id);

create index product_collection_memberships_root_collection_idx
  on public.product_collection_memberships (root_category_id, collection_id);

commit;

-- Rollback:
-- begin;
-- drop index if exists public.product_collection_memberships_root_collection_idx;
-- drop index if exists public.product_collection_memberships_root_product_idx;
-- commit;
