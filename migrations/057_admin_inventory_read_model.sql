begin;

-- Shared read model primitives for /san-pham and /ton-kho.
-- The view is intentionally service-role-only for now; the admin API can add
-- one RPC contract on top of this stable shape without duplicating joins.

create extension if not exists pg_trgm;

create or replace function public.fastlane_normalize_inventory_search(value text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select public.fastlane_normalize_product_search(value);
$$;

comment on function public.fastlane_normalize_inventory_search(text) is
  'Canonical unaccented, lower-case inventory search text normalizer.';

alter table public.products
  add column if not exists inventory_search_text text not null default '';

alter table public.product_variants
  add column if not exists inventory_search_text text not null default '';

alter table public.vehicle_variants
  add column if not exists inventory_search_text text not null default '';

create or replace function public.fastlane_products_inventory_search_text_update()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.inventory_search_text := public.fastlane_normalize_inventory_search(
    concat_ws(' ', new.name, new.slug, new.product_type::text, new.specifications::text)
  );
  return new;
end;
$$;

create or replace function public.fastlane_product_variants_inventory_search_text_update()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.inventory_search_text := public.fastlane_normalize_inventory_search(
    concat_ws(' ', new.sku, new.name, new.option_signature, new.metadata::text)
  );
  return new;
end;
$$;

create or replace function public.fastlane_vehicle_variants_inventory_search_text_update()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.inventory_search_text := public.fastlane_normalize_inventory_search(
    concat_ws(
      ' ',
      new.sku,
      new.variant_name,
      new.product_name,
      new.version,
      new.color,
      new.interior_color,
      new.specs::text
    )
  );
  return new;
end;
$$;

drop trigger if exists products_inventory_search_text_update on public.products;
create trigger products_inventory_search_text_update
before insert or update of name, slug, product_type, specifications
on public.products
for each row
execute function public.fastlane_products_inventory_search_text_update();

drop trigger if exists product_variants_inventory_search_text_update on public.product_variants;
create trigger product_variants_inventory_search_text_update
before insert or update of sku, name, option_signature, metadata
on public.product_variants
for each row
execute function public.fastlane_product_variants_inventory_search_text_update();

drop trigger if exists vehicle_variants_inventory_search_text_update on public.vehicle_variants;
create trigger vehicle_variants_inventory_search_text_update
before insert or update of sku, variant_name, product_name, version, color, interior_color, specs
on public.vehicle_variants
for each row
execute function public.fastlane_vehicle_variants_inventory_search_text_update();

-- Backfill before creating search indexes so existing catalog rows have the
-- same contract as rows written after this migration.
update public.products
set inventory_search_text = public.fastlane_normalize_inventory_search(
  concat_ws(' ', name, slug, product_type::text, specifications::text)
);

update public.product_variants
set inventory_search_text = public.fastlane_normalize_inventory_search(
  concat_ws(' ', sku, name, option_signature, metadata::text)
);

update public.vehicle_variants
set inventory_search_text = public.fastlane_normalize_inventory_search(
  concat_ws(
    ' ',
    sku,
    variant_name,
    product_name,
    version,
    color,
    interior_color,
    specs::text
  )
);

-- Trigram indexes support normalized substring search after the API has
-- narrowed the relation by product type and active state.
do $indexes$
declare
  v_operator_schema text;
begin
  select ns.nspname
    into v_operator_schema
    from pg_extension ext
    join pg_namespace ns on ns.oid = ext.extnamespace
   where ext.extname = 'pg_trgm';

  if v_operator_schema is null then
    raise exception 'The pg_trgm extension is installed without a discoverable schema.';
  end if;

  execute format(
    'create index if not exists products_inventory_search_text_trgm_idx on public.products using gin (inventory_search_text %s)',
    format('%I.gin_trgm_ops', v_operator_schema)
  );

  execute format(
    'create index if not exists product_variants_inventory_search_text_trgm_idx on public.product_variants using gin (inventory_search_text %s)',
    format('%I.gin_trgm_ops', v_operator_schema)
  );

  execute format(
    'create index if not exists vehicle_variants_inventory_search_text_trgm_idx on public.vehicle_variants using gin (inventory_search_text %s)',
    format('%I.gin_trgm_ops', v_operator_schema)
  );
end
$indexes$;

create index if not exists admin_inventory_products_type_active_idx
  on public.products (product_type, is_active, id);

create index if not exists admin_inventory_product_variants_product_active_idx
  on public.product_variants (product_id, is_active, id);

create index if not exists admin_inventory_vehicle_product_active_idx
  on public.vehicle_variants (product_id, is_active, product_variant_id);

do $preflight$
begin
  if exists (
    select product_variant_id
      from public.vehicle_variants
     where product_variant_id is not null
     group by product_variant_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Duplicate vehicle-to-product variant links must be reconciled before creating the admin inventory view.';
  end if;
end
$preflight$;

create unique index if not exists admin_inventory_vehicle_product_variant_uidx
  on public.vehicle_variants (product_variant_id)
  where product_variant_id is not null;

create or replace view public.admin_inventory_base
with (security_invoker = true)
as
select
  variant.id as variant_id,
  variant.product_id,
  product.name as product_name,
  product.slug as product_slug,
  product.product_type::text as product_type,
  product.is_active as product_is_active,
  category.name as category_name,
  variant.sku as product_variant_sku,
  vehicle.sku as vehicle_variant_sku,
  coalesce(nullif(btrim(vehicle.sku), ''), variant.sku) as sku,
  variant.name as variant_name,
  variant.is_active as variant_is_active,
  vehicle.id as vehicle_variant_id,
  vehicle.product_variant_id,
  vehicle.is_active as vehicle_is_active,
  vehicle.version,
  vehicle.color,
  vehicle.color_type,
  vehicle.color_price_adjustment,
  vehicle.interior_color,
  vehicle.image_car_url,
  vehicle.image_color_url,
  inventory.on_hand_quantity,
  inventory.updated_at as inventory_updated_at,
  inventory.variant_id is not null as has_inventory_row,
  case
    when not product.is_active
      or not variant.is_active
      or coalesce(vehicle.is_active, true) = false
      then 'INACTIVE'
    when product.product_type::text in ('CAR', 'BIKE', 'MOTORBIKE')
      and (vehicle.id is null or vehicle.product_variant_id is null)
      then 'UNLINKED'
    when inventory.variant_id is null
      then 'MISSING_INVENTORY'
    when coalesce(inventory.on_hand_quantity, 0) <= 0
      then 'OUT_OF_STOCK'
    when inventory.on_hand_quantity <= 5
      then 'LOW_STOCK'
    else 'IN_STOCK'
  end as inventory_status,
  case
    when product.product_type::text not in ('CAR', 'BIKE', 'MOTORBIKE')
      then product.is_active and variant.is_active
    else
      product.is_active
      and variant.is_active
      and vehicle.is_active
      and vehicle.id is not null
      and btrim(coalesce(vehicle.version, '')) <> ''
      and btrim(coalesce(vehicle.color, '')) <> ''
      and coalesce(inventory.on_hand_quantity, 0) > 0
  end as is_sellable,
  public.fastlane_normalize_inventory_search(
    concat_ws(
      ' ',
      product.inventory_search_text,
      variant.inventory_search_text,
      vehicle.inventory_search_text
    )
  ) as search_document,
  -- Keep search_document in its original ordinal position so this migration
  -- can replace the first version of the view without PostgreSQL treating the
  -- following additive columns as an implicit rename (SQLSTATE 42P16).
  product.inventory_search_text as product_search_text,
  variant.inventory_search_text as variant_search_text,
  vehicle.inventory_search_text as vehicle_search_text
from public.product_variants variant
join public.products product
  on product.id = variant.product_id
left join public.categories category
  on category.id = product.category_id
left join public.vehicle_variants vehicle
  on vehicle.product_variant_id = variant.id
 and vehicle.product_id = product.id
left join public.inventory_items inventory
  on inventory.variant_id = variant.id;

comment on view public.admin_inventory_base is
  'Canonical admin inventory read model for accessories, cars, and electric motorbikes.';

revoke all on public.admin_inventory_base from public, anon, authenticated;
grant select on public.admin_inventory_base to service_role;

create or replace function public.list_admin_inventory(
  p_search text default null,
  p_product_type text default 'ALL',
  p_product_id uuid default null,
  p_variant text default 'ALL',
  p_color text default 'ALL',
  p_interior_color text default 'ALL',
  p_status text default 'ALL',
  p_activity text default 'ALL',
  p_limit integer default 50,
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_type text := upper(coalesce(nullif(btrim(p_product_type), ''), 'ALL'));
  v_variant text := nullif(btrim(coalesce(p_variant, '')), '');
  v_color text := nullif(btrim(coalesce(p_color, '')), '');
  v_interior_color text := nullif(btrim(coalesce(p_interior_color, '')), '');
  v_status text := upper(coalesce(nullif(btrim(p_status), ''), 'ALL'));
  v_activity text := upper(coalesce(nullif(btrim(p_activity), ''), 'ALL'));
  v_search text := public.fastlane_normalize_inventory_search(nullif(btrim(p_search), ''));
  v_limit integer := coalesce(p_limit, 50);
  v_cursor jsonb;
  v_cursor_sku text;
  v_cursor_variant_id uuid;
  v_result jsonb;
begin
  if v_product_type not in ('ALL', 'CAR', 'BIKE', 'ACCESSORY') then
    raise exception using errcode = '22023', message = 'Invalid inventory product type filter.';
  end if;
  if v_status not in ('ALL', 'INACTIVE', 'UNLINKED', 'MISSING_INVENTORY', 'OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK') then
    raise exception using errcode = '22023', message = 'Invalid inventory status filter.';
  end if;
  if v_activity not in ('ALL', 'ACTIVE', 'INACTIVE') then
    raise exception using errcode = '22023', message = 'Invalid inventory activity filter.';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception using errcode = '22023', message = 'Inventory page size must be between 1 and 100.';
  end if;

  if v_variant = 'ALL' then v_variant := null; end if;
  if v_color = 'ALL' then v_color := null; end if;
  if v_interior_color = 'ALL' then v_interior_color := null; end if;

  if nullif(btrim(p_cursor), '') is not null then
    begin
      v_cursor := convert_from(decode(btrim(p_cursor), 'base64'), 'UTF8')::jsonb;
      v_cursor_sku := v_cursor ->> 'sku';
      v_cursor_variant_id := (v_cursor ->> 'variantId')::uuid;
      if jsonb_typeof(v_cursor) <> 'object'
         or v_cursor_sku is null
         or v_cursor_variant_id is null then
        raise exception using errcode = '22023', message = 'Invalid inventory cursor.';
      end if;
    exception when others then
      raise exception using errcode = '22023', message = 'Invalid inventory cursor.';
    end;
  end if;

  with filtered as materialized (
    select inventory.*
      from public.admin_inventory_base inventory
     where (
       v_product_type = 'ALL'
       or (v_product_type = 'BIKE' and inventory.product_type in ('BIKE', 'MOTORBIKE'))
       or inventory.product_type = v_product_type
     )
       and (p_product_id is null or inventory.product_id = p_product_id)
       and (v_variant is null or coalesce(nullif(btrim(inventory.version), ''), inventory.variant_name) = v_variant)
       and (v_color is null or inventory.color = v_color)
       and (v_interior_color is null or inventory.interior_color = v_interior_color)
       and (v_status = 'ALL' or inventory.inventory_status = v_status)
       and (
         v_activity = 'ALL'
         or (v_activity = 'ACTIVE' and inventory.product_is_active and inventory.variant_is_active and coalesce(inventory.vehicle_is_active, true))
         or (v_activity = 'INACTIVE' and not (inventory.product_is_active and inventory.variant_is_active and coalesce(inventory.vehicle_is_active, true)))
       )
       and (
         v_search is null
         or inventory.product_search_text like '%' || v_search || '%'
         or inventory.variant_search_text like '%' || v_search || '%'
         or inventory.vehicle_search_text like '%' || v_search || '%'
       )
  ), page as (
    select filtered.*
      from filtered
     where v_cursor_variant_id is null
        or (coalesce(filtered.sku, ''), filtered.variant_id) > (coalesce(v_cursor_sku, ''), v_cursor_variant_id)
     order by coalesce(filtered.sku, ''), filtered.variant_id
     limit v_limit + 1
  ), visible as (
    select page.*
      from page
     order by coalesce(page.sku, ''), page.variant_id
     limit v_limit
  ), last_visible as (
    select visible.*
      from visible
     order by coalesce(visible.sku, '') desc, visible.variant_id desc
     limit 1
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', visible.variant_id,
        'productId', visible.product_id,
        'sku', visible.sku,
        'productName', visible.product_name,
        'variantName', visible.variant_name,
        'productType', visible.product_type,
        'categoryName', visible.category_name,
        'version', visible.version,
        'color', visible.color,
        'interiorColor', visible.interior_color,
        'inventoryKey', case
          when visible.version is not null and visible.color is not null then
            format('[%s,%s,%s]', to_json(visible.version), to_json(visible.color), to_json(coalesce(visible.interior_color, '')))
          else null
        end,
        'onHandQuantity', coalesce(visible.on_hand_quantity, 0),
        'updatedAt', visible.inventory_updated_at,
        'variantIsActive', visible.variant_is_active,
        'productIsActive', visible.product_is_active,
        'isActive', visible.product_is_active and visible.variant_is_active and coalesce(visible.vehicle_is_active, true),
        'inventoryStatus', visible.inventory_status,
        'isSellable', visible.is_sellable,
        'hasInventoryRow', visible.has_inventory_row
      ) order by coalesce(visible.sku, ''), visible.variant_id)
      from visible
    ), '[]'::jsonb),
    'nextCursor', case
      when (select count(*) from page) > v_limit then encode(
        convert_to((select jsonb_build_object('sku', coalesce(last_visible.sku, ''), 'variantId', last_visible.variant_id)::text from last_visible), 'UTF8'),
        'base64'
      )
      else null
    end,
    'hasMore', (select count(*) from page) > v_limit,
    'limit', v_limit,
    'summary', jsonb_build_object(
      'totalRows', (select count(*) from filtered),
      'totalQuantity', coalesce((select sum(coalesce(filtered.on_hand_quantity, 0)) from filtered), 0),
      'statusCounts', jsonb_build_object(
        'IN_STOCK', (select count(*) from filtered where inventory_status = 'IN_STOCK'),
        'LOW_STOCK', (select count(*) from filtered where inventory_status = 'LOW_STOCK'),
        'OUT_OF_STOCK', (select count(*) from filtered where inventory_status = 'OUT_OF_STOCK'),
        'MISSING_INVENTORY', (select count(*) from filtered where inventory_status = 'MISSING_INVENTORY'),
        'UNLINKED', (select count(*) from filtered where inventory_status = 'UNLINKED'),
        'INACTIVE', (select count(*) from filtered where inventory_status = 'INACTIVE')
      )
    )
  )
    into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_admin_inventory_filter_options(
  p_product_type text default 'ALL',
  p_product_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_type text := upper(coalesce(nullif(btrim(p_product_type), ''), 'ALL'));
  v_result jsonb;
begin
  if v_product_type not in ('ALL', 'CAR', 'BIKE', 'ACCESSORY') then
    raise exception using errcode = '22023', message = 'Invalid inventory product type filter.';
  end if;

  with filtered as materialized (
    select inventory.*
      from public.admin_inventory_base inventory
     where (
       v_product_type = 'ALL'
       or (v_product_type = 'BIKE' and inventory.product_type in ('BIKE', 'MOTORBIKE'))
       or inventory.product_type = v_product_type
     )
       and (p_product_id is null or inventory.product_id = p_product_id)
  ), product_options as (
    select distinct product_id, product_name, product_type
      from filtered
     where product_id is not null
  ), variant_options as (
    select distinct
      case when product_type = 'ACCESSORY' then variant_name else coalesce(nullif(btrim(version), ''), variant_name) end as value
      from filtered
     where btrim(coalesce(case when product_type = 'ACCESSORY' then variant_name else coalesce(nullif(btrim(version), ''), variant_name) end, '')) <> ''
  ), color_options as (
    select distinct color as value from filtered where btrim(coalesce(color, '')) <> ''
  ), interior_options as (
    select distinct interior_color as value from filtered where btrim(coalesce(interior_color, '')) <> ''
  )
  select jsonb_build_object(
    'typeCounts', jsonb_build_object(
      'ALL', (select count(*) from filtered),
      'CAR', (select count(*) from filtered where product_type = 'CAR'),
      'BIKE', (select count(*) from filtered where product_type in ('BIKE', 'MOTORBIKE')),
      'ACCESSORY', (select count(*) from filtered where product_type = 'ACCESSORY')
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', product_id, 'name', product_name, 'productType', product_type) order by product_name, product_id)
        from product_options
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object('value', value, 'label', value) order by value)
        from variant_options
    ), '[]'::jsonb),
    'colors', coalesce((
      select jsonb_agg(jsonb_build_object('value', value, 'label', value) order by value)
        from color_options
    ), '[]'::jsonb),
    'interiorColors', coalesce((
      select jsonb_agg(jsonb_build_object('value', value, 'label', value) order by value)
        from interior_options
    ), '[]'::jsonb)
  )
    into v_result;

  return v_result;
end;
$function$;

create or replace function public.get_admin_product_inventory_summary(
  p_product_ids uuid[] default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with eligible_variants as (
    -- Keep accessories on the cheap product/variant/inventory path.
    select
      product.id as product_id,
      variant.id as variant_id,
      variant.sku,
      variant.is_active,
      inventory.on_hand_quantity
    from public.products product
    join public.product_variants variant
      on variant.product_id = product.id
    left join public.inventory_items inventory
      on inventory.variant_id = variant.id
    where (
      product.product_type is null
      or product.product_type::text not in ('CAR', 'BIKE')
    )
      and (p_product_ids is null or product.id = any(p_product_ids))

    union all

    -- Vehicle rows must satisfy the same sellable identity rule as the old
    -- API, but the composite join prevents post-join placeholder filtering.
    select
      product.id as product_id,
      variant.id as variant_id,
      variant.sku,
      variant.is_active,
      inventory.on_hand_quantity
    from public.products product
    join public.product_variants variant
      on variant.product_id = product.id
    join public.vehicle_variants vehicle
      on vehicle.product_id = product.id
     and vehicle.product_variant_id = variant.id
    left join public.inventory_items inventory
      on inventory.variant_id = variant.id
    where product.product_type::text in ('CAR', 'BIKE')
      and (p_product_ids is null or product.id = any(p_product_ids))
      and vehicle.product_type::text in ('CAR', 'BIKE')
      and (
        btrim(coalesce(vehicle.sku, '')) <> ''
        or btrim(coalesce(vehicle.variant_name, '')) <> ''
        or btrim(coalesce(vehicle.version, '')) <> ''
      )
      and btrim(coalesce(vehicle.color, '')) <> ''
  ), product_summary as (
    select
      product_id,
      (array_agg(sku order by is_active desc, variant_id))[1] as active_sku,
      count(variant_id)::bigint as inventory_variant_count,
      coalesce(sum(greatest(coalesce(on_hand_quantity, 0), 0)), 0)::bigint as inventory_quantity
    from eligible_variants
    group by product_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'productId', product_id,
        'activeSku', active_sku,
        'inventoryQuantity', inventory_quantity,
        'inventoryVariantCount', inventory_variant_count
      )
      order by product_id
    ),
    '[]'::jsonb
  )
  from product_summary;
$function$;

revoke all on function public.list_admin_inventory(text, text, uuid, text, text, text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.list_admin_inventory(text, text, uuid, text, text, text, text, text, integer, text)
  to service_role;

revoke all on function public.get_admin_inventory_filter_options(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_inventory_filter_options(text, uuid)
  to service_role;

comment on function public.list_admin_inventory(text, text, uuid, text, text, text, text, text, integer, text) is
  'Cursor-paginated admin inventory query over the canonical inventory read model.';
comment on function public.get_admin_inventory_filter_options(text, uuid) is
  'Admin inventory filter options scoped by product type and product.';

revoke all on function public.get_admin_product_inventory_summary(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_admin_product_inventory_summary(uuid[])
  to service_role;

comment on function public.get_admin_product_inventory_summary(uuid[]) is
  'Per-product inventory summary for the paginated admin product list; vehicle rows follow the legacy sellable-identity rule.';

notify pgrst, 'reload schema';

commit;
