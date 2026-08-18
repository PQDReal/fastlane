begin;

-- Public motorbike metadata in one call. Publication state belongs to products;
-- sellable color/version state belongs to vehicle_variants.
create or replace function public.list_published_motorbike_catalog()
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
as $function$
  select
    vehicle.product_id,
    min(vehicle.product_name) as product_name,
    (array_agg(
      vehicle.specs
      order by vehicle.version, vehicle.color, vehicle.id
    ))[1] as shared_specs,
    jsonb_agg(
      jsonb_build_object(
        'id', vehicle.id,
        'deposit_amount', vehicle.deposit_amount,
        'variant_name', vehicle.variant_name,
        'sku', vehicle.sku,
        'price', vehicle.price,
        'color', vehicle.color,
        'image_car_url', vehicle.image_car_url,
        'image_color_url', vehicle.image_color_url,
        'version', vehicle.version,
        'is_active', vehicle.is_active
      )
      order by
        coalesce((vehicle.specs->'catalog'->>'version_order')::integer, 0),
        coalesce((vehicle.specs->'catalog'->>'color_order')::integer, 0),
        vehicle.id
    ) as variants
  from public.vehicle_variants vehicle
  join public.products product
    on product.id = vehicle.product_id
   and product.is_active = true
   and product.product_type::text = 'BIKE'
  where vehicle.product_type::text = 'BIKE'
    and vehicle.is_active = true
  group by vehicle.product_id
  order by min(vehicle.product_name);
$function$;

revoke all on function public.list_published_motorbike_catalog()
  from public;
grant execute on function public.list_published_motorbike_catalog()
  to anon, authenticated, service_role;

create index if not exists products_published_motorbike_catalog_idx
  on public.products (product_type, is_active, id);

comment on function public.list_published_motorbike_catalog() is
  'Published motorbike metadata grouped by product, including only active products and active vehicle rows.';

notify pgrst, 'reload schema';

commit;
