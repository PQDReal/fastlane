-- Keep the order-item snapshot guard compatible with the catalog's text
-- product type and the order snapshot's public.product_type enum.

begin;

do $migration$
declare
  guard_oid oid;
  function_definition text;
  patched_definition text;
begin
  select procedure.oid
    into guard_oid
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
   where namespace.nspname = 'app_private'
     and procedure.proname = 'guard_order_item_snapshot';

  if guard_oid is null then
    raise exception 'app_private.guard_order_item_snapshot does not exist';
  end if;

  function_definition := pg_get_functiondef(guard_oid);

  if strpos(
    function_definition,
    'p.product_type = new.product_type_snapshot'
  ) = 0 then
    raise exception
      'guard_order_item_snapshot definition does not contain the expected product type comparison';
  end if;

  patched_definition := replace(
    function_definition,
    'p.product_type = new.product_type_snapshot',
    'p.product_type = new.product_type_snapshot::text'
  );

  execute patched_definition;
end
$migration$;

commit;

-- Rollback:
-- begin;
-- do $rollback$
-- declare
--   guard_oid oid;
--   function_definition text;
-- begin
--   select procedure.oid
--     into guard_oid
--     from pg_proc as procedure
--     join pg_namespace as namespace
--       on namespace.oid = procedure.pronamespace
--    where namespace.nspname = 'app_private'
--      and procedure.proname = 'guard_order_item_snapshot';
--
--   function_definition := pg_get_functiondef(guard_oid);
--   execute replace(
--     function_definition,
--     'p.product_type = new.product_type_snapshot::text',
--     'p.product_type = new.product_type_snapshot'
--   );
-- end
-- $rollback$;
-- commit;
