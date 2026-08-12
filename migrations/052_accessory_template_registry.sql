-- Accessory template registry.
-- Template definitions move from the application registry into the database.
-- Product content remains a snapshot; the revision FK is provenance only.

create table if not exists public.accessory_templates (
  id uuid primary key default gen_random_uuid(),
  code varchar(80) not null unique,
  name varchar(200) not null,
  group_name varchar(100),
  description varchar(1000),
  display_order integer not null default 0,
  is_active boolean not null default true,
  current_version integer not null default 1,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accessory_templates_code_format
    check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint accessory_templates_display_order_check
    check (display_order >= 0),
  constraint accessory_templates_current_version_check
    check (current_version >= 1)
);

create table if not exists public.accessory_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.accessory_templates(id) on delete cascade,
  version integer not null,
  definition_schema varchar(50) not null default 'accessory_template_v1',
  definition jsonb not null,
  change_note varchar(500),
  created_by text,
  created_at timestamptz not null default now(),
  constraint accessory_template_versions_version_check check (version >= 1),
  constraint accessory_template_versions_schema_check
    check (definition_schema = 'accessory_template_v1'),
  unique (template_id, version)
);

create index if not exists accessory_template_versions_template_idx
  on public.accessory_template_versions(template_id, version desc);

alter table public.products
  add column if not exists accessory_template_version_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_accessory_template_version_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_accessory_template_version_id_fkey
      foreign key (accessory_template_version_id)
      references public.accessory_template_versions(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists products_accessory_template_version_idx
  on public.products(accessory_template_version_id)
  where accessory_template_version_id is not null;

-- Four current application templates become ordinary DB rows. The insert is
-- intentionally idempotent and does not overwrite an administrator's edits.
insert into public.accessory_templates
  (code, name, group_name, description, display_order, is_active, current_version)
values
  ('vehicle-fit', 'Phụ kiện lắp theo xe', 'Phụ kiện xe', 'Thảm, ốp, phụ kiện lắp đặt và các sản phẩm cần thông số phù hợp xe.', 10, true, 1),
  ('window-film', 'Film cách nhiệt', 'Phụ kiện xe', 'Thông tin film, vị trí dán, gói dịch vụ và điều kiện bảo hành.', 20, true, 1),
  ('apparel', 'Quần áo', 'Thời trang', 'Trang phục có màu, kích cỡ, chất liệu và hướng dẫn bảo quản.', 30, true, 1),
  ('ev-charger', 'Thiết bị sạc', 'Thiết bị điện', 'Thông số nguồn, đầu nối, bảo vệ và hướng dẫn sử dụng thiết bị sạc.', 40, true, 1)
on conflict (code) do nothing;

insert into public.accessory_template_versions
  (template_id, version, definition_schema, definition, change_note)
select t.id, 1, 'accessory_template_v1',
  case t.code
    when 'vehicle-fit' then $$
      {
        "schema": "accessory_template_v1",
        "suggestedCategorySlugs": ["phu-kien-o-to-dien"],
        "suggestedOptionCodes": ["color", "package"],
        "sections": [
          {"key":"specifications","type":"TECHNICAL_SPECS","title":"Thông số sản phẩm","attributes":["Vật liệu","Vị trí lắp đặt","Màu sắc / hoàn thiện","Kích thước","Trọng lượng"]},
          {"key":"advanced_specifications","type":"TECHNICAL_SPECS","title":"Thông số nâng cao","attributes":["Độ dày","Cấu trúc / kiểu dáng","Phương thức cố định","Tải trọng","Chứng nhận"]},
          {"key":"features","type":"FEATURES","title":"Đặc điểm nổi bật","items":[]},
          {"key":"package","type":"PACKAGE_CONTENTS","title":"Bộ sản phẩm","items":[]},
          {"key":"installation","type":"INSTALLATION_GUIDE","title":"Hướng dẫn lắp đặt","bodyPlaceholder":"Hướng dẫn lắp đặt và lưu ý cần thiết."},
          {"key":"safety","type":"SAFETY_NOTE","title":"Lưu ý an toàn","bodyPlaceholder":"Các lưu ý an toàn khi sử dụng."},
          {"key":"warranty","type":"WARRANTY","title":"Chính sách bảo hành","bodyPlaceholder":"Điều kiện và thời hạn bảo hành."}
        ]
      }
    $$::jsonb
    when 'window-film' then $$
      {
        "schema": "accessory_template_v1",
        "suggestedCategorySlugs": ["phu-kien-o-to-dien"],
        "suggestedOptionCodes": ["package"],
        "sections": [
          {"key":"specifications","type":"TECHNICAL_SPECS","title":"Thông số film","attributes":["Thương hiệu film","Dòng / phiên bản film","Vị trí áp dụng"]},
          {"key":"features","type":"FEATURES","title":"Đặc điểm nổi bật","items":[]},
          {"key":"warranty","type":"WARRANTY","title":"Chính sách bảo hành","bodyPlaceholder":"Điều kiện và thời hạn bảo hành."},
          {"key":"purchase","type":"PURCHASE_NOTE","title":"Lưu ý khi mua hàng","bodyPlaceholder":"Thông tin cần xác nhận trước khi đặt mua."}
        ]
      }
    $$::jsonb
    when 'apparel' then $$
      {
        "schema": "accessory_template_v1",
        "suggestedCategorySlugs": ["phong-cach-song"],
        "suggestedOptionCodes": ["color", "size"],
        "sections": [
          {"key":"specifications","type":"TECHNICAL_SPECS","title":"Thông số trang phục","attributes":["Chất liệu","Kiểu dáng / form","Xuất xứ","Kỹ thuật in / hoàn thiện"]},
          {"key":"features","type":"FEATURES","title":"Đặc điểm nổi bật","items":[]},
          {"key":"care","type":"CARE_GUIDE","title":"Hướng dẫn bảo quản","bodyPlaceholder":"Hướng dẫn giặt, phơi và bảo quản."}
        ]
      }
    $$::jsonb
    when 'ev-charger' then $$
      {
        "schema": "accessory_template_v1",
        "suggestedCategorySlugs": ["sac-o-to-dien"],
        "suggestedOptionCodes": [],
        "sections": [
          {"key":"specifications","type":"TECHNICAL_SPECS","title":"Thông số thiết bị sạc","attributes":["Công suất định mức / tối đa","Nguồn vào","Nguồn ra","Chuẩn đầu nối","Chiều dài cáp","Chế độ sạc","Cơ chế bảo vệ","Điều kiện vận hành / lưu trữ","Chứng nhận"]},
          {"key":"installation","type":"INSTALLATION_GUIDE","title":"Lắp đặt và sử dụng","bodyPlaceholder":"Hướng dẫn lắp đặt và sử dụng thiết bị."},
          {"key":"safety","type":"SAFETY_NOTE","title":"Lưu ý an toàn","bodyPlaceholder":"Các lưu ý an toàn khi sử dụng."},
          {"key":"warranty","type":"WARRANTY","title":"Chính sách bảo hành","bodyPlaceholder":"Điều kiện và thời hạn bảo hành."},
          {"key":"compatibility","type":"PURCHASE_NOTE","title":"Ghi chú tương thích","bodyPlaceholder":"Ví dụ: VF 3 cần adapter đi kèm."}
        ]
      }
    $$::jsonb
  end,
  'Seed từ registry mẫu phụ kiện hiện tại'
from public.accessory_templates t
where t.code in ('vehicle-fit', 'window-film', 'apparel', 'ev-charger')
  and not exists (
    select 1
    from public.accessory_template_versions v
    where v.template_id = t.id and v.version = 1
  );

-- Link existing products without rewriting their content or commercial data.
update public.products p
set accessory_template_version_id = v.id
from public.accessory_templates t
join public.accessory_template_versions v
  on v.template_id = t.id
 and v.version = 1
where p.accessory_template_version_id is null
  and p.product_type = 'ACCESSORY'
  and case p.accessory_template_code
    when 'vehicle_fit' then t.code = 'vehicle-fit'
    when 'window_film' then t.code = 'window-film'
    when 'apparel' then t.code = 'apparel'
    when 'ev_charger' then t.code = 'ev-charger'
    else false
  end;

alter table public.accessory_templates enable row level security;
alter table public.accessory_template_versions enable row level security;

revoke all on table public.accessory_templates from public, anon, authenticated, service_role;
revoke all on table public.accessory_template_versions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.accessory_templates to service_role;
grant select, insert, update, delete on table public.accessory_template_versions to service_role;

comment on table public.accessory_templates is 'Reusable accessory blueprints; product content is stored as an independent snapshot.';
comment on table public.accessory_template_versions is 'Immutable accessory blueprint revisions.';

-- Keep the existing aggregate writer as the source of truth and extend it in
-- the same transaction with the revision provenance column. The existing
-- runtime calls v3; this wrapper is deliberately additive for the rollout.
create or replace function public.save_admin_accessory_product_v4(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  saved jsonb;
  saved_product_id uuid;
  template_version_id uuid;
begin
  saved := public.save_admin_accessory_product_v3(
    target_product_id,
    expected_updated_at,
    -- Keep the legacy aggregate contract unchanged; provenance is written
    -- below in the same transaction after the snapshot has been saved.
    target_payload - 'templateVersionId'
  );
  saved_product_id := nullif(saved ->> 'id', '')::uuid;
  if target_payload ? 'templateVersionId' then
    template_version_id := nullif(target_payload ->> 'templateVersionId', '')::uuid;
    update public.products
       set accessory_template_version_id = template_version_id
     where id = saved_product_id;
  end if;
  return saved;
end;
$function$;

revoke all on function public.save_admin_accessory_product_v4(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product_v4(uuid, timestamptz, jsonb)
  to service_role;
