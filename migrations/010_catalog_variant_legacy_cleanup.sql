begin;

-- Contract step: all catalog writers and verifiers must stop referencing
-- these columns before this migration is applied. Locking closes the race
-- between the null-data preflight and the destructive ALTER TABLE.
lock table public.product_variants in access exclusive mode;

do $catalog_variant_legacy_cleanup$
declare
  v_color_rows bigint;
  v_battery_rows bigint;
  v_dependencies text;
  v_function_dependencies text;
begin
  if to_regclass('public.product_variants') is null then
    raise exception using
      errcode = '42P01',
      message = 'Missing table public.product_variants.';
  end if;

  if not exists (
    select 1
      from pg_attribute
     where attrelid = 'public.product_variants'::regclass
       and attname = 'color'
       and attnum > 0
       and not attisdropped
  ) or not exists (
    select 1
      from pg_attribute
     where attrelid = 'public.product_variants'::regclass
       and attname = 'battery_option'
       and attnum > 0
       and not attisdropped
  ) then
    raise exception using
      errcode = '42703',
      message = 'Legacy variant columns are missing; migration 010 was already applied or the schema drifted.';
  end if;

  execute 'select count(*) from public.product_variants where color is not null'
    into v_color_rows;
  execute 'select count(*) from public.product_variants where battery_option is not null'
    into v_battery_rows;

  if v_color_rows > 0 or v_battery_rows > 0 then
    raise exception using
      errcode = '23514',
      message = 'Catalog variant legacy cleanup preflight failed.',
      detail = format(
        'product_variants.color non-null=%s, product_variants.battery_option non-null=%s',
        v_color_rows,
        v_battery_rows
      ),
      hint = 'Migrate the remaining values into normalized option tables before retrying migration 010.';
  end if;

  select string_agg(
           pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid),
           '; '
           order by pg_describe_object(dependency.classid, dependency.objid, dependency.objsubid)
         )
    into v_dependencies
    from pg_attribute attribute
    join pg_depend dependency
      on dependency.refclassid = 'pg_class'::regclass
     and dependency.refobjid = attribute.attrelid
     and dependency.refobjsubid = attribute.attnum
     and dependency.deptype in ('a', 'n')
   where attribute.attrelid = 'public.product_variants'::regclass
     and attribute.attname in ('color', 'battery_option')
     and attribute.attnum > 0
     and not attribute.attisdropped;

  if v_dependencies is not null then
    raise exception using
      errcode = '2BP01',
      message = 'Database objects still depend on legacy variant columns.',
      detail = v_dependencies,
      hint = 'Remove or migrate the listed dependencies, then retry migration 010.';
  end if;

  -- PL/pgSQL bodies are not guaranteed to register column-level pg_depend
  -- entries, so also fail closed on stored code that names the table and a
  -- legacy field. The expression uses SQL identifier boundaries, not a broad
  -- substring search.
  select string_agg(format('%I.%I', namespace.nspname, routine.proname), '; ' order by namespace.nspname, routine.proname)
    into v_function_dependencies
    from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
   where routine.prokind in ('f', 'p')
     and pg_get_functiondef(routine.oid) ~* '\mproduct_variants\M'
     and pg_get_functiondef(routine.oid) ~* '\m(color|battery_option)\M';

  if v_function_dependencies is not null then
    raise exception using
      errcode = '2BP01',
      message = 'Stored functions still reference legacy variant columns.',
      detail = v_function_dependencies,
      hint = 'Update the listed functions to normalized option data, then retry migration 010.';
  end if;
end
$catalog_variant_legacy_cleanup$;

alter table public.product_variants
  drop column color,
  drop column battery_option;

commit;

-- Rollback guidance (review before use): both removed columns were nullable
-- text and the migration refuses to run when either contains data. Recreate
-- their compatibility shape only if an old application release must run:
--
-- begin;
-- alter table public.product_variants
--   add column color text,
--   add column battery_option text;
-- commit;
