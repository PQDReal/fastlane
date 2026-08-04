begin;

revoke all on sequence public.accessory_sku_sequence from public, anon, authenticated, service_role;
grant usage, select on sequence public.accessory_sku_sequence to service_role;

commit;
