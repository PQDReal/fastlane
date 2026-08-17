begin;

-- SKU-only media boundary. The v2 aggregate writer is retained for the
-- existing taxonomy/media schema; v3 performs the direct-media preflight
-- before v2 opens any mutation path.
create or replace function public.save_admin_accessory_product_v3(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_variant jsonb;
  v_image_urls jsonb;
  v_variant_index integer := 0;
  v_invalid_count integer;
begin
  if jsonb_typeof(target_payload) <> 'object'
     or jsonb_typeof(target_payload -> 'variants') <> 'array'
     or jsonb_array_length(target_payload -> 'variants') < 1 then
    raise exception using errcode = '22023', message = 'Accessory SKU media payload is incomplete.';
  end if;

  for v_variant in
    select item.value
      from jsonb_array_elements(target_payload -> 'variants') item(value)
  loop
    v_image_urls := v_variant -> 'imageUrls';
    if jsonb_typeof(v_variant) is distinct from 'object'
       or jsonb_typeof(v_image_urls) is distinct from 'array' then
      raise exception using
        errcode = '23514',
        message = format('variants.%s.imageUrls must contain 1 to 20 direct URLs.', v_variant_index);
    end if;
    if jsonb_array_length(v_image_urls) < 1
       or jsonb_array_length(v_image_urls) > 20 then
      raise exception using
        errcode = '23514',
        message = format('variants.%s.imageUrls must contain 1 to 20 direct URLs.', v_variant_index);
    end if;

    select count(*)
      into v_invalid_count
      from jsonb_array_elements_text(v_image_urls) url(value)
     where url.value !~* '^https?://[^[:space:]]+$';
    if v_invalid_count > 0 then
      raise exception using
        errcode = '23514',
        message = format('variants.%s.imageUrls must contain HTTP or HTTPS URLs.', v_variant_index);
    end if;

    select count(*) - count(distinct url.value)
      into v_invalid_count
      from jsonb_array_elements_text(v_image_urls) url(value);
    if v_invalid_count > 0 then
      raise exception using
        errcode = '23514',
        message = format('variants.%s.imageUrls must not contain duplicates.', v_variant_index);
    end if;
    v_variant_index := v_variant_index + 1;
  end loop;

  return public.save_admin_accessory_product_v2(
    target_product_id,
    expected_updated_at,
    target_payload
  );
end
$function$;

revoke all on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb)
  to service_role;

comment on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb) is
  'SKU-only accessory writer: validates direct variant media before delegating to the aggregate writer.';

commit;
