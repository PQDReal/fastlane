begin;

-- The API and runtime accept quantities from 1 through 99. Some environments
-- already had same-named 1-through-10 checks before migration 001, so its
-- IF NOT EXISTS guards correctly preserved those checks but could not widen
-- them. Audit all existing rows before replacing the named constraints.
do $quantity_contract$
declare
  v_invalid_cart_items bigint;
  v_invalid_order_items bigint;
begin
  select count(*)
    into v_invalid_cart_items
    from public.cart_items
   where quantity not between 1 and 99;

  select count(*)
    into v_invalid_order_items
    from public.order_items
   where quantity not between 1 and 99;

  if v_invalid_cart_items > 0 or v_invalid_order_items > 0 then
    raise exception using
      errcode = '23514',
      message = 'Checkout quantity contract preflight failed.',
      detail = format(
        'invalid cart item quantities=%s, invalid order item quantities=%s',
        v_invalid_cart_items,
        v_invalid_order_items
      ),
      hint = 'Repair quantities outside 1 through 99, then rerun migration 006.';
  end if;
end
$quantity_contract$;

alter table public.cart_items
  drop constraint if exists cart_items_quantity_valid;
alter table public.cart_items
  add constraint cart_items_quantity_valid
  check (quantity between 1 and 99) not valid;

alter table public.order_items
  drop constraint if exists order_items_quantity_valid;
alter table public.order_items
  add constraint order_items_quantity_valid
  check (quantity between 1 and 99) not valid;

alter table public.cart_items
  validate constraint cart_items_quantity_valid;
alter table public.order_items
  validate constraint order_items_quantity_valid;

commit;

-- Rollback guidance (review before use): restoring the previous 1-through-10
-- checks is only safe while both tables contain no quantity above 10. Audit
-- and repair such rows first, then run the following as one transaction:
--
-- begin;
-- do $quantity_contract_rollback$
-- declare
--   v_cart_items_above_ten bigint;
--   v_order_items_above_ten bigint;
-- begin
--   select count(*) into v_cart_items_above_ten
--     from public.cart_items where quantity not between 1 and 10;
--   select count(*) into v_order_items_above_ten
--     from public.order_items where quantity not between 1 and 10;
--   if v_cart_items_above_ten > 0 or v_order_items_above_ten > 0 then
--     raise exception using
--       errcode = '23514',
--       message = 'Cannot restore the 1-through-10 quantity checks.',
--       detail = format(
--         'invalid cart item quantities=%s, invalid order item quantities=%s',
--         v_cart_items_above_ten,
--         v_order_items_above_ten
--       );
--   end if;
-- end
-- $quantity_contract_rollback$;
-- alter table public.cart_items
--   drop constraint if exists cart_items_quantity_valid;
-- alter table public.cart_items
--   add constraint cart_items_quantity_valid
--   check (quantity between 1 and 10) not valid;
-- alter table public.order_items
--   drop constraint if exists order_items_quantity_valid;
-- alter table public.order_items
--   add constraint order_items_quantity_valid
--   check (quantity between 1 and 10) not valid;
-- alter table public.cart_items
--   validate constraint cart_items_quantity_valid;
-- alter table public.order_items
--   validate constraint order_items_quantity_valid;
-- commit;
