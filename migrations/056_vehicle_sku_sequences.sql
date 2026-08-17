begin;

-- Vehicle SKU ranges mirror the canonical accessory format (ACS30000001):
-- CAR10000001..CAR19999999 and BIK20000001..BIK29999999.
create sequence if not exists public.car_sku_sequence
  as bigint minvalue 1 maxvalue 19999999 start with 10000001 increment by 1 no cycle;
create sequence if not exists public.bike_sku_sequence
  as bigint minvalue 1 maxvalue 29999999 start with 20000001 increment by 1 no cycle;

select setval(
  'public.car_sku_sequence'::regclass,
  greatest(
    10000000,
    coalesce((
      select max(value) from (
        select substring(sku from '^CAR([0-9]{8})$')::bigint as value from public.product_variants where sku ~ '^CAR1[0-9]{7}$'
        union all
        select substring(sku from '^CAR([0-9]{8})$')::bigint as value from public.vehicle_variants where sku ~ '^CAR1[0-9]{7}$'
      ) existing
    ), 0),
    (select case when is_called then last_value else last_value - 1 end from public.car_sku_sequence)
  ),
  true
);
select setval(
  'public.bike_sku_sequence'::regclass,
  greatest(
    20000000,
    coalesce((
      select max(value) from (
        select substring(sku from '^BIK([0-9]{8})$')::bigint as value from public.product_variants where sku ~ '^BIK2[0-9]{7}$'
        union all
        select substring(sku from '^BIK([0-9]{8})$')::bigint as value from public.vehicle_variants where sku ~ '^BIK2[0-9]{7}$'
      ) existing
    ), 0),
    (select case when is_called then last_value else last_value - 1 end from public.bike_sku_sequence)
  ),
  true
);

revoke all on sequence public.car_sku_sequence, public.bike_sku_sequence
  from public, anon, authenticated, service_role;

create or replace function public.allocate_vehicle_variant_skus(
  target_product_type text,
  requested_count integer
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_type text := upper(btrim(target_product_type));
  v_prefix text;
  v_sequence regclass;
  v_value bigint;
  v_result text[] := array[]::text[];
  v_index integer;
begin
  if requested_count < 0 or requested_count > 1000 then
    raise exception using errcode = '22023', message = 'Vehicle SKU allocation count must be between 0 and 1000.';
  end if;
  if v_type = 'CAR' then
    v_prefix := 'CAR';
    v_sequence := 'public.car_sku_sequence'::regclass;
  elsif v_type in ('BIKE', 'MOTORBIKE') then
    v_prefix := 'BIK';
    v_sequence := 'public.bike_sku_sequence'::regclass;
  else
    raise exception using errcode = '22023', message = 'Vehicle SKU product type must be CAR or BIKE.';
  end if;

  for v_index in 1..requested_count loop
    v_value := nextval(v_sequence);
    if (v_type = 'CAR' and v_value > 19999999)
       or (v_type in ('BIKE', 'MOTORBIKE') and v_value > 29999999) then
      raise exception using errcode = '22003', message = 'Vehicle SKU sequence is exhausted.';
    end if;
    v_result := array_append(v_result, v_prefix || lpad(v_value::text, 8, '0'));
  end loop;
  return v_result;
end;
$function$;

revoke all on function public.allocate_vehicle_variant_skus(text, integer)
  from public, anon, authenticated;
grant execute on function public.allocate_vehicle_variant_skus(text, integer)
  to service_role;

-- Refuse to rewrite ambiguous inventory relationships. The reconciliation
-- script must repair these first so UUID and inventory ownership stay intact.
do $preflight$
begin
  if exists (
    select product_variant_id
      from public.vehicle_variants
     where product_variant_id is not null
       and upper(product_type) in ('CAR', 'BIKE', 'MOTORBIKE')
     group by product_variant_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate vehicle-to-product variant links must be reconciled before SKU migration.';
  end if;
end;
$preflight$;

-- Existing product variant UUIDs are deliberately preserved. Cart, order and
-- inventory foreign keys therefore remain valid; only the public SKU changes.
do $migrate$
declare
  v_row record;
  v_sku text;
begin
  for v_row in
    select variant.id, product.product_type
      from public.product_variants variant
      join public.products product on product.id = variant.product_id
      join public.vehicle_variants vehicle on vehicle.product_variant_id = variant.id
     where upper(product.product_type) in ('CAR', 'BIKE', 'MOTORBIKE')
       and upper(vehicle.product_type) in ('CAR', 'BIKE', 'MOTORBIKE')
     order by product.id, variant.id
  loop
    if (upper(v_row.product_type) = 'CAR' and exists (
      select 1 from public.product_variants where id = v_row.id and sku ~ '^CAR1[0-9]{7}$'
    )) or (upper(v_row.product_type) in ('BIKE', 'MOTORBIKE') and exists (
      select 1 from public.product_variants where id = v_row.id and sku ~ '^BIK2[0-9]{7}$'
    )) then
      continue;
    end if;
    v_sku := (public.allocate_vehicle_variant_skus(
      case when upper(v_row.product_type) = 'CAR' then 'CAR' else 'BIKE' end,
      1
    ))[1];
    update public.product_variants set sku = v_sku where id = v_row.id;
  end loop;

  update public.vehicle_variants vehicle
     set sku = variant.sku,
         specs = jsonb_set(
           coalesce(vehicle.specs, '{}'::jsonb),
           '{catalog}',
           coalesce(vehicle.specs -> 'catalog', '{}'::jsonb)
             || jsonb_build_object('version_sku', coalesce(nullif(variant.metadata ->> 'base_sku', ''), vehicle.version)),
           true
         )
    from public.product_variants variant
   where vehicle.product_variant_id = variant.id
     and upper(vehicle.product_type) in ('CAR', 'BIKE', 'MOTORBIKE');

  for v_row in
    select id, product_type
      from public.vehicle_variants
     where product_variant_id is null
       and upper(product_type) in ('CAR', 'BIKE', 'MOTORBIKE')
       and not (
         (upper(product_type) = 'CAR' and sku ~ '^CAR1[0-9]{7}$')
         or (upper(product_type) in ('BIKE', 'MOTORBIKE') and sku ~ '^BIK2[0-9]{7}$')
       )
     order by product_id, id
  loop
    v_sku := (public.allocate_vehicle_variant_skus(
      case when upper(v_row.product_type) = 'CAR' then 'CAR' else 'BIKE' end,
      1
    ))[1];
    update public.vehicle_variants set sku = v_sku where id = v_row.id;
  end loop;
end;
$migrate$;

do $validate$
begin
  if exists (
    select 1
      from public.product_variants variant
      join public.products product on product.id = variant.product_id
      join public.vehicle_variants vehicle on vehicle.product_variant_id = variant.id
     where (upper(product.product_type) = 'CAR' and variant.sku !~ '^CAR1[0-9]{7}$')
        or (upper(product.product_type) in ('BIKE', 'MOTORBIKE') and variant.sku !~ '^BIK2[0-9]{7}$')
  ) then
    raise exception 'A linked product variant has an invalid canonical vehicle SKU.';
  end if;
  if exists (
    select 1
      from public.vehicle_variants vehicle
     where (upper(vehicle.product_type) = 'CAR' and vehicle.sku !~ '^CAR1[0-9]{7}$')
        or (upper(vehicle.product_type) in ('BIKE', 'MOTORBIKE') and vehicle.sku !~ '^BIK2[0-9]{7}$')
  ) then
    raise exception 'A vehicle variant has an invalid canonical vehicle SKU.';
  end if;
  if exists (
    select 1
      from public.vehicle_variants vehicle
      join public.product_variants variant on variant.id = vehicle.product_variant_id
     where vehicle.sku is distinct from variant.sku
  ) then
    raise exception 'Vehicle and product variant SKUs are not synchronized.';
  end if;
end;
$validate$;

comment on function public.allocate_vehicle_variant_skus(text, integer) is
  'Allocates immutable CAR/BIK SKUs in the same 3-letter plus 8-digit shape as accessory SKUs.';

commit;
