-- Reproducible local benchmark for the /admin/products inventory summary.
-- Run through scripts/run-admin-product-summary-benchmark.ps1.
-- All rows are temporary and are rolled back at the end.

begin;

create temp table bench_products (
  id bigint primary key,
  product_type text not null,
  is_active boolean not null default true
);

create temp table bench_product_variants (
  id bigint primary key,
  product_id bigint not null references bench_products(id),
  sku text not null,
  is_active boolean not null
);

create temp table bench_vehicle_variants (
  product_id bigint not null references bench_products(id),
  product_variant_id bigint not null references bench_product_variants(id),
  product_type text not null,
  sku text,
  variant_name text,
  version text,
  color text
);

create temp table bench_inventory_items (
  variant_id bigint primary key references bench_product_variants(id),
  on_hand_quantity integer not null
);

insert into bench_products (id, product_type)
select id,
       case
         when id % 5 = 0 then 'ACCESSORY'
         when id % 2 = 0 then 'CAR'
         else 'BIKE'
       end
  from generate_series(1, 10000) as source(id);

insert into bench_product_variants (id, product_id, sku, is_active)
select id,
       ((id - 1) % 10000) + 1,
       'BENCH-' || lpad(id::text, 7, '0'),
       id % 19 <> 0
  from generate_series(1, 500000) as source(id);

insert into bench_vehicle_variants (product_id, product_variant_id, product_type, sku, variant_name, version, color)
select product.id,
       variant.id,
       product.product_type,
       variant.sku,
       case when variant.id % 17 = 0 then '' else 'Tiêu chuẩn' end,
       case when variant.id % 17 = 0 then '' else 'Tiêu chuẩn' end,
       case when variant.id % 17 = 0 then '' else 'Đen bóng' end
  from bench_product_variants variant
  join bench_products product on product.id = variant.product_id
 where product.product_type in ('CAR', 'BIKE');

insert into bench_inventory_items (variant_id, on_hand_quantity)
select id, (id % 23) - 3
  from bench_product_variants
 where id <= 480000;

create index bench_variants_product_idx on bench_product_variants (product_id, is_active, id);
create index bench_vehicle_product_variant_idx on bench_vehicle_variants (product_id, product_variant_id);
create index bench_inventory_variant_idx on bench_inventory_items (variant_id);

analyze bench_products;
analyze bench_product_variants;
analyze bench_vehicle_variants;
analyze bench_inventory_items;

-- The legacy Node path loads all variant/inventory rows and filters vehicle
-- placeholders in application memory.
select 'legacy_raw_rows_all_products' as benchmark;
explain (analyze, buffers, timing off)
select product.id,
       product.product_type,
       variant.id as variant_id,
       variant.sku,
       variant.is_active,
       inventory.on_hand_quantity
  from bench_products product
  join bench_product_variants variant on variant.product_id = product.id
  left join bench_inventory_items inventory on inventory.variant_id = variant.id
 order by product.id, variant.id;

-- The RPC returns one compact row per product and applies the same vehicle
-- identity rule in SQL before aggregation.
select 'rpc_aggregate_all_products' as benchmark;
explain (analyze, buffers, timing off)
with eligible_variants as (
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.product_type not in ('CAR', 'BIKE')
  union all
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    join bench_vehicle_variants vehicle
      on vehicle.product_id = product.id
     and vehicle.product_variant_id = variant.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.product_type in ('CAR', 'BIKE')
     and vehicle.product_type in ('CAR', 'BIKE')
     and (
       btrim(coalesce(vehicle.sku, '')) <> ''
       or btrim(coalesce(vehicle.variant_name, '')) <> ''
       or btrim(coalesce(vehicle.version, '')) <> ''
     )
     and btrim(coalesce(vehicle.color, '')) <> ''
), product_summary as (
  select product_id,
         (array_agg(sku order by is_active desc, variant_id))[1] as active_sku,
         count(variant_id)::bigint as inventory_variant_count,
         coalesce(sum(greatest(coalesce(on_hand_quantity, 0), 0)), 0)::bigint as inventory_quantity
    from eligible_variants
   group by product_id
)
select * from product_summary
 order by product_id;

-- Data-equivalence check: legacy application filtering vs the SQL aggregation.
create temp table bench_legacy_summary as
with valid_vehicle as (
  select vehicle.product_id, vehicle.product_variant_id
    from bench_vehicle_variants vehicle
   where vehicle.product_type in ('CAR', 'BIKE')
     and vehicle.product_variant_id is not null
     and (
       btrim(coalesce(vehicle.sku, '')) <> ''
       or btrim(coalesce(vehicle.variant_name, '')) <> ''
       or btrim(coalesce(vehicle.version, '')) <> ''
     )
     and btrim(coalesce(vehicle.color, '')) <> ''
), filtered as (
  select product.id as product_id,
         variant.id as variant_id,
         variant.sku,
         variant.is_active,
         inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.product_type not in ('CAR', 'BIKE')
      or exists (
        select 1
          from valid_vehicle
         where valid_vehicle.product_id = product.id
           and valid_vehicle.product_variant_id = variant.id
      )
)
select product_id,
       (array_agg(sku order by is_active desc, variant_id))[1] as active_sku,
       count(*)::bigint as inventory_variant_count,
       coalesce(sum(greatest(coalesce(on_hand_quantity, 0), 0)), 0)::bigint as inventory_quantity
  from filtered
 group by product_id;

create temp table bench_rpc_summary as
with eligible_variants as (
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.product_type not in ('CAR', 'BIKE')
  union all
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    join bench_vehicle_variants vehicle
      on vehicle.product_id = product.id
     and vehicle.product_variant_id = variant.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.product_type in ('CAR', 'BIKE')
     and vehicle.product_type in ('CAR', 'BIKE')
     and (
       btrim(coalesce(vehicle.sku, '')) <> ''
       or btrim(coalesce(vehicle.variant_name, '')) <> ''
       or btrim(coalesce(vehicle.version, '')) <> ''
     )
     and btrim(coalesce(vehicle.color, '')) <> ''
), product_summary as (
  select product_id,
         (array_agg(sku order by is_active desc, variant_id))[1] as active_sku,
         count(variant_id)::bigint as inventory_variant_count,
         coalesce(sum(greatest(coalesce(on_hand_quantity, 0), 0)), 0)::bigint as inventory_quantity
    from eligible_variants
   group by product_id
)
select * from product_summary;

select count(*) as summary_mismatch_count
  from (
    (select * from bench_legacy_summary except select * from bench_rpc_summary)
    union all
    (select * from bench_rpc_summary except select * from bench_legacy_summary)
  ) mismatch;

select count(*) as fake_products,
       (select count(*) from bench_product_variants) as fake_variants,
       (select count(*) from bench_vehicle_variants) as fake_vehicle_rows,
       (select count(*) from bench_inventory_items) as fake_inventory_rows
  from bench_products;

-- Page-sized comparison: /admin/products currently requests ten products per
-- page. The old implementation needed both a variant/inventory query and a
-- vehicle metadata query; the RPC replaces both with one aggregate query.
select 'legacy_page_variant_rows' as benchmark;
explain (analyze, buffers, timing off)
select product.id,
       product.product_type,
       variant.id as variant_id,
       variant.sku,
       variant.is_active,
       inventory.on_hand_quantity
  from bench_products product
  join bench_product_variants variant on variant.product_id = product.id
  left join bench_inventory_items inventory on inventory.variant_id = variant.id
 where product.id <= 10
 order by product.id, variant.id;

select 'legacy_page_vehicle_rows' as benchmark;
explain (analyze, buffers, timing off)
select product_id,
       product_variant_id,
       product_type,
       sku,
       variant_name,
       version,
       color
  from bench_vehicle_variants
 where product_id <= 10
 order by product_id, product_variant_id;

select 'rpc_aggregate_page' as benchmark;
explain (analyze, buffers, timing off)
with eligible_variants as (
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.id <= 10
     and product.product_type not in ('CAR', 'BIKE')
  union all
  select product.id as product_id, variant.id as variant_id, variant.sku,
         variant.is_active, inventory.on_hand_quantity
    from bench_products product
    join bench_product_variants variant on variant.product_id = product.id
    join bench_vehicle_variants vehicle
      on vehicle.product_id = product.id
     and vehicle.product_variant_id = variant.id
    left join bench_inventory_items inventory on inventory.variant_id = variant.id
   where product.id <= 10
     and product.product_type in ('CAR', 'BIKE')
     and vehicle.product_type in ('CAR', 'BIKE')
     and (
       btrim(coalesce(vehicle.sku, '')) <> ''
       or btrim(coalesce(vehicle.variant_name, '')) <> ''
       or btrim(coalesce(vehicle.version, '')) <> ''
     )
     and btrim(coalesce(vehicle.color, '')) <> ''
), product_summary as (
  select product_id,
         (array_agg(sku order by is_active desc, variant_id))[1] as active_sku,
         count(variant_id)::bigint as inventory_variant_count,
         coalesce(sum(greatest(coalesce(on_hand_quantity, 0), 0)), 0)::bigint as inventory_quantity
    from eligible_variants
   group by product_id
)
select * from product_summary
 order by product_id;

rollback;
