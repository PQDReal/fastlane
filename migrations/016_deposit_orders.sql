begin;

create schema if not exists app_private;

-- Fresh environments receive a compatible table. On the current Supabase
-- project this statement is a no-op: no existing business column is renamed,
-- removed, retyped, made nullable, or assigned a new default.
create table if not exists public.deposit_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_type text not null default 'personal',
  full_name text not null,
  company_name text,
  phone_number text not null,
  email text not null,
  id_card_number text not null,
  province text not null,
  ward text not null,
  car_model text not null,
  car_variant text not null,
  exterior_color text not null,
  interior_color text not null,
  optional_packages jsonb default '[]'::jsonb,
  showroom text not null default 'VinFast Landmark 81',
  sales_consultant text,
  payment_method text not null,
  deposit_amount numeric(14, 2) not null default 10000000,
  total_estimated_price numeric(14, 2) not null,
  status text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  customer_id uuid,
  vehicle_variant_id uuid
);

-- Add only technical fields required by the API and normalized catalog links.
-- Existing deposit data and legacy columns remain untouched.
alter table public.deposit_orders
  add column if not exists idempotency_key text,
  add column if not exists product_id uuid,
  add column if not exists variant_id uuid,
  add column if not exists vehicle_type text,
  add column if not exists terms_accepted_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_product_id_fkey'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_product_id_fkey
      foreign key (product_id) references public.products(id) on delete restrict;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_variant_id_fkey'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_variant_id_fkey
      foreign key (variant_id) references public.product_variants(id) on delete restrict;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_vehicle_type_check'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_vehicle_type_check
      check (vehicle_type is null or vehicle_type in ('car', 'motorbike'));
  end if;
end
$$;

create unique index if not exists deposit_orders_order_number_uidx
  on public.deposit_orders (order_number);

create unique index if not exists deposit_orders_idempotency_key_uidx
  on public.deposit_orders (idempotency_key)
  where idempotency_key is not null;

create index if not exists deposit_orders_customer_created_idx
  on public.deposit_orders (customer_id, created_at desc)
  where customer_id is not null;

create index if not exists deposit_orders_status_created_idx
  on public.deposit_orders (status, created_at desc);

create index if not exists deposit_orders_product_created_idx
  on public.deposit_orders (product_id, created_at desc)
  where product_id is not null;

create or replace function app_private.touch_deposit_order_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists deposit_orders_touch_updated_at
  on public.deposit_orders;
create trigger deposit_orders_touch_updated_at
before update on public.deposit_orders
for each row execute function app_private.touch_deposit_order_updated_at();

alter table public.deposit_orders enable row level security;
revoke all on public.deposit_orders from anon, authenticated;
grant usage on schema app_private to service_role;
grant all on public.deposit_orders to service_role;

notify pgrst, 'reload schema';

commit;
