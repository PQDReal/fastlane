-- Aggregate the public motorbike read model so shared specifications are sent
-- once per product instead of once for every version/color row.

create or replace function public.list_active_motorbike_catalog()
returns table (
  product_id uuid,
  product_name text,
  shared_specs jsonb,
  variants jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    vehicle_variants.product_id,
    min(vehicle_variants.product_name) as product_name,
    (array_agg(
      vehicle_variants.specs
      order by vehicle_variants.version, vehicle_variants.color, vehicle_variants.id
    ))[1] as shared_specs,
    jsonb_agg(
      jsonb_build_object(
        'id', vehicle_variants.id,
        'deposit_amount', vehicle_variants.deposit_amount,
        'variant_name', vehicle_variants.variant_name,
        'sku', vehicle_variants.sku,
        'price', vehicle_variants.price,
        'color', vehicle_variants.color,
        'image_car_url', vehicle_variants.image_car_url,
        'image_color_url', vehicle_variants.image_color_url,
        'version', vehicle_variants.version,
        'is_active', vehicle_variants.is_active
      )
      order by
        coalesce((vehicle_variants.specs->'catalog'->>'version_order')::integer, 0),
        coalesce((vehicle_variants.specs->'catalog'->>'color_order')::integer, 0),
        vehicle_variants.id
    ) as variants
  from public.vehicle_variants
  where vehicle_variants.product_type = 'BIKE'
    and vehicle_variants.is_active = true
  group by vehicle_variants.product_id
  order by min(vehicle_variants.product_name);
$$;

grant execute on function public.list_active_motorbike_catalog() to anon, authenticated, service_role;

create index if not exists idx_vehicle_variants_bike_catalog
  on public.vehicle_variants (product_type, is_active, product_id);
