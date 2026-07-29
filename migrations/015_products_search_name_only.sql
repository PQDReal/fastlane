begin;

do $$
declare
  v_product_count integer;
  v_search_index_count integer;
  v_search_trigger_count integer;
begin
  select count(*) into v_product_count from public.products;
  if v_product_count <> 110 then
    raise exception using
      errcode = '23514',
      message = format('Expected 110 products before search-vector cutover, found %s.', v_product_count);
  end if;

  select count(*)
    into v_search_index_count
    from pg_catalog.pg_indexes index_definition
   where index_definition.schemaname = 'public'
     and index_definition.tablename = 'products'
     and index_definition.indexname = 'products_search_gin'
     and index_definition.indexdef ilike '%using gin (search_vector)%';

  select count(*)
    into v_search_trigger_count
    from pg_catalog.pg_trigger trigger_definition
   where trigger_definition.tgrelid = 'public.products'::regclass
     and trigger_definition.tgname = 'products_search_vector_write'
     and not trigger_definition.tgisinternal;

  if v_search_index_count <> 1 or v_search_trigger_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Expected products search GIN index and write trigger before cutover.';
  end if;
end;
$$;

create or replace function app_private.products_search_vector()
returns trigger
language plpgsql
set search_path = public, extensions, pg_catalog
as $$
begin
  new.search_vector := to_tsvector(
    'simple',
    unaccent(coalesce(new.name, ''))
  );
  return new;
end;
$$;

drop trigger products_search_vector_write on public.products;

create trigger products_search_vector_write
before insert or update of name
on public.products
for each row execute function app_private.products_search_vector();

update public.products product
   set search_vector = to_tsvector(
     'simple',
     unaccent(coalesce(product.name, ''))
   );

do $$
declare
  v_invalid_vector_count integer;
  v_search_index_count integer;
  v_trigger_definition text;
begin
  select count(*)
    into v_invalid_vector_count
    from public.products product
   where product.search_vector is distinct from to_tsvector(
     'simple',
     unaccent(coalesce(product.name, ''))
   );

  select count(*)
    into v_search_index_count
    from pg_catalog.pg_indexes index_definition
   where index_definition.schemaname = 'public'
     and index_definition.tablename = 'products'
     and index_definition.indexname = 'products_search_gin'
     and index_definition.indexdef ilike '%using gin (search_vector)%';

  select pg_catalog.pg_get_triggerdef(trigger_definition.oid, true)
    into v_trigger_definition
    from pg_catalog.pg_trigger trigger_definition
   where trigger_definition.tgrelid = 'public.products'::regclass
     and trigger_definition.tgname = 'products_search_vector_write'
     and not trigger_definition.tgisinternal;

  if v_invalid_vector_count <> 0
     or v_search_index_count <> 1
     or v_trigger_definition not ilike '%before insert or update of name on products%' then
    raise exception using
      errcode = '23514',
      message = format(
        'Name-only search verifier failed: invalid_vectors=%s, indexes=%s, trigger=%s.',
        v_invalid_vector_count,
        v_search_index_count,
        coalesce(v_trigger_definition, 'missing')
      );
  end if;
end;
$$;

commit;

-- Rollback procedure (review before use):
-- begin;
-- create or replace function app_private.products_search_vector()
-- returns trigger language plpgsql
-- set search_path = public, extensions, pg_catalog
-- as $rollback$
-- begin
--   new.search_vector := to_tsvector(
--     'simple',
--     unaccent(
--       coalesce(new.name, '') || ' ' ||
--       coalesce(new.description, '') || ' ' ||
--       new.specifications::text
--     )
--   );
--   return new;
-- end;
-- $rollback$;
-- drop trigger products_search_vector_write on public.products;
-- create trigger products_search_vector_write
-- before insert or update of name, description, specifications
-- on public.products
-- for each row execute function app_private.products_search_vector();
-- update public.products product
-- set search_vector = to_tsvector(
--   'simple',
--   unaccent(
--     coalesce(product.name, '') || ' ' ||
--     coalesce(product.description, '') || ' ' ||
--     product.specifications::text
--   )
-- );
-- commit;
