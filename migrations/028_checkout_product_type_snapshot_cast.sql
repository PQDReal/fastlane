-- The catalog stores products.product_type as text, while order snapshots use
-- the public.product_type enum. Cast explicitly at the checkout boundary.

begin;

do $migration$
declare
  checkout_function record;
  function_definition text;
  patched_definition text;
  patched_count integer := 0;
begin
  for checkout_function in
    select procedure.oid
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'checkout_accessory_cart'
  loop
    function_definition := pg_get_functiondef(checkout_function.oid);

    if strpos(function_definition, 'product.product_type,') = 0 then
      raise exception
        'checkout_accessory_cart definition does not contain the expected product type snapshot expression';
    end if;

    patched_definition := replace(
      function_definition,
      'product.product_type,',
      'product.product_type::public.product_type,'
    );

    execute patched_definition;
    patched_count := patched_count + 1;
  end loop;

  if patched_count <> 2 then
    raise exception
      'Expected two checkout_accessory_cart overloads, patched %',
      patched_count;
  end if;
end
$migration$;

commit;

-- Rollback (removes the explicit cast from both overloads):
-- begin;
-- do $rollback$
-- declare
--   checkout_function record;
--   function_definition text;
-- begin
--   for checkout_function in
--     select procedure.oid
--     from pg_proc as procedure
--     join pg_namespace as namespace
--       on namespace.oid = procedure.pronamespace
--     where namespace.nspname = 'public'
--       and procedure.proname = 'checkout_accessory_cart'
--   loop
--     function_definition := pg_get_functiondef(checkout_function.oid);
--     execute replace(
--       function_definition,
--       'product.product_type::public.product_type,',
--       'product.product_type,'
--     );
--   end loop;
-- end
-- $rollback$;
-- commit;
