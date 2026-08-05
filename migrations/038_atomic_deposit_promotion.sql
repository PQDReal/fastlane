-- Consume promotion quota in the same PostgreSQL transaction that creates a
-- deposit order. The row lock prevents concurrent car and motorbike deposits
-- from exceeding usage_limit, while a failed insert rolls the increment back.

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
  if new.promotion_id is null then
    if new.promotion_code is not null or coalesce(new.discount_amount, 0) <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'PROMOTION_SNAPSHOT_REQUIRED';
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
  if promotion_row.usage_limit is not null
     and promotion_row.used_count >= promotion_row.usage_limit then
    raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_EXHAUSTED';
  end if;
  if new.subtotal < coalesce(promotion_row.minimum_order_amount, 0) then
    raise exception using errcode = 'P0001', message = 'PROMOTION_MINIMUM_NOT_MET';
  end if;

  expected_discount := case promotion_row.type::text
    when 'PERCENT' then round(new.subtotal * promotion_row.value / 100)
    when 'FIXED' then round(promotion_row.value)
    else 0
  end;
  if promotion_row.max_discount_amount is not null then
    expected_discount := least(
      expected_discount,
      promotion_row.max_discount_amount
    );
  end if;
  expected_discount := greatest(0, least(expected_discount, new.subtotal));

  if upper(btrim(coalesce(new.promotion_code, ''))) <> promotion_row.code
     or new.discount_amount <> expected_discount
     or new.total_estimated_price <> new.subtotal - expected_discount then
    raise exception using
      errcode = 'P0001',
      message = 'PROMOTION_SNAPSHOT_MISMATCH';
  end if;

  update public.promotions
     set used_count = used_count + 1,
         updated_at = clock_timestamp()
   where id = promotion_row.id;

  return new;
end;
$$;

drop trigger if exists deposit_orders_consume_promotion
  on public.deposit_orders;

create trigger deposit_orders_consume_promotion
before insert on public.deposit_orders
for each row
execute function public.consume_deposit_order_promotion();

revoke all on function public.consume_deposit_order_promotion() from public;
grant execute on function public.consume_deposit_order_promotion() to service_role;

comment on function public.consume_deposit_order_promotion() is
  'Atomically validates and consumes one promotion use for a deposit order insert.';
