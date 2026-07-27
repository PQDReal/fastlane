begin;

-- Some databases retained a guard function compiled when orders.showroom_id
-- existed, while the current orders table no longer has that column. Direct
-- field access fails at runtime on every order finalization. Compare the
-- optional legacy field through JSON instead: it remains immutable when
-- present and is harmless when absent.
create or replace function app_private.guard_order_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_item_count integer;
  v_vehicle_count integer;
  v_item_subtotal numeric(14,2);
begin
  if old.snapshot_finalized_at is null
     and new.snapshot_finalized_at is not null then
    select count(*),
           count(*) filter (where product_type_snapshot = 'VEHICLE'),
           coalesce(sum(line_subtotal), 0)
      into v_item_count, v_vehicle_count, v_item_subtotal
      from public.order_items
     where order_id = new.id;

    if v_item_count = 0 or new.subtotal <> v_item_subtotal then
      raise exception 'ORDER_ITEM_TOTAL_SNAPSHOT_MISMATCH' using errcode = '23514';
    end if;
    if new.source_cart_id is null then
      if v_item_count <> 1 or v_vehicle_count <> 1 then
        raise exception 'DIRECT_CHECKOUT_REQUIRES_ONE_VEHICLE_ITEM' using errcode = '23514';
      end if;
    elsif v_vehicle_count <> 0 or new.battery_rental_fee <> 0 then
      raise exception 'CART_CHECKOUT_REQUIRES_ACCESSORY_ITEMS_ONLY' using errcode = '23514';
    end if;
  end if;

  if old.snapshot_finalized_at is not null and (
    old.customer_id is distinct from new.customer_id
    or old.source_cart_id is distinct from new.source_cart_id
    or (to_jsonb(old) -> 'showroom_id')
       is distinct from (to_jsonb(new) -> 'showroom_id')
    or old.idempotency_key is distinct from new.idempotency_key
    or old.request_hash is distinct from new.request_hash
    or old.mock_payment_reference is distinct from new.mock_payment_reference
    or old.subtotal is distinct from new.subtotal
    or old.battery_rental_fee is distinct from new.battery_rental_fee
    or old.discount_amount is distinct from new.discount_amount
    or old.total_amount is distinct from new.total_amount
    or old.promotion_code_snapshot is distinct from new.promotion_code_snapshot
    or old.shipping_address is distinct from new.shipping_address
    or new.snapshot_finalized_at is null
  ) then
    raise exception 'ORDER_SNAPSHOT_IMMUTABLE' using errcode = '23514';
  end if;

  return new;
end;
$$;

commit;

-- Rollback guidance: restore the prior guard definition only in a database
-- where orders.showroom_id exists. Restoring its direct field reference on the
-- current schema reintroduces the checkout failure fixed here.
