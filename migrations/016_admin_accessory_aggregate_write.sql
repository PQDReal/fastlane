begin;

-- API checks produce friendly conflicts; these indexes close the concurrent
-- create/update race for the two global catalog identities.
create unique index if not exists products_slug_case_insensitive_uidx
  on public.products (lower(slug));

create unique index if not exists product_variants_sku_case_insensitive_uidx
  on public.product_variants (lower(sku));

-- Writes the complete accessory aggregate in one PostgreSQL transaction. The
-- API validates shape and limits first; this function independently enforces
-- database ownership, taxonomy, identity, publication and relation rules.
create or replace function public.save_admin_accessory_product(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_product_id uuid;
  v_category_id uuid;
  v_primary_collection_id uuid;
  v_existing_updated_at timestamptz;
  v_updated_at timestamptz;
  v_product_type text;
  v_content jsonb;
  v_requested_count integer;
  v_resolved_count integer;
  v_group jsonb;
  v_group_id uuid;
  v_group_code text;
  v_value jsonb;
  v_value_id uuid;
  v_value_code text;
  v_variant jsonb;
  v_variant_id uuid;
  v_conflict_product_id uuid;
  v_signature text;
  v_mapping record;
  v_collection_id uuid;
  v_media_url jsonb;
  v_media_url_text text;
  v_media_count integer := 0;
  v_scope_order integer;
  v_displayed_price numeric;
  v_legacy_images jsonb;
  v_thumbnail_url text;
  v_now timestamptz := clock_timestamp();
begin
  if jsonb_typeof(target_payload) <> 'object'
     or not (target_payload ?& array[
       'categoryId', 'primaryCollectionId', 'modelCollectionIds', 'name', 'slug',
       'description', 'isActive', 'serviceLabelIds', 'content', 'optionGroups',
       'variants', 'productImageUrls'
     ]) then
    raise exception using
      errcode = '22023',
      message = 'Accessory payload is incomplete.';
  end if;

  if jsonb_typeof(target_payload -> 'modelCollectionIds') <> 'array'
     or jsonb_typeof(target_payload -> 'serviceLabelIds') <> 'array'
     or jsonb_typeof(target_payload -> 'optionGroups') <> 'array'
     or jsonb_typeof(target_payload -> 'variants') <> 'array'
     or jsonb_typeof(target_payload -> 'productImageUrls') <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Accessory payload arrays are invalid.';
  end if;

  v_category_id := (target_payload ->> 'categoryId')::uuid;
  v_primary_collection_id := (target_payload ->> 'primaryCollectionId')::uuid;

  perform category.id
    from public.categories category
   where category.id = v_category_id
     and category.slug = 'phu-kien'
     and category.is_active
   for key share;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'The root category must be the active accessory category.';
  end if;

  perform collection.id
    from public.catalog_collections collection
   where collection.id = v_primary_collection_id
     and collection.root_category_id = v_category_id
     and collection.kind = 'CATEGORY'
     and collection.parent_id is null
     and collection.is_active
   for key share;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'The primary accessory collection is invalid.';
  end if;

  v_requested_count := jsonb_array_length(target_payload -> 'modelCollectionIds');
  select count(distinct collection.id)
    into v_resolved_count
    from jsonb_array_elements_text(target_payload -> 'modelCollectionIds') requested(id)
    join public.catalog_collections collection
      on collection.id = requested.id::uuid
     and collection.root_category_id = v_category_id
     and collection.parent_id = v_primary_collection_id
     and collection.kind = 'MODEL'
     and collection.is_active;
  if v_resolved_count <> v_requested_count then
    raise exception using
      errcode = '23514',
      message = 'Every model collection must be active and belong to the selected primary collection.';
  end if;

  select jsonb_build_object(
    'schema', 'accessory_content_v1',
    'sections', coalesce(jsonb_agg(jsonb_build_object(
      'key', section.value -> 'key',
      'type', section.value -> 'type',
      'title', section.value -> 'title',
      'display_order', section.value -> 'displayOrder',
      'body', section.value -> 'body',
      'items', section.value -> 'items',
      'attributes', section.value -> 'attributes'
    ) order by section.ordinality), '[]'::jsonb)
  )
    into v_content
    from jsonb_array_elements(target_payload -> 'content' -> 'sections')
         with ordinality section(value, ordinality);

  if not app_private.is_accessory_content_v1(v_content) then
    raise exception using
      errcode = '23514',
      message = 'Accessory content does not satisfy accessory_content_v1.';
  end if;

  if exists (
    select 1
      from public.products product
     where lower(product.slug) = lower(target_payload ->> 'slug')
       and product.id is distinct from target_product_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Product slug is already in use.';
  end if;

  if target_product_id is null then
    insert into public.products (
      category_id,
      name,
      slug,
      description,
      specifications,
      image_urls,
      is_active,
      product_type,
      displayed_price,
      thumbnail_url
    ) values (
      v_category_id,
      btrim(target_payload ->> 'name'),
      btrim(target_payload ->> 'slug'),
      btrim(target_payload ->> 'description'),
      v_content,
      '[]'::jsonb,
      false,
      'ACCESSORY',
      null,
      null
    ) returning id into v_product_id;
  else
    select product.updated_at, product.product_type
      into v_existing_updated_at, v_product_type
      from public.products product
     where product.id = target_product_id
     for update;
    if not found or v_product_type is distinct from 'ACCESSORY' then
      raise exception using
        errcode = 'P0002',
        message = 'Accessory product was not found.';
    end if;
    if expected_updated_at is null or v_existing_updated_at is distinct from expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'Accessory product was updated by another request.';
    end if;
    v_product_id := target_product_id;
    update public.products product
       set category_id = v_category_id,
           name = btrim(target_payload ->> 'name'),
           slug = btrim(target_payload ->> 'slug'),
           description = btrim(target_payload ->> 'description'),
           specifications = v_content,
           is_active = false,
           updated_at = v_now
     where product.id = v_product_id;
  end if;

  -- Replace active taxonomy projection. Previous source rows remain auditable
  -- but are inactive after an explicit admin save.
  update public.product_collection_memberships membership
     set is_active = false,
         is_primary = false,
         last_seen_at = greatest(membership.last_seen_at, v_now),
         updated_at = v_now
   where membership.product_id = v_product_id
     and membership.is_active;

  insert into public.product_collection_memberships (
    root_category_id,
    product_id,
    collection_id,
    source_system,
    is_primary,
    is_active,
    first_seen_at,
    last_seen_at,
    metadata
  ) values (
    v_category_id,
    v_product_id,
    v_primary_collection_id,
    'admin',
    true,
    true,
    v_now,
    v_now,
    jsonb_build_object('managedBy', 'admin')
  )
  on conflict (product_id, collection_id, source_system) do update
    set root_category_id = excluded.root_category_id,
        is_primary = true,
        is_active = true,
        last_seen_at = excluded.last_seen_at,
        metadata = public.product_collection_memberships.metadata || excluded.metadata;

  for v_collection_id in
    select requested.id::uuid
      from jsonb_array_elements_text(target_payload -> 'modelCollectionIds') requested(id)
  loop
    insert into public.product_collection_memberships (
      root_category_id,
      product_id,
      collection_id,
      source_system,
      is_primary,
      is_active,
      first_seen_at,
      last_seen_at,
      metadata
    ) values (
      v_category_id,
      v_product_id,
      v_collection_id,
      'admin',
      false,
      true,
      v_now,
      v_now,
      jsonb_build_object('managedBy', 'admin')
    )
    on conflict (product_id, collection_id, source_system) do update
      set root_category_id = excluded.root_category_id,
          is_primary = false,
          is_active = true,
          last_seen_at = excluded.last_seen_at,
          metadata = public.product_collection_memberships.metadata || excluded.metadata;
  end loop;

  v_requested_count := jsonb_array_length(target_payload -> 'serviceLabelIds');
  select count(distinct label.id)
    into v_resolved_count
    from jsonb_array_elements_text(target_payload -> 'serviceLabelIds') requested(id)
    join public.catalog_service_labels label
      on label.id = requested.id::uuid
     and label.is_active;
  if v_resolved_count <> v_requested_count then
    raise exception using
      errcode = '23514',
      message = 'Every service label must exist and be active.';
  end if;

  delete from public.product_service_label_assignments assignment
   where assignment.product_id = v_product_id;
  insert into public.product_service_label_assignments (product_id, service_label_id)
  select v_product_id, requested.id::uuid
    from jsonb_array_elements_text(target_payload -> 'serviceLabelIds') requested(id);

  update public.product_option_groups option_group
     set is_active = false
   where option_group.product_id = v_product_id
     and option_group.is_active;

  for v_group in
    select item.value
      from jsonb_array_elements(target_payload -> 'optionGroups') item(value)
  loop
    v_group_code := v_group ->> 'code';
    v_group_id := null;
    if v_group ? 'existingId' then
      v_group_id := (v_group ->> 'existingId')::uuid;
      perform option_group.id
        from public.product_option_groups option_group
       where option_group.id = v_group_id
         and option_group.product_id = v_product_id;
      if not found then
        raise exception using
          errcode = '23503',
          message = 'Option group does not belong to this product.';
      end if;
    else
      select option_group.id
        into v_group_id
        from public.product_option_groups option_group
       where option_group.product_id = v_product_id
         and option_group.code = v_group_code;
    end if;

    if v_group_id is null then
      insert into public.product_option_groups (
        product_id, code, name, display_type, minimum_selections,
        maximum_selections, display_order, is_active, metadata
      ) values (
        v_product_id,
        v_group_code,
        v_group ->> 'name',
        v_group ->> 'displayType',
        (v_group ->> 'minimumSelections')::integer,
        1,
        (v_group ->> 'displayOrder')::integer,
        true,
        jsonb_build_object(
          'drivesMedia', (v_group ->> 'drivesMedia')::boolean,
          'managedBy', 'admin'
        )
      ) returning id into v_group_id;
    else
      update public.product_option_groups option_group
         set code = v_group_code,
             name = v_group ->> 'name',
             display_type = v_group ->> 'displayType',
             minimum_selections = (v_group ->> 'minimumSelections')::integer,
             maximum_selections = 1,
             display_order = (v_group ->> 'displayOrder')::integer,
             is_active = true,
             metadata = option_group.metadata || jsonb_build_object(
               'drivesMedia', (v_group ->> 'drivesMedia')::boolean,
               'managedBy', 'admin'
             )
       where option_group.id = v_group_id;
    end if;

    update public.product_option_values option_value
       set is_active = false
     where option_value.product_id = v_product_id
       and option_value.option_group_id = v_group_id
       and option_value.is_active;

    for v_value in
      select item.value
        from jsonb_array_elements(v_group -> 'values') item(value)
    loop
      v_value_code := v_value ->> 'code';
      v_value_id := null;
      if v_value ? 'existingId' then
        v_value_id := (v_value ->> 'existingId')::uuid;
        perform option_value.id
          from public.product_option_values option_value
         where option_value.id = v_value_id
           and option_value.product_id = v_product_id
           and option_value.option_group_id = v_group_id;
        if not found then
          raise exception using
            errcode = '23503',
            message = 'Option value does not belong to this product and group.';
        end if;
      else
        select option_value.id
          into v_value_id
          from public.product_option_values option_value
         where option_value.option_group_id = v_group_id
           and option_value.code = v_value_code;
      end if;

      if v_value_id is null then
        insert into public.product_option_values (
          product_id, option_group_id, code, name, swatch_url, color_hex,
          price_adjustment, display_order, is_active, metadata
        ) values (
          v_product_id,
          v_group_id,
          v_value_code,
          v_value ->> 'name',
          nullif(v_value ->> 'swatchUrl', ''),
          nullif(v_value ->> 'colorHex', ''),
          0,
          (v_value ->> 'displayOrder')::integer,
          true,
          jsonb_build_object('managedBy', 'admin')
        ) returning id into v_value_id;
      else
        update public.product_option_values option_value
           set code = v_value_code,
               name = v_value ->> 'name',
               swatch_url = nullif(v_value ->> 'swatchUrl', ''),
               color_hex = nullif(v_value ->> 'colorHex', ''),
               price_adjustment = 0,
               display_order = (v_value ->> 'displayOrder')::integer,
               is_active = true,
               metadata = option_value.metadata || jsonb_build_object('managedBy', 'admin')
         where option_value.id = v_value_id;
      end if;
    end loop;
  end loop;

  update public.product_variants variant
     set is_active = false,
         updated_at = v_now
   where variant.product_id = v_product_id
     and variant.is_active;

  for v_variant in
    select item.value
      from jsonb_array_elements(target_payload -> 'variants') item(value)
  loop
    v_variant_id := null;
    if v_variant ? 'existingId' then
      v_variant_id := (v_variant ->> 'existingId')::uuid;
      perform variant.id
        from public.product_variants variant
       where variant.id = v_variant_id
         and variant.product_id = v_product_id;
      if not found then
        raise exception using
          errcode = '23503',
          message = 'Variant does not belong to this product.';
      end if;
      select variant.product_id
        into v_conflict_product_id
        from public.product_variants variant
       where lower(variant.sku) = lower(v_variant ->> 'sku')
         and variant.id <> v_variant_id
       limit 1;
      if found then
        raise exception using
          errcode = '23505',
          message = 'Variant SKU is already in use.';
      end if;
    else
      select variant.id, variant.product_id
        into v_variant_id, v_conflict_product_id
        from public.product_variants variant
       where lower(variant.sku) = lower(v_variant ->> 'sku')
       limit 1;
      if found and v_conflict_product_id <> v_product_id then
        raise exception using
          errcode = '23505',
          message = 'Variant SKU is already in use.';
      end if;
    end if;

    select nullif(string_agg(mapping.key || '=' || mapping.value, '|' order by mapping.key), '')
      into v_signature
      from jsonb_each_text(v_variant -> 'optionValues') mapping;

    if v_variant_id is null then
      insert into public.product_variants (
        product_id, sku, name, original_price, sale_price, is_active,
        option_signature, deposit_amount, metadata
      ) values (
        v_product_id,
        v_variant ->> 'sku',
        v_variant ->> 'name',
        (v_variant ->> 'originalPrice')::numeric,
        nullif(v_variant ->> 'salePrice', '')::numeric,
        (v_variant ->> 'isActive')::boolean,
        v_signature,
        null,
        jsonb_build_object('managedBy', 'admin')
      ) returning id into v_variant_id;
    else
      update public.product_variants variant
         set sku = v_variant ->> 'sku',
             name = v_variant ->> 'name',
             original_price = (v_variant ->> 'originalPrice')::numeric,
             sale_price = nullif(v_variant ->> 'salePrice', '')::numeric,
             is_active = (v_variant ->> 'isActive')::boolean,
             option_signature = v_signature,
             deposit_amount = null,
             metadata = variant.metadata || jsonb_build_object('managedBy', 'admin'),
             updated_at = v_now
       where variant.id = v_variant_id;
    end if;

    insert into public.inventory_items (variant_id, on_hand_quantity)
    values (v_variant_id, 0)
    on conflict (variant_id) do nothing;

    delete from public.product_variant_option_values mapping
     where mapping.variant_id = v_variant_id;

    for v_mapping in
      select mapping.key as group_code, mapping.value as value_code
        from jsonb_each_text(v_variant -> 'optionValues') mapping
    loop
      select option_group.id, option_value.id
        into v_group_id, v_value_id
        from public.product_option_groups option_group
        join public.product_option_values option_value
          on option_value.product_id = option_group.product_id
         and option_value.option_group_id = option_group.id
       where option_group.product_id = v_product_id
         and option_group.code = v_mapping.group_code
         and option_group.is_active
         and option_value.code = v_mapping.value_code
         and option_value.is_active;
      if not found then
        raise exception using
          errcode = '23514',
          message = 'Variant references an unknown option value.';
      end if;
      insert into public.product_variant_option_values (
        product_id, variant_id, option_group_id, option_value_id
      ) values (
        v_product_id, v_variant_id, v_group_id, v_value_id
      );
    end loop;

    if exists (
      select 1
        from public.product_option_groups option_group
       where option_group.product_id = v_product_id
         and option_group.is_active
         and option_group.minimum_selections = 1
         and not exists (
           select 1
             from public.product_variant_option_values mapping
            where mapping.variant_id = v_variant_id
              and mapping.option_group_id = option_group.id
         )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Variant is missing a required option selection.';
    end if;
  end loop;

  -- Product media IDs are not referenced by carts or orders. Replace the
  -- aggregate media set while variant/option IDs remain stable.
  delete from public.product_media media
   where media.product_id = v_product_id;

  for v_media_url in
    select item.value
      from jsonb_array_elements(target_payload -> 'productImageUrls') item(value)
  loop
    v_media_url_text := v_media_url #>> '{}';
    v_media_count := v_media_count + 1;
    insert into public.product_media (
      product_id, role, media_type, url, alt_text, display_order, metadata
    ) values (
      v_product_id,
      case when v_media_count = 1 then 'THUMBNAIL' else 'GALLERY' end,
      case when v_media_url_text ~* '\.(mp4|webm|mov)(\?|$)' then 'VIDEO' else 'IMAGE' end,
      v_media_url_text,
      target_payload ->> 'name',
      v_media_count * 10,
      jsonb_build_object('managedBy', 'admin')
    );
  end loop;

  for v_group in
    select item.value
      from jsonb_array_elements(target_payload -> 'optionGroups') item(value)
  loop
    v_group_code := v_group ->> 'code';
    for v_value in
      select item.value
        from jsonb_array_elements(v_group -> 'values') item(value)
    loop
      v_value_code := v_value ->> 'code';
      select option_value.id
        into v_value_id
        from public.product_option_groups option_group
        join public.product_option_values option_value
          on option_value.option_group_id = option_group.id
       where option_group.product_id = v_product_id
         and option_group.code = v_group_code
         and option_group.is_active
         and option_value.code = v_value_code
         and option_value.is_active;
      v_scope_order := 0;
      for v_media_url in
        select item.value
          from jsonb_array_elements(v_value -> 'imageUrls') item(value)
      loop
        v_scope_order := v_scope_order + 1;
        v_media_count := v_media_count + 1;
        v_media_url_text := v_media_url #>> '{}';
        insert into public.product_media (
          product_id, option_value_id, role, media_type, url, alt_text,
          display_order, metadata
        ) values (
          v_product_id,
          v_value_id,
          case
            when v_media_count = 1 then 'THUMBNAIL'
            when v_scope_order = 1 then 'HERO'
            else 'GALLERY'
          end,
          case when v_media_url_text ~* '\.(mp4|webm|mov)(\?|$)' then 'VIDEO' else 'IMAGE' end,
          v_media_url_text,
          target_payload ->> 'name',
          v_media_count * 10,
          jsonb_build_object('managedBy', 'admin')
        );
      end loop;
    end loop;
  end loop;

  for v_variant in
    select item.value
      from jsonb_array_elements(target_payload -> 'variants') item(value)
  loop
    select variant.id
      into v_variant_id
      from public.product_variants variant
     where variant.product_id = v_product_id
       and lower(variant.sku) = lower(v_variant ->> 'sku');
    v_scope_order := 0;
    for v_media_url in
      select item.value
        from jsonb_array_elements(v_variant -> 'imageUrls') item(value)
    loop
      v_scope_order := v_scope_order + 1;
      v_media_count := v_media_count + 1;
      v_media_url_text := v_media_url #>> '{}';
      insert into public.product_media (
        product_id, variant_id, role, media_type, url, alt_text,
        display_order, metadata
      ) values (
        v_product_id,
        v_variant_id,
        case
          when v_media_count = 1 then 'THUMBNAIL'
          when v_scope_order = 1 then 'HERO'
          else 'GALLERY'
        end,
        case when v_media_url_text ~* '\.(mp4|webm|mov)(\?|$)' then 'VIDEO' else 'IMAGE' end,
        v_media_url_text,
        target_payload ->> 'name',
        v_media_count * 10,
        jsonb_build_object('managedBy', 'admin')
      );
    end loop;
  end loop;

  select min(coalesce(variant.sale_price, variant.original_price))
    into v_displayed_price
    from public.product_variants variant
   where variant.product_id = v_product_id
     and variant.is_active;

  select coalesce(jsonb_agg(media.url order by media.display_order), '[]'::jsonb)
    into v_legacy_images
    from public.product_media media
   where media.product_id = v_product_id
     and media.variant_id is null
     and media.option_value_id is null;
  if jsonb_array_length(v_legacy_images) = 0 then
    select coalesce(jsonb_build_array(media.url), '[]'::jsonb)
      into v_legacy_images
      from public.product_media media
     where media.product_id = v_product_id
     order by media.display_order
     limit 1;
  end if;
  select media.url
    into v_thumbnail_url
    from public.product_media media
   where media.product_id = v_product_id
   order by (media.role = 'THUMBNAIL') desc, media.display_order
   limit 1;

  if (target_payload ->> 'isActive')::boolean
     and (v_displayed_price is null or v_media_count = 0) then
    raise exception using
      errcode = '23514',
      message = 'An active accessory requires an active variant and at least one media item.';
  end if;

  v_updated_at := clock_timestamp();
  update public.products product
     set displayed_price = v_displayed_price,
         image_urls = coalesce(v_legacy_images, '[]'::jsonb),
         thumbnail_url = v_thumbnail_url,
         is_active = (target_payload ->> 'isActive')::boolean,
         updated_at = v_updated_at
   where product.id = v_product_id
   returning product.updated_at into v_updated_at;

  return jsonb_build_object(
    'id', v_product_id,
    'productType', 'ACCESSORY',
    'isActive', (target_payload ->> 'isActive')::boolean,
    'updatedAt', v_updated_at
  );
end;
$function$;

revoke all on function public.save_admin_accessory_product(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product(uuid, timestamptz, jsonb)
  to service_role;

comment on function public.save_admin_accessory_product(uuid, timestamptz, jsonb) is
  'Atomically creates or replaces an ACCESSORY product aggregate. Option values never add price; sellable SKU rows own all prices and inventory.';

commit;

-- Rollback after deploying runtime that no longer calls the function:
-- drop function if exists public.save_admin_accessory_product(uuid, timestamptz, jsonb);
