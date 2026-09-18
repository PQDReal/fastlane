begin;

-- Replace the original all-items checkout with an explicit selected-items
-- checkout. This migration is intentionally separate because 001 may already
-- have been applied in shared Supabase environments.
drop function if exists public.checkout_accessory_cart(
  uuid,
  text,
  text,
  bigint,
  numeric,
  jsonb
);

create function public.checkout_accessory_cart(
  p_customer_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_expected_cart_version bigint,
  p_accepted_total numeric,
  p_shipping_address jsonb,
  p_cart_item_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_order public.orders%rowtype;
  v_cart public.carts%rowtype;
  v_order public.orders%rowtype;
  v_current_version bigint;
  v_subtotal numeric;
  v_selected_count integer;
begin
  if p_customer_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_cart_item_ids is null or cardinality(p_cart_item_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'CART_EMPTY';
  end if;
  if cardinality(p_cart_item_ids) <> (
    select count(distinct selected.selected_id)
      from unnest(p_cart_item_ids) as selected(selected_id)
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select *
    into v_existing_order
    from public.orders
   where customer_id = p_customer_id
     and idempotency_key = p_idempotency_key
   limit 1;

  if found then
    if v_existing_order.request_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return jsonb_build_object('orderId', v_existing_order.id);
  end if;

  select *
    into v_cart
    from public.carts
   where customer_id = p_customer_id
     and status = 'ACTIVE'
   order by updated_at desc
   limit 1
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CART_EMPTY';
  end if;

  v_current_version := floor(extract(epoch from v_cart.updated_at) * 1000)::bigint;
  if v_current_version <> p_expected_cart_version then
    raise exception using errcode = 'P0001', message = 'CART_CHANGED';
  end if;

  select count(*)
    into v_selected_count
    from public.cart_items cart_item
   where cart_item.cart_id = v_cart.id
     and cart_item.id = any(p_cart_item_ids);

  if v_selected_count <> cardinality(p_cart_item_ids) then
    raise exception using errcode = 'P0001', message = 'CART_CHANGED';
  end if;

  perform inventory.variant_id
    from public.cart_items cart_item
    join public.product_variants variant on variant.id = cart_item.variant_id
    join public.products product on product.id = variant.product_id
    join public.inventory_items inventory on inventory.variant_id = variant.id
   where cart_item.cart_id = v_cart.id
     and cart_item.id = any(p_cart_item_ids)
   for update of inventory;

  if exists (
    select 1
      from public.cart_items cart_item
      left join public.product_variants variant on variant.id = cart_item.variant_id
      left join public.products product on product.id = variant.product_id
      left join public.inventory_items inventory on inventory.variant_id = variant.id
     where cart_item.cart_id = v_cart.id
       and cart_item.id = any(p_cart_item_ids)
       and (
         variant.id is null
         or product.id is null
         or inventory.variant_id is null
         or not variant.is_active
         or not product.is_active
         or product.product_type <> 'ACCESSORY'
       )
  ) then
    raise exception using errcode = 'P0001', message = 'CART_CHANGED';
  end if;

  if exists (
    select 1
      from public.cart_items cart_item
      join public.inventory_items inventory on inventory.variant_id = cart_item.variant_id
     where cart_item.cart_id = v_cart.id
       and cart_item.id = any(p_cart_item_ids)
       and inventory.on_hand_quantity < cart_item.quantity
  ) then
    raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK';
  end if;

  select coalesce(
           sum(round(coalesce(variant.sale_price, variant.original_price)) * cart_item.quantity),
           0
         )
    into v_subtotal
    from public.cart_items cart_item
    join public.product_variants variant on variant.id = cart_item.variant_id
   where cart_item.cart_id = v_cart.id
     and cart_item.id = any(p_cart_item_ids);

  if v_subtotal <> p_accepted_total then
    raise exception using errcode = 'P0001', message = 'PRICE_CHANGED';
  end if;

  insert into public.orders (
    customer_id,
    source_cart_id,
    status,
    idempotency_key,
    request_hash,
    subtotal,
    battery_rental_fee,
    discount_amount,
    total_amount,
    shipping_address,
    snapshot_finalized_at
  ) values (
    p_customer_id,
    v_cart.id,
    'PENDING',
    p_idempotency_key,
    p_request_hash,
    v_subtotal,
    0,
    0,
    v_subtotal,
    p_shipping_address,
    clock_timestamp()
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    variant_id,
    product_type_snapshot,
    sku_snapshot,
    product_name_snapshot,
    variant_name_snapshot,
    unit_price,
    quantity,
    line_subtotal
  )
  select
    v_order.id,
    variant.id,
    product.product_type,
    variant.sku,
    product.name,
    variant.name,
    round(coalesce(variant.sale_price, variant.original_price)),
    cart_item.quantity,
    round(coalesce(variant.sale_price, variant.original_price)) * cart_item.quantity
  from public.cart_items cart_item
  join public.product_variants variant on variant.id = cart_item.variant_id
  join public.products product on product.id = variant.product_id
  where cart_item.cart_id = v_cart.id
    and cart_item.id = any(p_cart_item_ids);

  update public.inventory_items inventory
     set on_hand_quantity = inventory.on_hand_quantity - cart_item.quantity,
         updated_at = clock_timestamp()
    from public.cart_items cart_item
   where cart_item.cart_id = v_cart.id
     and cart_item.id = any(p_cart_item_ids)
     and inventory.variant_id = cart_item.variant_id;

  delete from public.cart_items cart_item
   where cart_item.cart_id = v_cart.id
     and cart_item.id = any(p_cart_item_ids);

  if exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    update public.carts
       set updated_at = clock_timestamp()
     where id = v_cart.id;
  else
    update public.carts
       set status = 'CONVERTED',
           updated_at = clock_timestamp()
     where id = v_cart.id;
  end if;

  return jsonb_build_object('orderId', v_order.id);
end;
$$;

revoke all on function public.checkout_accessory_cart(
  uuid,
  text,
  text,
  bigint,
  numeric,
  jsonb,
  uuid[]
) from public, anon, authenticated;
grant execute on function public.checkout_accessory_cart(
  uuid,
  text,
  text,
  bigint,
  numeric,
  jsonb,
  uuid[]
) to service_role;

commit;

-- Rollback restores the all-items function only by re-running migration 001.
-- begin;
-- drop function if exists public.checkout_accessory_cart(uuid, text, text, bigint, numeric, jsonb, uuid[]);
-- commit;
