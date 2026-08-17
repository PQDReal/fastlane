begin;

-- Cover the referencing columns of the composite catalog foreign keys. These
-- indexes support both catalog reads and the row lookups PostgreSQL performs
-- when a referenced variant, option group, or option value changes.
create index if not exists product_variant_option_values_product_variant_idx
  on public.product_variant_option_values (product_id, variant_id);

create index if not exists product_variant_option_values_product_group_value_idx
  on public.product_variant_option_values (
    product_id,
    option_group_id,
    option_value_id
  );

create index if not exists product_media_product_variant_idx
  on public.product_media (product_id, variant_id);

create index if not exists product_media_product_option_value_idx
  on public.product_media (product_id, option_value_id);

-- Migration 003 added these checks as NOT VALID so new writes were protected
-- immediately. Fail with actionable counts before asking PostgreSQL to scan
-- and validate the existing rows.
do $catalog_hardening$
declare
  v_negative_deposits bigint;
  v_invalid_variant_metadata bigint;
  v_invalid_option_snapshots bigint;
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_variants_deposit_nonnegative'
       and conrelid = 'public.product_variants'::regclass
       and contype = 'c'
  ) then
    raise exception using
      errcode = '42704',
      message = 'Missing constraint product_variants_deposit_nonnegative; apply migration 003 first.';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'product_variants_metadata_object'
       and conrelid = 'public.product_variants'::regclass
       and contype = 'c'
  ) then
    raise exception using
      errcode = '42704',
      message = 'Missing constraint product_variants_metadata_object; apply migration 003 first.';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'order_items_selected_options_array'
       and conrelid = 'public.order_items'::regclass
       and contype = 'c'
  ) then
    raise exception using
      errcode = '42704',
      message = 'Missing constraint order_items_selected_options_array; apply migration 003 first.';
  end if;

  select count(*)
    into v_negative_deposits
    from public.product_variants
   where deposit_amount < 0;

  select count(*)
    into v_invalid_variant_metadata
    from public.product_variants
   where jsonb_typeof(metadata) is distinct from 'object';

  select count(*)
    into v_invalid_option_snapshots
    from public.order_items
   where jsonb_typeof(selected_options_snapshot) is distinct from 'array';

  if v_negative_deposits > 0
     or v_invalid_variant_metadata > 0
     or v_invalid_option_snapshots > 0 then
    raise exception using
      errcode = '23514',
      message = 'Catalog hardening preflight failed.',
      detail = format(
        'negative deposits=%s, invalid variant metadata=%s, invalid order option snapshots=%s',
        v_negative_deposits,
        v_invalid_variant_metadata,
        v_invalid_option_snapshots
      ),
      hint = 'Repair the invalid rows, then rerun migration 004.';
  end if;
end
$catalog_hardening$;

alter table public.product_variants
  validate constraint product_variants_deposit_nonnegative;

alter table public.product_variants
  validate constraint product_variants_metadata_object;

alter table public.order_items
  validate constraint order_items_selected_options_array;

commit;

-- Rollback (review before use):
-- Validation is intentionally retained because unvalidating a check requires
-- dropping and recreating it. Only the additive indexes can be rolled back
-- without weakening data integrity.
-- begin;
-- drop index if exists public.product_media_product_option_value_idx;
-- drop index if exists public.product_media_product_variant_idx;
-- drop index if exists public.product_variant_option_values_product_group_value_idx;
-- drop index if exists public.product_variant_option_values_product_variant_idx;
-- commit;
