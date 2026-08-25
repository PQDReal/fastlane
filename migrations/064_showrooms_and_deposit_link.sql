begin;

create table if not exists public.showrooms (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'vinfast',
  source_entity_id text not null,
  store_id text not null,
  code text,
  vehicle_type text not null,
  name text not null,
  address text not null,
  province_source_id text,
  province_name text not null,
  district_source_id text,
  district_name text,
  latitude double precision not null,
  longitude double precision not null,
  hotline text,
  service_hotline text,
  sales_open_time text,
  sales_close_time text,
  service_open_time text,
  service_close_time text,
  management_mode text not null default 'IMPORT',
  is_active boolean not null default true,
  source_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint showrooms_source_nonblank check (btrim(source) <> ''),
  constraint showrooms_source_entity_nonblank check (btrim(source_entity_id) <> ''),
  constraint showrooms_store_nonblank check (btrim(store_id) <> ''),
  constraint showrooms_name_nonblank check (char_length(btrim(name)) between 2 and 180),
  constraint showrooms_address_nonblank check (char_length(btrim(address)) between 2 and 500),
  constraint showrooms_province_nonblank check (char_length(btrim(province_name)) between 2 and 120),
  constraint showrooms_vehicle_type_check check (vehicle_type in ('car', 'motorbike')),
  constraint showrooms_management_mode_check check (management_mode in ('IMPORT', 'ADMIN')),
  constraint showrooms_latitude_check check (latitude between -90 and 90),
  constraint showrooms_longitude_check check (longitude between -180 and 180),
  constraint showrooms_source_entity_unique unique (source, vehicle_type, source_entity_id),
  constraint showrooms_store_id_unique unique (store_id)
);

create index if not exists showrooms_active_vehicle_province_idx
  on public.showrooms (vehicle_type, province_name, name)
  where is_active;

create index if not exists showrooms_status_updated_idx
  on public.showrooms (is_active, updated_at desc);

create index if not exists showrooms_province_idx
  on public.showrooms (province_name, district_name);

create table if not exists public.showroom_audit_logs (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid not null references public.showrooms(id) on delete restrict,
  action text not null,
  actor_id uuid references public.users(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint showroom_audit_action_check
    check (action in ('CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'IMPORT', 'RECONCILE'))
);

create index if not exists showroom_audit_showroom_created_idx
  on public.showroom_audit_logs (showroom_id, created_at desc);

alter table public.deposit_orders
  add column if not exists showroom_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_showroom_id_fkey'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_showroom_id_fkey
      foreign key (showroom_id)
      references public.showrooms(id)
      on delete restrict
      not valid;
  end if;
end
$$;

create index if not exists deposit_orders_showroom_created_idx
  on public.deposit_orders (showroom_id, created_at desc)
  where showroom_id is not null;

alter table public.showrooms enable row level security;
alter table public.showroom_audit_logs enable row level security;

revoke all on table public.showrooms from public, anon, authenticated, service_role;
revoke all on table public.showroom_audit_logs from public, anon, authenticated, service_role;

grant select, insert, update on table public.showrooms to service_role;
grant select, insert on table public.showroom_audit_logs to service_role;

comment on table public.showrooms is
  'Canonical showroom master data shared by the public locator, vehicle deposit flow, and admin management.';
comment on column public.showrooms.management_mode is
  'IMPORT rows are reconciled from official JSON; ADMIN rows are protected from importer overwrite.';
comment on column public.deposit_orders.showroom_id is
  'Nullable for historical compatibility; new deposit orders must persist the canonical showroom reference.';
comment on column public.deposit_orders.showroom is
  'Immutable display-name snapshot retained for contracts and historical rendering.';

commit;

-- Rollback guidance:
-- Keep showrooms and showroom_id when rolling back the application so historical
-- deposit references and audit evidence remain intact. Disable new consumers
-- before considering a destructive schema rollback.
