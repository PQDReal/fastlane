-- Chuẩn hóa dữ liệu màu và phụ thu theo từng vehicle variant.
-- Chạy migration này một lần trong Supabase SQL Editor.

alter table public.vehicle_variants
  add column if not exists color_type text not null default 'STANDARD',
  add column if not exists color_price_adjustment numeric(14,2) not null default 0,
  add column if not exists interior_color text;

-- Đồng bộ dữ liệu đã lưu trước đây trong specs.catalog vào các cột chuẩn.
update public.vehicle_variants
set
  color_type = case
    when upper(coalesce(specs #>> '{catalog,color_type}', '')) = 'ADVANCED'
      then 'ADVANCED'
    else 'STANDARD'
  end,
  color_price_adjustment = coalesce(
    nullif(regexp_replace(specs #>> '{catalog,color_price_adjustment}', '[^0-9.-]', '', 'g'), '')::numeric,
    0
  ),
  interior_color = nullif(btrim(specs #>> '{catalog,interior_color}'), '')
where specs is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_variants_color_type_check'
      and conrelid = 'public.vehicle_variants'::regclass
  ) then
    alter table public.vehicle_variants
      add constraint vehicle_variants_color_type_check
      check (color_type in ('STANDARD', 'ADVANCED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicle_variants_color_price_adjustment_check'
      and conrelid = 'public.vehicle_variants'::regclass
  ) then
    alter table public.vehicle_variants
      add constraint vehicle_variants_color_price_adjustment_check
      check (color_price_adjustment >= 0);
  end if;
end $$;

create index if not exists idx_vehicle_variants_configuration
  on public.vehicle_variants (product_id, version, color, interior_color)
  where is_active = true;

comment on column public.vehicle_variants.color_type is
  'Loại màu: STANDARD hoặc ADVANCED';
comment on column public.vehicle_variants.color_price_adjustment is
  'Phụ thu cố định của màu, tính trên giá phiên bản';
comment on column public.vehicle_variants.interior_color is
  'Màu nội thất áp dụng cho cấu hình biến thể';
