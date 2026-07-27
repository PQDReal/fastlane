begin;

-- Supabase's default table grants gave anon and authenticated every table
-- privilege when migration 003 created these relations. The catalog is
-- public-read-only; all normalized catalog mutations run through the
-- service-role importer. Reset the public API roles to SELECT only.
revoke all privileges on table
  public.product_option_groups,
  public.product_option_values,
  public.product_variant_option_values,
  public.product_media
from anon, authenticated;

grant select on table
  public.product_option_groups,
  public.product_option_values,
  public.product_variant_option_values,
  public.product_media
to anon, authenticated;

-- Preserve importer/backup access even if an environment did not inherit the
-- usual Supabase service-role defaults.
grant all privileges on table
  public.product_option_groups,
  public.product_option_values,
  public.product_variant_option_values,
  public.product_media
to service_role;

commit;

-- Rollback guidance (review before use): broad anon/authenticated grants are
-- intentionally not restored automatically. Row-level security filters DML,
-- but does not protect TRUNCATE. If a reviewed legacy consumer genuinely
-- requires the previous grants, restore them explicitly as one transaction
-- only after defining appropriate policies and accepting the TRUNCATE risk:
--
-- begin;
-- grant insert, update, delete, truncate, references, trigger on table
--   public.product_option_groups,
--   public.product_option_values,
--   public.product_variant_option_values,
--   public.product_media
-- to anon, authenticated;
-- commit;
