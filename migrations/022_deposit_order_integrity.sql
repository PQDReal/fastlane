begin;

-- Extend the existing deposit table without renaming or removing legacy
-- business columns. The live table already stores the promotion snapshot in
-- promotion_code, so this migration reuses that column instead of duplicating
-- it as promotion_code_snapshot.
alter table public.deposit_orders
  add column if not exists province_code text,
  add column if not exists ward_code text,
  add column if not exists request_hash text,
  add column if not exists subtotal numeric(14, 2),
  add column if not exists discount_amount numeric(14, 2) not null default 0,
  add column if not exists promotion_id uuid,
  add column if not exists promotion_code text;

create or replace function app_private.is_valid_vietnam_tax_id(value text)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  checksum integer;
begin
  if value !~ '^[0-9]{10}(-[0-9]{3})?$' then
    return false;
  end if;

  checksum :=
    substring(value, 1, 1)::integer * 31 +
    substring(value, 2, 1)::integer * 29 +
    substring(value, 3, 1)::integer * 23 +
    substring(value, 4, 1)::integer * 19 +
    substring(value, 5, 1)::integer * 17 +
    substring(value, 6, 1)::integer * 13 +
    substring(value, 7, 1)::integer * 7 +
    substring(value, 8, 1)::integer * 5 +
    substring(value, 9, 1)::integer * 3;

  return
    10 - (checksum % 11) between 0 and 9
    and substring(value, 10, 1)::integer = 10 - (checksum % 11);
end;
$$;

create or replace function app_private.is_valid_deposit_personal_id(value text)
returns boolean
language plpgsql
stable
strict
set search_path = pg_catalog
as $$
declare
  century_gender integer;
  birth_year integer;
begin
  if value ~ '^[0-9]{9}$' then
    return value !~ '^([0-9])\1{8}$';
  end if;
  if upper(value) ~ '^[A-Z][0-9]{7}$' then
    return upper(value) !~ '^[A-Z]0{7}$';
  end if;
  if value !~ '^[0-9]{12}$' or value ~ '^([0-9])\1{11}$' then
    return false;
  end if;
  if substring(value, 1, 3)::integer not between 1 and 96 then
    return false;
  end if;

  century_gender := substring(value, 4, 1)::integer;
  birth_year :=
    1900 +
    (century_gender / 2) * 100 +
    substring(value, 5, 2)::integer;
  return birth_year <= extract(year from current_date)::integer;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_product_variant_pair_fkey'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_product_variant_pair_fkey
      foreign key (product_id, variant_id)
      references public.product_variants(product_id, id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.deposit_orders'::regclass
       and conname = 'deposit_orders_promotion_id_fkey'
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_promotion_id_fkey
      foreign key (promotion_id)
      references public.promotions(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
declare
  constraint_name text;
  constraint_sql text;
begin
  for constraint_name, constraint_sql in
    values
      (
        'deposit_orders_full_name_nonblank',
        'check (
          char_length(btrim(full_name)) between 2 and 180 and
          full_name !~ ''[[:cntrl:]]''
        ) not valid'
      ),
      (
        'deposit_orders_customer_identity',
        'check (
          (
            customer_type::text = ''personal'' and
            company_name is null and
            char_length(btrim(full_name)) between 2 and 120 and
            full_name ~ ''[[:alpha:]]'' and
            full_name !~ ''[0-9<>]'' 
          )
          or
          (
            customer_type::text = ''corporate'' and
            char_length(btrim(company_name)) between 2 and 180 and
            company_name ~ ''[[:alpha:]]'' and
            company_name !~ ''[<>]''
          )
        ) not valid'
      ),
      (
        'deposit_orders_phone_vietnam',
        'check (phone_number ~ ''^0(3|5|7|8|9)[0-9]{8}$'') not valid'
      ),
      (
        'deposit_orders_email_normalized',
        'check (
          char_length(email) between 6 and 254 and
          email = lower(email) and
          email !~ ''\.\.'' and
          email ~ ''^[a-z0-9.!#$%&''''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$''
        ) not valid'
      ),
      (
        'deposit_orders_identity_by_customer_type',
        'check (
          (customer_type::text = ''personal'' and
            app_private.is_valid_deposit_personal_id(id_card_number))
          or
          (customer_type::text = ''corporate'' and
            app_private.is_valid_vietnam_tax_id(id_card_number))
        ) not valid'
      ),
      (
        'deposit_orders_location_names',
        'check (
          char_length(btrim(province)) between 2 and 120 and
          char_length(btrim(ward)) between 2 and 120 and
          province !~ ''[[:cntrl:]<>]'' and
          ward !~ ''[[:cntrl:]<>]''
        ) not valid'
      ),
      (
        'deposit_orders_location_codes',
        'check (
          (terms_accepted_at is null and
           province_code is null and
           ward_code is null)
          or
          (terms_accepted_at is not null and
           province_code ~ ''^[0-9]{1,12}$'' and
           ward_code ~ ''^[0-9]{1,12}$'')
        ) not valid'
      ),
      (
        'deposit_orders_optional_packages_array',
        'check (
          optional_packages is null or
          jsonb_typeof(optional_packages) = ''array''
        ) not valid'
      ),
      (
        'deposit_orders_quote_amounts',
        'check (
          (idempotency_key is null and subtotal is null)
          or
          (idempotency_key is not null and
           subtotal >= 0 and
           discount_amount >= 0 and
           discount_amount <= subtotal and
           total_estimated_price = subtotal - discount_amount and
           deposit_amount >= 0 and
           deposit_amount <= total_estimated_price)
        ) not valid'
      ),
      (
        'deposit_orders_promotion_consistency',
        'check (
          (promotion_id is null and
           promotion_code is null and
           discount_amount = 0)
          or
          (promotion_id is not null and
           btrim(promotion_code) <> '''' and
           discount_amount > 0)
        ) not valid'
      ),
      (
        'deposit_orders_request_hash_nonblank',
        'check (
          idempotency_key is null or
          (request_hash is not null and btrim(request_hash) <> '''')
        ) not valid'
      )
  loop
    if not exists (
      select 1
        from pg_constraint
       where conrelid = 'public.deposit_orders'::regclass
         and conname = constraint_name
    ) then
      execute format(
        'alter table public.deposit_orders add constraint %I %s',
        constraint_name,
        constraint_sql
      );
    end if;
  end loop;
end
$$;

create index if not exists deposit_orders_promotion_created_idx
  on public.deposit_orders (promotion_id, created_at desc)
  where promotion_id is not null;

create or replace function app_private.consume_deposit_promotion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  promotion_record record;
begin
  if new.promotion_id is null then
    return new;
  end if;

  select
    p.code,
    p.is_active,
    p.starts_at,
    p.ends_at,
    p.usage_limit,
    p.used_count
    into promotion_record
    from public.promotions p
   where p.id = new.promotion_id
   for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Deposit promotion does not exist';
  end if;
  if not promotion_record.is_active
     or clock_timestamp() < promotion_record.starts_at
     or (
       promotion_record.ends_at is not null
       and clock_timestamp() >= promotion_record.ends_at
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Deposit promotion is outside its active window';
  end if;
  if promotion_record.usage_limit is not null
     and promotion_record.used_count >= promotion_record.usage_limit
  then
    raise exception using
      errcode = '23514',
      message = 'Deposit promotion usage limit reached';
  end if;
  if upper(btrim(new.promotion_code)) <> upper(promotion_record.code) then
    raise exception using
      errcode = '23514',
      message = 'Deposit promotion snapshot does not match';
  end if;

  update public.promotions
     set used_count = used_count + 1,
         updated_at = clock_timestamp()
   where id = new.promotion_id;
  return new;
end;
$$;

drop trigger if exists deposit_orders_consume_promotion
  on public.deposit_orders;
create trigger deposit_orders_consume_promotion
before insert on public.deposit_orders
for each row execute function app_private.consume_deposit_promotion();

notify pgrst, 'reload schema';

commit;

-- Rollback (review before use):
-- alter table public.deposit_orders
--   drop constraint if exists deposit_orders_product_variant_pair_fkey,
--   drop constraint if exists deposit_orders_promotion_id_fkey,
--   drop constraint if exists deposit_orders_full_name_nonblank,
--   drop constraint if exists deposit_orders_customer_identity,
--   drop constraint if exists deposit_orders_phone_vietnam,
--   drop constraint if exists deposit_orders_email_normalized,
--   drop constraint if exists deposit_orders_identity_by_customer_type,
--   drop constraint if exists deposit_orders_location_names,
--   drop constraint if exists deposit_orders_location_codes,
--   drop constraint if exists deposit_orders_optional_packages_array,
--   drop constraint if exists deposit_orders_quote_amounts,
--   drop constraint if exists deposit_orders_promotion_consistency,
--   drop constraint if exists deposit_orders_request_hash_nonblank;
-- drop index if exists public.deposit_orders_promotion_created_idx;
-- drop trigger if exists deposit_orders_consume_promotion on public.deposit_orders;
-- drop function if exists app_private.consume_deposit_promotion();
-- drop function if exists app_private.is_valid_deposit_personal_id(text);
-- drop function if exists app_private.is_valid_vietnam_tax_id(text);
-- Columns are intentionally retained because orders may already reference them.
