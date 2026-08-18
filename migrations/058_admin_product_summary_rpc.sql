begin;

-- Follow-up to 057 for environments where the shared inventory read model is
-- already installed. Do not re-run 057 just to add this product-list RPC.
create or replace function public.get_admin_product_inventory_summary(
  p_product_ids uuid[] default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with eligible_variants as (
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

revoke all on function public.get_admin_product_inventory_summary(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_admin_product_inventory_summary(uuid[])
  to service_role;

comment on function public.get_admin_product_inventory_summary(uuid[]) is
  'Per-product inventory summary for the paginated admin product list; vehicle rows follow the legacy sellable-identity rule.';

notify pgrst, 'reload schema';

commit;
