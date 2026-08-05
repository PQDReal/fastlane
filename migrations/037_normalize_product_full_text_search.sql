-- Keep public product search limited to normalized product names.
-- Equivalent inputs such as "VF9", "VF-9" and "VF 9" share the same lexemes.

create extension if not exists unaccent;

create or replace function public.fastlane_normalize_product_search(value text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(unaccent(coalesce(value, ''))),
          '([a-z])([0-9])',
          '\1 \2',
          'g'
        ),
        '([0-9])([a-z])',
        '\1 \2',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.fastlane_products_search_vector_update()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.search_vector := to_tsvector(
    'simple',
    public.fastlane_normalize_product_search(new.name)
  );
  return new;
end;
$$;

drop trigger if exists products_search_vector_update on public.products;

create trigger products_search_vector_update
before insert or update of name
on public.products
for each row
execute function public.fastlane_products_search_vector_update();

update public.products
set search_vector = to_tsvector(
  'simple',
  public.fastlane_normalize_product_search(name)
);

create index if not exists products_search_vector_idx
on public.products
using gin (search_vector);
