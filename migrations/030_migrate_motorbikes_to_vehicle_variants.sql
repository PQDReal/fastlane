begin;

-- vehicle_variants is the canonical read model for vehicles. Cars already use
-- this shape. These columns make the same table sufficient for motorbike
-- listing, detail, comparison, deposit and estimator screens without reading
-- motorbike catalog fields from products or product_variants at runtime.
alter table public.vehicle_variants
  add column if not exists product_slug text,
  add column if not exists description text,
  add column if not exists original_price numeric,
  add column if not exists sale_price numeric,
  add column if not exists listing_image_url text,
  add column if not exists hero_image_url text,
  add column if not exists detail_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists brochure_url text,
  add column if not exists version_order integer not null default 0,
  add column if not exists color_order integer not null default 0;

-- Refuse to transform an incomplete source snapshot. The current ordered bike
-- image contract is:
-- listing, hero, (vehicle image, swatch) per color, detail 1, detail 2, detail 3.
do $$
begin
  if exists (
    select 1
      from public.products product
     where product.product_type::text in ('BIKE', 'MOTORBIKE')
       and product.is_active
       and (
         product.slug is null
         or btrim(product.slug) = ''
         or jsonb_typeof(product.specifications) <> 'object'
         or jsonb_typeof(product.specifications -> 'color_details') <> 'array'
         or jsonb_array_length(product.specifications -> 'color_details') = 0
         or jsonb_typeof(product.image_urls) <> 'array'
         or jsonb_array_length(product.image_urls) <>
              5 + 2 * jsonb_array_length(product.specifications -> 'color_details')
         or not exists (
           select 1
             from public.product_variants product_variant
            where product_variant.product_id = product.id
              and product_variant.is_active
              and product_variant.sku is not null
              and btrim(product_variant.sku) <> ''
              and product_variant.name is not null
              and btrim(product_variant.name) <> ''
              and product_variant.original_price is not null
         )
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Motorbike source data does not satisfy the migration contract';
  end if;
end
$$;

-- The 18 existing BIKE rows are placeholders. Do not replace them if an order
-- has already started referencing one of those IDs.
do $$
begin
  if exists (
    select 1
      from public.deposit_orders deposit_order
      join public.vehicle_variants vehicle_variant
        on vehicle_variant.id = deposit_order.vehicle_variant_id
     where vehicle_variant.product_type = 'BIKE'
  ) then
    raise exception using
      errcode = '23503',
      message = 'A deposit order already references a motorbike placeholder';
  end if;
end
$$;

delete from public.vehicle_variants
 where product_type = 'BIKE';

with bike_products as (
  select
    product.id as product_id,
    product.name,
    product.slug,
    product.description,
    product.specifications,
    product.image_urls,
    product.specifications -> 'color_details' as color_details,
    jsonb_array_length(product.specifications -> 'color_details') as color_count,
    jsonb_array_length(product.image_urls) as image_count,
    case
      when jsonb_typeof(product.specifications -> 'specs') = 'object'
        then product.specifications -> 'specs'
      else product.specifications
    end as technical_specs
  from public.products product
  where product.product_type::text in ('BIKE', 'MOTORBIKE')
    and product.is_active
),
bike_versions as (
  select
    product_variant.*,
    row_number() over (
      partition by product_variant.product_id
      order by product_variant.sku, product_variant.id
    )::integer as version_order
  from public.product_variants product_variant
  join bike_products bike
    on bike.id = product_variant.product_id
  where product_variant.is_active
),
bike_colors as (
  select
    bike.*,
    color_item.ordinality::integer as color_order,
    coalesce(
      nullif(btrim(color_item.value ->> 'color_name'), ''),
      nullif(btrim(color_item.value ->> 'name'), '')
    ) as color_name
  from bike_products bike
  cross join lateral jsonb_array_elements(bike.color_details)
    with ordinality as color_item(value, ordinality)
)
insert into public.vehicle_variants (
  product_id,
  product_type,
  product_name,
  product_slug,
  description,
  deposit_amount,
  specs,
  variant_name,
  sku,
  price,
  original_price,
  sale_price,
  color,
  image_car_url,
  image_color_url,
  listing_image_url,
  hero_image_url,
  detail_image_urls,
  brochure_url,
  version,
  version_order,
  color_order,
  is_active
)
select
  color.product_id,
  'BIKE',
  color.name,
  color.slug,
  color.description,
  version.deposit_amount,
  color.technical_specs,
  concat_ws(' ', color.name, version.name, color.color_name),
  version.sku || '-C' || lpad(color.color_order::text, 2, '0'),
  coalesce(version.sale_price, version.original_price),
  version.original_price,
  version.sale_price,
  color.color_name,
  color.image_urls ->> (2 + (color.color_order - 1) * 2),
  color.image_urls ->> (3 + (color.color_order - 1) * 2),
  color.image_urls ->> 0,
  color.image_urls ->> 1,
  jsonb_build_array(
    color.image_urls -> (color.image_count - 3),
    color.image_urls -> (color.image_count - 2),
    color.image_urls -> (color.image_count - 1)
  ),
  coalesce(
    nullif(color.specifications ->> 'brochure_url', ''),
    nullif(color.specifications ->> 'brochureUrl', ''),
    nullif(color.specifications ->> 'brochure', '')
  ),
  version.name,
  version.version_order,
  color.color_order,
  true
from bike_colors color
join bike_versions version
  on version.product_id = color.product_id;

do $$
declare
  expected_product_count integer;
  migrated_product_count integer;
  expected_variant_count integer;
  migrated_variant_count integer;
begin
  select count(*)
    into expected_product_count
    from public.products
   where product_type::text in ('BIKE', 'MOTORBIKE')
     and is_active;

  select count(distinct product_id), count(*)
    into migrated_product_count, migrated_variant_count
    from public.vehicle_variants
   where product_type = 'BIKE'
     and is_active;

  select coalesce(sum(source.color_count * source.version_count), 0)
    into expected_variant_count
    from (
      select
        product.id,
        jsonb_array_length(product.specifications -> 'color_details') as color_count,
        count(product_variant.id)::integer as version_count
      from public.products product
      join public.product_variants product_variant
        on product_variant.product_id = product.id
       and product_variant.is_active
      where product.product_type::text in ('BIKE', 'MOTORBIKE')
        and product.is_active
      group by product.id
    ) source;

  if migrated_product_count <> expected_product_count
     or migrated_variant_count <> expected_variant_count
  then
    raise exception using
      errcode = '23514',
      message = format(
        'Motorbike migration count mismatch: products %s/%s, variants %s/%s',
        migrated_product_count,
        expected_product_count,
        migrated_variant_count,
        expected_variant_count
      );
  end if;

  if exists (
    select 1
      from public.vehicle_variants
     where product_type = 'BIKE'
       and (
         product_id is null
         or product_name is null
         or btrim(product_name) = ''
         or product_slug is null
         or btrim(product_slug) = ''
         or version is null
         or btrim(version) = ''
         or color is null
         or btrim(color) = ''
         or sku is null
         or btrim(sku) = ''
         or price is null
         or price < 0
         or deposit_amount is null
         or deposit_amount < 0
         or image_car_url is null
         or btrim(image_car_url) = ''
         or image_color_url is null
         or btrim(image_color_url) = ''
         or listing_image_url is null
         or btrim(listing_image_url) = ''
         or hero_image_url is null
         or btrim(hero_image_url) = ''
         or jsonb_typeof(detail_image_urls) <> 'array'
         or jsonb_array_length(detail_image_urls) <> 3
         or jsonb_typeof(specs) <> 'object'
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Migrated motorbike variants contain incomplete rows';
  end if;
end
$$;

create unique index if not exists vehicle_variants_bike_sku_uidx
  on public.vehicle_variants (upper(sku))
  where product_type = 'BIKE' and sku is not null;

create unique index if not exists vehicle_variants_bike_version_color_uidx
  on public.vehicle_variants (
    product_id,
    lower(version),
    lower(color)
  )
  where product_type = 'BIKE'
    and version is not null
    and color is not null;

create index if not exists vehicle_variants_bike_slug_idx
  on public.vehicle_variants (
    product_slug,
    is_active,
    version_order,
    color_order
  )
  where product_type = 'BIKE';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.vehicle_variants'::regclass
       and conname = 'vehicle_variants_bike_complete'
  ) then
    alter table public.vehicle_variants
      add constraint vehicle_variants_bike_complete
      check (
        product_type <> 'BIKE'
        or (
          product_id is not null
          and product_name is not null
          and btrim(product_name) <> ''
          and product_slug is not null
          and btrim(product_slug) <> ''
          and version is not null
          and btrim(version) <> ''
          and color is not null
          and btrim(color) <> ''
          and sku is not null
          and btrim(sku) <> ''
          and price is not null
          and price >= 0
          and original_price is not null
          and original_price >= 0
          and (sale_price is null or sale_price >= 0)
          and deposit_amount is not null
          and deposit_amount >= 0
          and deposit_amount <= price
          and image_car_url is not null
          and btrim(image_car_url) <> ''
          and image_color_url is not null
          and btrim(image_color_url) <> ''
          and listing_image_url is not null
          and btrim(listing_image_url) <> ''
          and hero_image_url is not null
          and btrim(hero_image_url) <> ''
          and detail_image_urls is not null
          and jsonb_typeof(detail_image_urls) = 'array'
          and jsonb_array_length(detail_image_urls) = 3
          and specs is not null
          and jsonb_typeof(specs) = 'object'
          and version_order > 0
          and color_order > 0
        )
      ) not valid;
  end if;
end
$$;

alter table public.vehicle_variants
  validate constraint vehicle_variants_bike_complete;

notify pgrst, 'reload schema';

commit;
