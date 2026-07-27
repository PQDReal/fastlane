-- Allow one promotion to target multiple product types.
-- Keep applicable_product_type during the transition for backward compatibility.

alter table public.promotions
  add column if not exists applicable_product_types text[];

update public.promotions
set applicable_product_types = case
  when applicable_product_type = 'ALL'
    then array['CAR', 'BIKE', 'ACCESSORY']::text[]
  when applicable_product_type in ('CAR', 'BIKE', 'ACCESSORY')
    then array[applicable_product_type]::text[]
  else array['CAR', 'BIKE', 'ACCESSORY']::text[]
end
where applicable_product_types is null
   or cardinality(applicable_product_types) = 0;

alter table public.promotions
  alter column applicable_product_types
  set default array['CAR', 'BIKE', 'ACCESSORY']::text[],
  alter column applicable_product_types set not null;

alter table public.promotions
  drop constraint if exists promotions_applicable_product_types_check;

alter table public.promotions
  add constraint promotions_applicable_product_types_check
  check (
    cardinality(applicable_product_types) between 1 and 3
    and applicable_product_types <@ array['CAR', 'BIKE', 'ACCESSORY']::text[]
  );

create index if not exists promotions_applicable_product_types_gin_idx
  on public.promotions using gin (applicable_product_types);
