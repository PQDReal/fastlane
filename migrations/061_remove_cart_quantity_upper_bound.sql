begin;

-- Quantities are now bounded by the selected variant's inventory only. Keep
-- the lower bound at one while removing the historical 99-item ceiling.
alter table public.cart_items
  drop constraint if exists cart_items_quantity_valid;
alter table public.cart_items
  add constraint cart_items_quantity_valid
  check (quantity >= 1) not valid;
alter table public.cart_items
  validate constraint cart_items_quantity_valid;

alter table public.order_items
  drop constraint if exists order_items_quantity_valid;
alter table public.order_items
  add constraint order_items_quantity_valid
  check (quantity >= 1) not valid;
alter table public.order_items
  validate constraint order_items_quantity_valid;

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
  v_user public.users%rowtype;
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

  select * into v_user
    from public.users app_user
   where app_user.id = p_customer_id
   for share;

  if not found or v_user.status::text <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if v_user.role::text not in ('CUSTOMER', 'ADMIN') then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_PERMISSION';
  end if;
  if v_operation not in ('ADD', 'SET', 'REMOVE') then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  if v_operation = 'REMOVE' then
    if p_quantity is not null then
      raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
    end if;
    select * into v_cart
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
    update public.carts set updated_at = clock_timestamp() where id = v_cart.id;
    return public.build_accessory_cart_snapshot_v1(v_cart.id);
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;

  insert into public.carts (customer_id, status)
  values (p_customer_id, 'ACTIVE')
  on conflict (customer_id) where status = 'ACTIVE'::public.cart_status do nothing;

  select * into v_cart
    from public.carts cart
   where cart.customer_id = p_customer_id
     and cart.status = 'ACTIVE'
   order by cart.updated_at desc
   limit 1
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select variant.* into v_variant
    from public.product_variants variant
   where variant.id = p_variant_id;
  if found then
    select product.* into v_product
      from public.products product
     where product.id = v_variant.product_id;
  end if;
  if not found
     or not v_variant.is_active
     or not v_product.is_active
     or v_product.product_type <> 'ACCESSORY' then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select inventory.on_hand_quantity into v_inventory
    from public.inventory_items inventory
   where inventory.variant_id = p_variant_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select cart_item.quantity into v_existing_quantity
    from public.cart_items cart_item
   where cart_item.cart_id = v_cart.id
     and cart_item.variant_id = p_variant_id
   for update;
  if v_operation = 'ADD' then
    v_target_quantity := coalesce(v_existing_quantity, 0) + p_quantity;
  else
    v_target_quantity := p_quantity;
  end if;
  if v_target_quantity > v_inventory then
    raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK';
  end if;

  if v_existing_quantity is null then
    insert into public.cart_items (cart_id, variant_id, quantity)
    values (v_cart.id, p_variant_id, v_target_quantity);
    v_changed := true;
  elsif v_existing_quantity <> v_target_quantity then
    update public.cart_items
       set quantity = v_target_quantity
     where cart_id = v_cart.id and variant_id = p_variant_id;
    v_changed := true;
  end if;
  if v_changed then
    update public.carts set updated_at = clock_timestamp() where id = v_cart.id;
  end if;
  return public.build_accessory_cart_snapshot_v1(v_cart.id);
end
$function$;

revoke all on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer)
  to service_role;

comment on function public.mutate_accessory_cart_item_v1(uuid, uuid, text, integer) is
  'Atomic accessory cart item mutation with inventory-bounded quantity.';

commit;
