-- Migration 046: reconcile the tracked promotion trigger with the live
-- GLOBAL/PER_USER model and remove direct access to SECURITY DEFINER helpers.
-- Migration 038 remains historical and must not be applied manually after
-- this migration; normal chronological migration execution is safe.

begin;

do $preflight$
declare
  v_missing text[];
begin
  if to_regclass('public.promotions') is null
     or to_regclass('public.promotion_user_usage') is null
     or to_regclass('public.deposit_orders') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_046_PREREQUISITE_TABLE_MISSING';
  end if;

  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(array[
      'id', 'code', 'type', 'value', 'starts_at', 'ends_at', 'is_active',
      'max_discount_amount', 'minimum_order_amount', 'usage_limit',
      'used_count', 'usage_scope', 'target_user_id', 'updated_at'
    ]) as required_columns(required_column)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = 'public.promotions'::regclass
        and attribute.attname = required_column
        and not attribute.attisdropped
   );
  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_046_PROMOTION_COLUMN_MISSING',
      detail = array_to_string(v_missing, ', ');
  end if;

  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(array[
      'promotion_id', 'user_id', 'used_count', 'updated_at'
    ]) as required_columns(required_column)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = 'public.promotion_user_usage'::regclass
        and attribute.attname = required_column
        and not attribute.attisdropped
   );
  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_046_PROMOTION_USAGE_COLUMN_MISSING',
      detail = array_to_string(v_missing, ', ');
  end if;
end;
$preflight$;

-- Remove the obsolete overload. Keeping both integer and bigint versions
-- exposes two RPCs and permits caller-controlled quota consumption.
drop function if exists public.consume_per_user_promotion(uuid, uuid, integer);

create or replace function public.consume_per_user_promotion(
  p_promotion_id uuid,
  p_user_id uuid,
  p_usage_limit bigint
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  if p_promotion_id is null
     or p_user_id is null
     or p_usage_limit is null
     or p_usage_limit < 1
     or p_usage_limit > 2147483647 then
    raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_INVALID';
  end if;

  insert into public.promotion_user_usage (promotion_id, user_id, used_count)
  values (p_promotion_id, p_user_id, 0)
  on conflict (promotion_id, user_id) do nothing;

  select usage.used_count
    into v_used
    from public.promotion_user_usage usage
   where usage.promotion_id = p_promotion_id
     and usage.user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_ROW_MISSING';
  end if;
  if v_used >= p_usage_limit then
    raise exception using errcode = 'P0001', message = 'PROMOTION_USER_USAGE_LIMIT';
  end if;

  update public.promotion_user_usage
     set used_count = used_count + 1,
         updated_at = clock_timestamp()
   where promotion_id = p_promotion_id
     and user_id = p_user_id;
end;
$$;

create or replace function public.consume_deposit_order_promotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  promotion_row public.promotions%rowtype;
  expected_discount numeric;
begin
  if new.subtotal is null or new.subtotal < 0 then
    raise exception using errcode = 'P0001', message = 'PROMOTION_SUBTOTAL_INVALID';
  end if;

  if new.promotion_id is null then
    if new.promotion_code is not null
       or coalesce(new.discount_amount, 0) <> 0
       or new.total_estimated_price is distinct from new.subtotal then
      raise exception using errcode = 'P0001', message = 'PROMOTION_SNAPSHOT_REQUIRED';
    end if;
    return new;
  end if;

  select *
    into promotion_row
    from public.promotions
   where id = new.promotion_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROMOTION_NOT_FOUND';
  end if;
  if not promotion_row.is_active then
    raise exception using errcode = 'P0001', message = 'PROMOTION_INACTIVE';
  end if;
  if clock_timestamp() < promotion_row.starts_at then
    raise exception using errcode = 'P0001', message = 'PROMOTION_NOT_STARTED';
  end if;
  if promotion_row.ends_at is not null
     and clock_timestamp() >= promotion_row.ends_at then
    raise exception using errcode = 'P0001', message = 'PROMOTION_EXPIRED';
  end if;
  if new.subtotal < coalesce(promotion_row.minimum_order_amount, 0) then
    raise exception using errcode = 'P0001', message = 'PROMOTION_MINIMUM_NOT_MET';
  end if;

  expected_discount := case promotion_row.type::text
    when 'PERCENT' then round(new.subtotal * promotion_row.value / 100)
    when 'FIXED' then round(promotion_row.value)
    else null
  end;
  if expected_discount is null then
    raise exception using errcode = 'P0001', message = 'PROMOTION_TYPE_UNSUPPORTED';
  end if;
  if promotion_row.max_discount_amount is not null then
    expected_discount := least(expected_discount, promotion_row.max_discount_amount);
  end if;
  expected_discount := greatest(0, least(expected_discount, new.subtotal));

  if upper(btrim(coalesce(new.promotion_code, ''))) <> upper(btrim(promotion_row.code))
     or new.discount_amount is distinct from expected_discount
     or new.total_estimated_price is distinct from new.subtotal - expected_discount then
    raise exception using errcode = 'P0001', message = 'PROMOTION_SNAPSHOT_MISMATCH';
  end if;

  if promotion_row.usage_scope = 'PER_USER' then
    if new.customer_id is null
       or (promotion_row.target_user_id is not null
           and promotion_row.target_user_id <> new.customer_id) then
      raise exception using errcode = 'P0001', message = 'PROMOTION_USER_NOT_ELIGIBLE';
    end if;
    if promotion_row.usage_limit is not null then
      perform public.consume_per_user_promotion(
        promotion_row.id,
        new.customer_id,
        promotion_row.usage_limit
      );
    end if;
  elsif promotion_row.usage_scope = 'GLOBAL' then
    if promotion_row.usage_limit is not null
       and promotion_row.used_count >= promotion_row.usage_limit then
      raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_EXHAUSTED';
    end if;
    update public.promotions
       set used_count = used_count + 1,
           updated_at = clock_timestamp()
     where id = promotion_row.id;
  else
    raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_SCOPE_UNSUPPORTED';
  end if;

  return new;
end;
$$;

-- Preserve the existing accessory-order behavior while ensuring callers
-- cannot invoke its quota helper directly through PostgREST.
create or replace function public.consume_order_per_user_promotion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  promotion_row public.promotions%rowtype;
begin
  if new.promotion_id is null or new.customer_id is null then
    return new;
  end if;

  select * into promotion_row
    from public.promotions
   where id = new.promotion_id
   for update;
  if not found or promotion_row.usage_scope <> 'PER_USER' then
    return new;
  end if;
  if promotion_row.target_user_id is not null
     and promotion_row.target_user_id <> new.customer_id then
    raise exception using errcode = 'P0001', message = 'PROMOTION_USER_NOT_ELIGIBLE';
  end if;
  if promotion_row.usage_limit is not null then
    perform public.consume_per_user_promotion(
      promotion_row.id,
      new.customer_id,
      promotion_row.usage_limit
    );
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_orders_consume_promotion on public.deposit_orders;
create trigger deposit_orders_consume_promotion
before insert on public.deposit_orders
for each row
execute function public.consume_deposit_order_promotion();

revoke all on function public.consume_per_user_promotion(uuid,uuid,bigint)
  from public, anon, authenticated;
revoke all on function public.consume_deposit_order_promotion()
  from public, anon, authenticated;
revoke all on function public.consume_order_per_user_promotion()
  from public, anon, authenticated;

grant execute on function public.consume_per_user_promotion(uuid,uuid,bigint)
  to service_role;
grant execute on function public.consume_deposit_order_promotion()
  to service_role;
grant execute on function public.consume_order_per_user_promotion()
  to service_role;

do $harden_price_helpers$
begin
  if to_regprocedure('public.refresh_product_displayed_price(uuid)') is not null then
    execute 'alter function public.refresh_product_displayed_price(uuid) set search_path = public, pg_temp';
    execute 'revoke all on function public.refresh_product_displayed_price(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.refresh_product_displayed_price(uuid) to service_role';
  end if;
  if to_regprocedure('public.sync_product_displayed_price()') is not null then
    execute 'alter function public.sync_product_displayed_price() set search_path = public, pg_temp';
    execute 'revoke all on function public.sync_product_displayed_price() from public, anon, authenticated';
    execute 'grant execute on function public.sync_product_displayed_price() to service_role';
  end if;
end;
$harden_price_helpers$;

comment on function public.consume_deposit_order_promotion() is
  'Atomically verifies the deposit price snapshot and consumes GLOBAL or PER_USER promotion quota.';
comment on function public.consume_per_user_promotion(uuid,uuid,bigint) is
  'Internal row-locked PER_USER promotion quota helper; callable only by service-role workflows.';

commit;
