begin;

-- Keep public.categories as the three top-level product groups. Source
-- taxonomy, vehicle collections, and their many-to-many memberships live in
-- separate relations so public/admin category contracts remain unchanged.

create table public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  slug text not null,
  name text not null,
  vehicle_kind text not null default 'CAR',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint vehicle_models_code_nonempty check (btrim(code) <> ''),
  constraint vehicle_models_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint vehicle_models_name_nonempty check (btrim(name) <> ''),
  constraint vehicle_models_kind_valid check (vehicle_kind in ('CAR', 'MOTORBIKE', 'OTHER')),
  constraint vehicle_models_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint vehicle_models_code_key unique (code),
  constraint vehicle_models_slug_key unique (slug)
);

create table public.catalog_collections (
  id uuid primary key default gen_random_uuid(),
  root_category_id uuid not null references public.categories(id) on delete restrict,
  parent_id uuid,
  vehicle_model_id uuid references public.vehicle_models(id) on delete restrict,
  kind text not null,
  source_system text not null,
  source_key text not null,
  slug text not null,
  name text not null,
  vehicle_filter_mode text not null default 'NONE',
  display_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint catalog_collections_kind_valid
    check (kind in ('CATEGORY', 'MODEL', 'CAMPAIGN')),
  constraint catalog_collections_source_system_nonempty
    check (btrim(source_system) <> ''),
  constraint catalog_collections_source_key_nonempty
    check (btrim(source_key) <> ''),
  constraint catalog_collections_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint catalog_collections_name_nonempty check (btrim(name) <> ''),
  constraint catalog_collections_vehicle_filter_mode_valid
    check (vehicle_filter_mode in ('NONE', 'COLLECTION_MEMBERSHIP', 'VERIFIED_FITMENT')),
  constraint catalog_collections_display_order_nonnegative check (display_order >= 0),
  constraint catalog_collections_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint catalog_collections_not_self_parent check (parent_id is null or parent_id <> id),
  constraint catalog_collections_model_reference_valid check (
    (kind = 'MODEL' and vehicle_model_id is not null and vehicle_filter_mode = 'COLLECTION_MEMBERSHIP')
    or (kind <> 'MODEL' and vehicle_model_id is null)
  ),
  constraint catalog_collections_source_identity_key unique (source_system, source_key),
  constraint catalog_collections_root_slug_key unique (root_category_id, slug),
  constraint catalog_collections_root_id_key unique (root_category_id, id),
  constraint catalog_collections_parent_same_root_fk
    foreign key (root_category_id, parent_id)
    references public.catalog_collections(root_category_id, id)
    on delete restrict
);

-- This composite identity lets memberships prove that both their product and
-- their collection belong to the same existing root category.
create unique index products_category_id_id_uidx
  on public.products (category_id, id);

create table public.product_collection_memberships (
  id uuid primary key default gen_random_uuid(),
  root_category_id uuid not null,
  product_id uuid not null,
  collection_id uuid not null,
  source_system text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint product_collection_memberships_source_nonempty
    check (btrim(source_system) <> ''),
  constraint product_collection_memberships_seen_order
    check (last_seen_at >= first_seen_at),
  constraint product_collection_memberships_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint product_collection_memberships_product_root_fk
    foreign key (root_category_id, product_id)
    references public.products(category_id, id)
    on delete cascade,
  constraint product_collection_memberships_collection_root_fk
    foreign key (root_category_id, collection_id)
    references public.catalog_collections(root_category_id, id)
    on delete restrict,
  constraint product_collection_memberships_identity_key
    unique (product_id, collection_id, source_system)
);

create index catalog_collections_root_parent_order_idx
  on public.catalog_collections (root_category_id, parent_id, display_order, name);

create index catalog_collections_vehicle_model_idx
  on public.catalog_collections (vehicle_model_id)
  where vehicle_model_id is not null;

create index product_collection_memberships_product_active_idx
  on public.product_collection_memberships (product_id, collection_id)
  where is_active;

create index product_collection_memberships_collection_active_idx
  on public.product_collection_memberships (collection_id, product_id)
  where is_active;

create unique index product_collection_memberships_one_primary_per_scope_uidx
  on public.product_collection_memberships (product_id, root_category_id, source_system)
  where is_active and is_primary;

create or replace function app_private.guard_catalog_collection_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using
      errcode = '23514',
      message = 'A catalog collection cannot be its own parent.';
  end if;

  if exists (
    with recursive ancestors as (
      select collection.id, collection.parent_id
        from public.catalog_collections collection
       where collection.id = new.parent_id
      union all
      select parent.id, parent.parent_id
        from public.catalog_collections parent
        join ancestors child on child.parent_id = parent.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Catalog collection hierarchy cannot contain a cycle.';
  end if;

  return new;
end;
$$;

create or replace function app_private.guard_primary_collection_membership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_collection_kind text;
begin
  if not new.is_primary then
    return new;
  end if;

  select collection.kind
    into v_collection_kind
    from public.catalog_collections collection
   where collection.id = new.collection_id
     and collection.root_category_id = new.root_category_id;

  if v_collection_kind is distinct from 'CATEGORY' then
    raise exception using
      errcode = '23514',
      message = 'Only CATEGORY memberships may be primary.';
  end if;

  return new;
end;
$$;

create trigger catalog_collections_guard_hierarchy
before insert or update of parent_id, root_category_id
on public.catalog_collections
for each row execute function app_private.guard_catalog_collection_hierarchy();

create trigger product_collection_memberships_guard_primary
before insert or update of collection_id, root_category_id, is_primary
on public.product_collection_memberships
for each row execute function app_private.guard_primary_collection_membership();

create trigger vehicle_models_touch_updated_at
before update on public.vehicle_models
for each row execute function app_private.touch_catalog_updated_at();

create trigger catalog_collections_touch_updated_at
before update on public.catalog_collections
for each row execute function app_private.touch_catalog_updated_at();

create trigger product_collection_memberships_touch_updated_at
before update on public.product_collection_memberships
for each row execute function app_private.touch_catalog_updated_at();

alter table public.vehicle_models enable row level security;
alter table public.catalog_collections enable row level security;
alter table public.product_collection_memberships enable row level security;

create policy vehicle_models_public_read
on public.vehicle_models
for select to anon, authenticated
using (is_active);

create policy catalog_collections_public_read
on public.catalog_collections
for select to anon, authenticated
using (
  is_active and exists (
    select 1
      from public.categories category
     where category.id = root_category_id
       and category.is_active
  )
);

create policy product_collection_memberships_public_read
on public.product_collection_memberships
for select to anon, authenticated
using (
  is_active
  and exists (
    select 1
      from public.products product
     where product.id = product_id
       and product.is_active
  )
  and exists (
    select 1
      from public.catalog_collections collection
     where collection.id = collection_id
       and collection.is_active
  )
);

revoke all privileges on table
  public.vehicle_models,
  public.catalog_collections,
  public.product_collection_memberships
from public, anon, authenticated;

grant select on table
  public.vehicle_models,
  public.catalog_collections,
  public.product_collection_memberships
to anon, authenticated;

grant all privileges on table
  public.vehicle_models,
  public.catalog_collections,
  public.product_collection_memberships
to service_role;

comment on column public.catalog_collections.vehicle_filter_mode is
  'NONE hides vehicle filtering; COLLECTION_MEMBERSHIP is source collection membership only; VERIFIED_FITMENT requires separately verified technical fitment.';

comment on table public.product_collection_memberships is
  'Source-provenanced taxonomy membership. A MODEL collection membership must not be presented as verified installation fitment.';

commit;

-- Rollback guidance (review before use): the app can fall back to legacy JSON
-- taxonomy because these tables are additive. Preserve rows for investigation
-- or export them before dropping the feature schema.
--
-- begin;
-- drop table if exists public.product_collection_memberships;
-- drop table if exists public.catalog_collections;
-- drop table if exists public.vehicle_models;
-- drop index if exists public.products_category_id_id_uidx;
-- drop function if exists app_private.guard_primary_collection_membership();
-- drop function if exists app_private.guard_catalog_collection_hierarchy();
-- commit;
