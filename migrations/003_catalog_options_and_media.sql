begin;

-- Keep the public contract used by develop (`products`, `product_variants`,
-- and `variant_id`) while normalizing selectable options and media.

alter table public.product_variants
  add column if not exists option_signature text,
  add column if not exists deposit_amount numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.order_items
  add column if not exists selected_options_snapshot jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_deposit_nonnegative'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_deposit_nonnegative
      check (deposit_amount is null or deposit_amount >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_variants_metadata_object'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_metadata_object
      check (jsonb_typeof(metadata) = 'object') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_selected_options_array'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_selected_options_array
      check (jsonb_typeof(selected_options_snapshot) = 'array') not valid;
  end if;
end
$$;

create unique index if not exists product_variants_product_id_id_uidx
  on public.product_variants (product_id, id);

create unique index if not exists product_variants_option_signature_uidx
  on public.product_variants (product_id, option_signature)
  where option_signature is not null and is_active;

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  display_type text not null default 'BUTTON'
    check (display_type in ('BUTTON', 'SWATCH', 'SELECT')),
  minimum_selections integer not null default 1
    check (minimum_selections between 0 and 1),
  maximum_selections integer not null default 1
    check (maximum_selections = 1),
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (maximum_selections >= minimum_selections),
  unique (product_id, code),
  unique (product_id, id)
);

create table if not exists public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  option_group_id uuid not null,
  code text not null check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  swatch_url text check (swatch_url is null or swatch_url ~ '^https?://'),
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  price_adjustment numeric not null default 0,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (product_id, option_group_id)
    references public.product_option_groups(product_id, id) on delete cascade,
  unique (option_group_id, code),
  unique (product_id, id),
  unique (product_id, option_group_id, id)
);

create table if not exists public.product_variant_option_values (
  product_id uuid not null,
  variant_id uuid not null,
  option_group_id uuid not null,
  option_value_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (variant_id, option_value_id),
  foreign key (product_id, variant_id)
    references public.product_variants(product_id, id) on delete cascade,
  foreign key (product_id, option_group_id)
    references public.product_option_groups(product_id, id) on delete cascade,
  foreign key (product_id, option_group_id, option_value_id)
    references public.product_option_values(product_id, option_group_id, id)
    on delete restrict,
  unique (variant_id, option_group_id)
);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid,
  option_value_id uuid,
  role text not null default 'GALLERY'
    check (role in (
      'THUMBNAIL', 'HERO', 'GALLERY', 'SWATCH', 'DETAIL',
      'EXTERIOR', 'INTERIOR', 'TECH'
    )),
  media_type text not null default 'IMAGE'
    check (media_type in ('IMAGE', 'VIDEO')),
  url text not null check (url ~ '^https?://'),
  alt_text text,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (product_id, variant_id)
    references public.product_variants(product_id, id) on delete cascade,
  foreign key (product_id, option_value_id)
    references public.product_option_values(product_id, id) on delete cascade,
  check (num_nonnulls(variant_id, option_value_id) <= 1)
);

create index if not exists product_option_groups_product_order_idx
  on public.product_option_groups (product_id, display_order);

create index if not exists product_option_values_group_order_idx
  on public.product_option_values (option_group_id, display_order);

create index if not exists product_variant_option_values_value_idx
  on public.product_variant_option_values (option_value_id);

create index if not exists product_media_product_order_idx
  on public.product_media (product_id, display_order);

create index if not exists product_media_variant_order_idx
  on public.product_media (variant_id, display_order)
  where variant_id is not null;

create index if not exists product_media_option_value_order_idx
  on public.product_media (option_value_id, display_order)
  where option_value_id is not null;

create or replace function app_private.touch_catalog_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists product_option_groups_touch_updated_at
  on public.product_option_groups;
create trigger product_option_groups_touch_updated_at
before update on public.product_option_groups
for each row execute function app_private.touch_catalog_updated_at();

drop trigger if exists product_option_values_touch_updated_at
  on public.product_option_values;
create trigger product_option_values_touch_updated_at
before update on public.product_option_values
for each row execute function app_private.touch_catalog_updated_at();

drop trigger if exists product_media_touch_updated_at
  on public.product_media;
create trigger product_media_touch_updated_at
before update on public.product_media
for each row execute function app_private.touch_catalog_updated_at();

alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_variant_option_values enable row level security;
alter table public.product_media enable row level security;

drop policy if exists product_option_groups_public_read
  on public.product_option_groups;
create policy product_option_groups_public_read
on public.product_option_groups
for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p
    where p.id = product_id and p.is_active
  )
);

drop policy if exists product_option_values_public_read
  on public.product_option_values;
create policy product_option_values_public_read
on public.product_option_values
for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p
    where p.id = product_id and p.is_active
  )
);

drop policy if exists product_variant_option_values_public_read
  on public.product_variant_option_values;
create policy product_variant_option_values_public_read
on public.product_variant_option_values
for select to anon, authenticated
using (
  exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = variant_id and v.is_active and p.is_active
  )
);

drop policy if exists product_media_public_read
  on public.product_media;
create policy product_media_public_read
on public.product_media
for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p
    where p.id = product_id and p.is_active
  )
);

grant select on public.product_option_groups to anon, authenticated;
grant select on public.product_option_values to anon, authenticated;
grant select on public.product_variant_option_values to anon, authenticated;
grant select on public.product_media to anon, authenticated;

grant all on public.product_option_groups to service_role;
grant all on public.product_option_values to service_role;
grant all on public.product_variant_option_values to service_role;
grant all on public.product_media to service_role;

commit;

-- Deliberately retained for develop compatibility during this cut-over:
-- products.image_urls, products.displayed_price, product_variants.color,
-- and product_variants.battery_option. They are read caches/unused columns;
-- option and media tables above are canonical for new code.
