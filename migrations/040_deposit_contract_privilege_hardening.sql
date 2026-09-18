-- Migration 040: enforce least-privilege access for deposit contract evidence.
-- Supabase default grants can leave service_role with DELETE/TRUNCATE even after
-- narrower grants are added, so revoke first and grant back only runtime needs.

begin;

revoke all on table public.deposit_order_documents
  from public, anon, authenticated, service_role;
revoke all on table public.deposit_order_events
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.deposit_order_documents
  to service_role;
grant select, insert on table public.deposit_order_events
  to service_role;

commit;
