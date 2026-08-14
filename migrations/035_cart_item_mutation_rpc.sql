begin;

-- Cart item mutations currently share the checkout contract that derives the
-- public cart version from carts.updated_at. Keep that contract unchanged in
-- this migration; a monotonic bigint version belongs to the checkout-v2
-- migration after both readers are deployed together.

create or replace function public.build_accessory_cart_snapshot_v1(
  p_cart_id uuid
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_cart public.carts%rowtype;
  v_items jsonb;
  v_subtotal numeric := 0;
begin
  select *
    into v_cart
    from public.carts cart
   where cart.id = p_cart_id
     and cart.status = 'ACTIVE';

  if not found then
    raise exception using errcode = 'P0001', message = 'CART_CHANGED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', variant.id,
        'variantId', variant.id,
        'productId', product.id,
        'productSlug', product.slug,
        'productName', product.name,
        'productKind', 'accessory',
        'purchaseTerms', jsonb_build_object(
          'paymentMode', 'full',
          'depositAmount', null,
          'initialPaymentWindowMinutes', 30,
          'balancePaymentWindowDays', null,
          'gracePeriodHours', null,
          'cancellationPolicy', jsonb_build_object(
            'customerCancellationAllowed', true,
            'customerCancellationCutoff', 'before_shipping',
            'refundPercentage', 100,
            'overdueRefundPercentage', 100,
            'cancellationFeeAmount', '0'
          )
        ),
        'sku', variant.sku,
        'variantAttributes', coalesce(
          (
            select jsonb_object_agg(option_group.code, option_value.code)
              from public.product_variant_option_values mapping
              join public.product_option_groups option_group
                on option_group.product_id = mapping.product_id
               and option_group.id = mapping.option_group_id
              join public.product_option_values option_value
                on option_value.product_id = mapping.product_id
               and option_value.option_group_id = mapping.option_group_id
               and option_value.id = mapping.option_value_id
             where mapping.product_id = variant.product_id
               and mapping.variant_id = variant.id
          ),
          '{}'::jsonb
        ),
        'selectedOptions', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'groupId', option_group.id,
                'groupCode', option_group.code,
                'groupName', option_group.name,
                'valueId', option_value.id,
                'valueCode', option_value.code,
                'valueName', option_value.name,
                'priceAdjustment', round(option_value.price_adjustment)::text
              )
              order by option_group.display_order, option_group.code,
                option_value.display_order, option_value.code
            )
              from public.product_variant_option_values mapping
              join public.product_option_groups option_group
                on option_group.product_id = mapping.product_id
               and option_group.id = mapping.option_group_id
              join public.product_option_values option_value
                on option_value.product_id = mapping.product_id
               and option_value.option_group_id = mapping.option_group_id
               and option_value.id = mapping.option_value_id
             where mapping.product_id = variant.product_id
               and mapping.variant_id = variant.id
          ),
          '[]'::jsonb
        ),
        'quantity', cart_item.quantity,
        'unitListPrice', round(variant.original_price)::text,
        'unitSalePrice', case
          when variant.sale_price is null then null
          else round(variant.sale_price)::text
        end,
        'unitOptionTotal', '0',
        'unitPrice', round(coalesce(variant.sale_price, variant.original_price))::text,
        'unitAmountDueNow', round(coalesce(variant.sale_price, variant.original_price))::text,
        'lineTotal', (round(coalesce(variant.sale_price, variant.original_price)) * cart_item.quantity)::text,
        'lineAmountDueNow', (round(coalesce(variant.sale_price, variant.original_price)) * cart_item.quantity)::text,
        'imageUrl', (
          select media.url
            from public.product_media media
           where media.product_id = product.id
             and media.variant_id = variant.id
             and media.media_type = 'IMAGE'
             and media.is_active
           order by media.display_order, media.id
           limit 1
        ),
        'availableQuantity', greatest(0, coalesce(inventory.on_hand_quantity, 0))
      )
      order by cart_item.variant_id
    ),
    '[]'::jsonb
  )
    into v_items
    from public.cart_items cart_item
    join public.product_variants variant
      on variant.id = cart_item.variant_id
    join public.products product
      on product.id = variant.product_id
    left join public.inventory_items inventory
      on inventory.variant_id = variant.id
   where cart_item.cart_id = v_cart.id;

  select coalesce(
    sum(round(coalesce(variant.sale_price, variant.original_price)) * cart_item.quantity),
    0
  )
    into v_subtotal
    from public.cart_items cart_item
    join public.product_variants variant
      on variant.id = cart_item.variant_id
   where cart_item.cart_id = v_cart.id;

  return jsonb_build_object(
    'id', v_cart.id,
    'version', floor(extract(epoch from v_cart.updated_at) * 1000)::bigint,
    'pricedAt', clock_timestamp(),
    'items', v_items,
    'promotion', null,
    'pricing', jsonb_build_object(
      'currency', 'VND',
      'subtotal', round(v_subtotal)::text,
      'discountTotal', '0',
      'grandTotal', round(v_subtotal)::text,
      'amountDueNow', round(v_subtotal)::text,
      'balanceDue', '0'
    )
  );
end
$function$;

create or replace function public.mutate_accessory_cart_item_v1(
  p_customer_id uuid,
  p_variant_id uuid,
  p_operation text,
  p_quantity integer default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_cart public.carts%rowtype;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_existing_quantity integer;
  v_target_quantity integer;
  v_inventory integer;
  v_deleted integer := 0;
  v_operation text := upper(trim(coalesce(p_operation, '')));
  v_changed boolean := false;
begin
  if p_customer_id is null or p_variant_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if v_operation not in ('ADD', 'SET', 'REMOVE') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if v_operation = 'REMOVE' then
    if p_quantity is not null then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;

    select *
      into v_cart
      from public.carts cart
     where cart.customer_id = p_customer_id
       and cart.status = 'ACTIVE'
     order by cart.updated_at desc
     limit 1
     for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
    end if;

    delete from public.cart_items cart_item
     where cart_item.cart_id = v_cart.id
       and cart_item.variant_id = p_variant_id;

    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
      raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
    end if;

    update public.carts
       set updated_at = clock_timestamp()
     where id = v_cart.id;

    return public.build_accessory_cart_snapshot_v1(v_cart.id);
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  insert into public.carts (customer_id, status)
  values (p_customer_id, 'ACTIVE')
  on conflict (customer_id) where status = 'ACTIVE'::public.cart_status
  do nothing;

  select *
    into v_cart
    from public.carts cart
   where cart.customer_id = p_customer_id
     and cart.status = 'ACTIVE'
   order by cart.updated_at desc
   limit 1
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select variant.*
    into v_variant
    from public.product_variants variant
   where variant.id = p_variant_id;

  if found then
    select product.*
      into v_product
      from public.products product
     where product.id = v_variant.product_id;
  end if;

  if not found
     or not v_variant.is_active
     or not v_product.is_active
     or v_product.product_type <> 'ACCESSORY' then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select inventory.on_hand_quantity
    into v_inventory
    from public.inventory_items inventory
   where inventory.variant_id = p_variant_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select cart_item.quantity
    into v_existing_quantity
    from public.cart_items cart_item
   where cart_item.cart_id = v_cart.id
     and cart_item.variant_id = p_variant_id
   for update;

  if v_operation = 'ADD' then
    v_target_quantity := coalesce(v_existing_quantity, 0) + p_quantity;
  else
    v_target_quantity := p_quantity;
  end if;

  if v_target_quantity > 99 or v_target_quantity > v_inventory then
    raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK';
  end if;

  if v_existing_quantity is null then
    insert into public.cart_items (cart_id, variant_id, quantity)
    values (v_cart.id, p_variant_id, v_target_quantity);
    v_changed := true;
  elsif v_existing_quantity <> v_target_quantity then
    update public.cart_items
       set quantity = v_target_quantity
     where cart_id = v_cart.id
       and variant_id = p_variant_id;
    v_changed := true;
  end if;

  if v_changed then
    update public.carts
       set updated_at = clock_timestamp()
     where id = v_cart.id;
  end if;

  return public.build_accessory_cart_snapshot_v1(v_cart.id);
end
$function$;

revoke all on function public.build_accessory_cart_snapshot_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.build_accessory_cart_snapshot_v1(uuid)
  to service_role;
revoke all on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer)
  to service_role;

comment on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer) is
  'Atomic accessory cart item mutation. Validates inventory, serializes the customer cart and returns the canonical cart snapshot.';

commit;
