-- Full-text search indexes used by the public and assistant product search APIs.
-- Safe to run repeatedly in Supabase SQL Editor.
create index if not exists products_search_vector_gin_idx
  on public.products using gin (search_vector);

create index if not exists products_active_type_price_idx
  on public.products (product_type, displayed_price)
  where is_active = true;

create index if not exists products_active_slug_idx
  on public.products (slug)
  where is_active = true;
