begin;

-- Fail before creating anything if the legacy source is no longer the audited
-- 83-row ACCESSORY dataset. Backfill uses exact label text; it never guesses or
-- normalizes source meaning.
do $$
declare
  v_accessory_count integer;
  v_label_element_count integer;
  v_unique_pair_count integer;
  v_unexpected_label_count integer;
begin
  if to_regclass('public.catalog_service_labels') is not null
     or to_regclass('public.product_service_label_assignments') is not null then
    raise exception using
      errcode = '42P07',
      message = 'Accessory service-label tables already exist; audit schema drift before continuing.';
  end if;

  select count(*)
    into v_accessory_count
    from public.products product
   where product.product_type = 'ACCESSORY';

  if v_accessory_count <> 83 then
    raise exception using
      errcode = '23514',
      message = format('Expected 83 ACCESSORY products, found %s.', v_accessory_count);
  end if;

  if exists (
    select 1
      from public.products product
     where product.product_type = 'ACCESSORY'
       and jsonb_typeof(product.specifications -> 'service_labels') is distinct from 'array'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Every ACCESSORY must have a service_labels JSON array before backfill.';
  end if;

  if exists (
    select 1
      from public.products product
      cross join lateral jsonb_array_elements(product.specifications -> 'service_labels') label(value)
     where product.product_type = 'ACCESSORY'
       and jsonb_typeof(label.value) <> 'string'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Every legacy service label must be a JSON string.';
  end if;

  select count(*), count(distinct (product.id, label.value))
    into v_label_element_count, v_unique_pair_count
    from public.products product
    cross join lateral jsonb_array_elements_text(
      product.specifications -> 'service_labels'
    ) label(value)
   where product.product_type = 'ACCESSORY';

  select count(*)
    into v_unexpected_label_count
    from (
      select distinct label.value
        from public.products product
        cross join lateral jsonb_array_elements_text(
          product.specifications -> 'service_labels'
        ) label(value)
       where product.product_type = 'ACCESSORY'
         and label.value not in ('Có lắp đặt', 'Nhận tại showroom')
    ) unexpected;

  if v_label_element_count <> 32
     or v_unique_pair_count <> 32
     or v_unexpected_label_count <> 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'Legacy service-label preflight failed: elements=%s, unique_pairs=%s, unexpected_labels=%s.',
        v_label_element_count,
        v_unique_pair_count,
        v_unexpected_label_count
      );
  end if;
end;
$$;

create table public.catalog_service_labels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint catalog_service_labels_code_format
    check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint catalog_service_labels_code_length
    check (char_length(code) <= 80),
  constraint catalog_service_labels_name_nonempty
    check (btrim(name) <> ''),
  constraint catalog_service_labels_name_length
    check (char_length(name) <= 160),
  constraint catalog_service_labels_description_length
    check (description is null or char_length(description) <= 1000),
  constraint catalog_service_labels_display_order_nonnegative
    check (display_order >= 0),
  constraint catalog_service_labels_code_key unique (code)
);

create unique index catalog_service_labels_normalized_name_uidx
  on public.catalog_service_labels (
    lower(normalize(btrim(name), NFC))
  );

create index catalog_service_labels_active_order_idx
  on public.catalog_service_labels (display_order, id)
  where is_active;

create table public.product_service_label_assignments (
  product_id uuid not null
    references public.products(id) on delete cascade,
  service_label_id uuid not null
    references public.catalog_service_labels(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint product_service_label_assignments_pkey
    primary key (product_id, service_label_id)
);

create index product_service_label_assignments_label_product_idx
  on public.product_service_label_assignments (service_label_id, product_id);

create or replace function app_private.guard_accessory_service_label_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_product_type text;
begin
  select product.product_type
    into v_product_type
    from public.products product
   where product.id = new.product_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The assigned product does not exist.';
  end if;

  if v_product_type is distinct from 'ACCESSORY' then
    raise exception using
      errcode = '23514',
      message = 'Service labels can only be assigned to ACCESSORY products.';
  end if;

  return new;
end;
$$;

create or replace function app_private.guard_product_service_label_type_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.product_type = 'ACCESSORY'
     and new.product_type is distinct from 'ACCESSORY'
     and exists (
       select 1
         from public.product_service_label_assignments assignment
        where assignment.product_id = new.id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Remove service-label assignments before changing an ACCESSORY product type.';
  end if;

  return new;
end;
$$;

create trigger catalog_service_labels_touch_updated_at
before update on public.catalog_service_labels
for each row execute function app_private.touch_catalog_updated_at();

create trigger product_service_label_assignments_guard_accessory
before insert or update of product_id
on public.product_service_label_assignments
for each row execute function app_private.guard_accessory_service_label_assignment();

create trigger products_guard_service_label_type_change
before update of product_type
on public.products
for each row execute function app_private.guard_product_service_label_type_change();

create or replace function public.replace_product_service_labels(
  target_product_id uuid,
  target_service_label_ids uuid[]
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_requested_ids uuid[] := coalesce(target_service_label_ids, array[]::uuid[]);
  v_product_type text;
begin
  select product.product_type
    into v_product_type
    from public.products product
   where product.id = target_product_id
   for update;

  if not found or v_product_type is distinct from 'ACCESSORY' then
    raise exception using
      errcode = '23514',
      message = 'Service labels can only be assigned to an existing ACCESSORY product.';
  end if;

  if cardinality(v_requested_ids) > 100 then
    raise exception using
      errcode = '23514',
      message = 'At most 100 service labels may be assigned at once.';
  end if;

  perform 1
    from public.catalog_service_labels label
   where label.id = any(v_requested_ids)
     and label.is_active
   for key share;

  if exists (
    select requested.id
      from unnest(v_requested_ids) requested(id)
      left join public.catalog_service_labels label
        on label.id = requested.id
       and label.is_active
     where label.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Every assigned service label must exist and be active.';
  end if;

  delete from public.product_service_label_assignments assignment
   where assignment.product_id = target_product_id
     and not (assignment.service_label_id = any(v_requested_ids));

  insert into public.product_service_label_assignments (
    product_id,
    service_label_id
  )
  select target_product_id, requested.id
    from (select distinct unnest(v_requested_ids) as id) requested
  on conflict (product_id, service_label_id) do nothing;
end;
$$;

revoke all on function public.replace_product_service_labels(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.replace_product_service_labels(uuid, uuid[])
  to service_role;

alter table public.catalog_service_labels enable row level security;
alter table public.product_service_label_assignments enable row level security;

create policy catalog_service_labels_public_read
on public.catalog_service_labels
for select to anon, authenticated
using (is_active);

create policy product_service_label_assignments_public_read
on public.product_service_label_assignments
for select to anon, authenticated
using (
  exists (
    select 1
      from public.catalog_service_labels label
     where label.id = service_label_id
       and label.is_active
  )
  and exists (
    select 1
      from public.products product
     where product.id = product_id
       and product.product_type = 'ACCESSORY'
       and product.is_active
  )
);

revoke all privileges on table
  public.catalog_service_labels,
  public.product_service_label_assignments
from public, anon, authenticated;

grant select on table
  public.catalog_service_labels,
  public.product_service_label_assignments
to anon, authenticated;

grant all privileges on table
  public.catalog_service_labels,
  public.product_service_label_assignments
to service_role;

insert into public.catalog_service_labels (
  code,
  name,
  display_order
)
values
  ('installation', 'Có lắp đặt', 10),
  ('showroom_pickup', 'Nhận tại showroom', 20);

insert into public.product_service_label_assignments (
  product_id,
  service_label_id
)
select product.id, service_label.id
  from public.products product
  cross join lateral jsonb_array_elements_text(
    product.specifications -> 'service_labels'
  ) legacy_label(value)
  join public.catalog_service_labels service_label
    on service_label.name = legacy_label.value
 where product.product_type = 'ACCESSORY';

do $$
declare
  v_label_count integer;
  v_assignment_count integer;
  v_installation_count integer;
  v_showroom_pickup_count integer;
begin
  select count(*)
    into v_label_count
    from public.catalog_service_labels;

  select count(*)
    into v_assignment_count
    from public.product_service_label_assignments;

  select count(*) filter (where label.code = 'installation'),
         count(*) filter (where label.code = 'showroom_pickup')
    into v_installation_count, v_showroom_pickup_count
    from public.product_service_label_assignments assignment
    join public.catalog_service_labels label
      on label.id = assignment.service_label_id;

  if v_label_count <> 2
     or v_assignment_count <> 32
     or v_installation_count <> 7
     or v_showroom_pickup_count <> 25 then
    raise exception using
      errcode = '23514',
      message = format(
        'Service-label verifier failed: labels=%s, assignments=%s, installation=%s, showroom_pickup=%s.',
        v_label_count,
        v_assignment_count,
        v_installation_count,
        v_showroom_pickup_count
      );
  end if;

  if exists (
    select 1
      from public.product_service_label_assignments assignment
      join public.products product on product.id = assignment.product_id
     where product.product_type is distinct from 'ACCESSORY'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A service label was assigned to a non-ACCESSORY product.';
  end if;
end;
$$;

commit;

-- Rollback guidance (review before use): this migration is additive and leaves
-- legacy products.specifications.service_labels unchanged. Deploy runtime that
-- no longer depends on these tables before dropping them.
--
-- begin;
-- drop trigger if exists products_guard_service_label_type_change on public.products;
-- drop function if exists public.replace_product_service_labels(uuid, uuid[]);
-- drop function if exists app_private.guard_product_service_label_type_change();
-- drop table if exists public.product_service_label_assignments;
-- drop table if exists public.catalog_service_labels;
-- drop function if exists app_private.guard_accessory_service_label_assignment();
-- commit;
