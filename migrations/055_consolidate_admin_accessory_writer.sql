begin;

create sequence if not exists public.accessory_sku_sequence
  as bigint
  minvalue 1
  maxvalue 99999999
  start with 30000001
  increment by 1
  no cycle;

select setval(
  'public.accessory_sku_sequence'::regclass,
  greatest(
    30000000,
    coalesce((
      select max(substring(variant.sku from '^ACS([0-9]{8})$')::bigint)
        from public.product_variants variant
       where variant.sku ~ '^ACS[0-9]{8}$'
    ), 0),
    (select case when is_called then last_value else last_value - 1 end
       from public.accessory_sku_sequence)
  ),
  true
);

revoke all on sequence public.accessory_sku_sequence
  from public, anon, authenticated, service_role;

-- Canonical accessory aggregate writer. This folds the old v4 -> v3 -> v2 ->
-- v1 call chain into one transaction. Compatibility aliases are defined at
-- the end and intentionally contain no write logic.
create or replace function public.save_admin_accessory_product(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_product_id uuid;
  v_category_id uuid;
  v_existing_updated_at timestamptz;
  v_product_type text;
  v_content jsonb;
  v_template_code text;
  v_template_version integer;
  v_template_version_id uuid;
  v_registry_template_code text;
  v_registry_template_version integer;
  v_assignment jsonb;
  v_assignment_category_id uuid;
  v_model_id uuid;
  v_mode text;
  v_requested_count integer;
  v_resolved_count integer;
  v_model_child_count integer;
  v_group jsonb;
  v_group_id uuid;
  v_group_code text;
  v_value jsonb;
  v_value_id uuid;
  v_value_code text;
  v_variant jsonb;
  v_variant_index integer := 0;
  v_variant_id uuid;
  v_existing_sku text;
  v_generated_sku text;
  v_sequence_value bigint;
  v_variants jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_representative jsonb;
  v_image_urls jsonb;
  v_invalid_count integer;
  v_signature text;
  v_mapping record;
  v_media_url jsonb;
  v_media_url_text text;
  v_media_count integer := 0;
  v_scope_order integer;
  v_displayed_price numeric;
  v_legacy_images jsonb;
  v_thumbnail_url text;
  v_now timestamptz;
  v_updated_at timestamptz;
begin
  if jsonb_typeof(target_payload) <> 'object'
     or not (target_payload ?& array[
       'categoryId', 'templateCode', 'templateVersion', 'categoryAssignments',
       'name', 'slug', 'description', 'isActive', 'serviceLabelIds', 'content',
       'optionGroups', 'variants'
     ]) then
    raise exception using
      errcode = '22023',
      message = 'Accessory payload is incomplete.';
  end if;

  if jsonb_typeof(target_payload -> 'categoryAssignments') <> 'array'
     or jsonb_array_length(target_payload -> 'categoryAssignments') < 1
     or jsonb_array_length(target_payload -> 'categoryAssignments') > 20
     or jsonb_typeof(target_payload -> 'serviceLabelIds') <> 'array'
     or jsonb_typeof(target_payload -> 'optionGroups') <> 'array'
     or jsonb_typeof(target_payload -> 'variants') <> 'array'
     or jsonb_array_length(target_payload -> 'variants') < 1
     or jsonb_typeof(target_payload -> 'content') <> 'object'
     or jsonb_typeof(target_payload -> 'content' -> 'sections') <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Accessory payload arrays are invalid.';
  end if;

  v_category_id := (target_payload ->> 'categoryId')::uuid;
  v_template_code := btrim(target_payload ->> 'templateCode');
  v_template_version := (target_payload ->> 'templateVersion')::integer;
  v_template_version_id := nullif(target_payload ->> 'templateVersionId', '')::uuid;

  if v_template_code = '' or v_template_version < 1 then
    raise exception using
      errcode = '23514',
      message = 'Accessory template code or version is invalid.';
  end if;

  if v_template_version_id is not null then
    select template.code, revision.version
      into v_registry_template_code, v_registry_template_version
      from public.accessory_template_versions revision
      join public.accessory_templates template on template.id = revision.template_id
     where revision.id = v_template_version_id
     for key share of revision, template;
    if not found then
      raise exception using
        errcode = '23503',
        message = 'Accessory template revision was not found.';
    end if;
    if v_registry_template_version <> v_template_version then
      raise exception using
        errcode = '23514',
        message = 'Accessory template revision does not match its version.';
    end if;
    -- Dynamic DB templates used the legacy "custom" marker during rollout.
    -- Built-ins may use either hyphens or their old underscore aliases.
    if v_template_code <> 'custom'
       and replace(v_registry_template_code, '-', '_')
           <> replace(v_template_code, '-', '_') then
      raise exception using
        errcode = '23514',
        message = 'Accessory template revision does not match its code.';
    end if;
  elsif v_template_code not in (
    'vehicle_fit', 'vehicle-fit', 'window_film', 'window-film',
    'apparel', 'ev_charger', 'ev-charger', 'custom'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A dynamic accessory template requires a template revision.';
  end if;

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

  -- Serialize updates before child-ownership checks and SKU allocation.
  if target_product_id is not null then
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
    if expected_updated_at is null
       or v_existing_updated_at is distinct from expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'Accessory product was updated by another request.';
    end if;
  end if;

  v_requested_count := jsonb_array_length(target_payload -> 'categoryAssignments');
  select count(distinct (assignment.value ->> 'categoryId')::uuid)
    into v_resolved_count
    from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value);
  if v_resolved_count <> v_requested_count then
    raise exception using
      errcode = '23514',
      message = 'Accessory category assignments must be unique.';
  end if;

  for v_assignment in
    select assignment.value
      from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value)
  loop
    if jsonb_typeof(v_assignment) <> 'object'
       or not (v_assignment ?& array['categoryId', 'compatibilityMode', 'modelIds'])
       or jsonb_typeof(v_assignment -> 'modelIds') <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'Accessory category assignment is invalid.';
    end if;

    v_assignment_category_id := (v_assignment ->> 'categoryId')::uuid;
    v_mode := v_assignment ->> 'compatibilityMode';
    perform collection.id
      from public.catalog_collections collection
     where collection.id = v_assignment_category_id
       and collection.root_category_id = v_category_id
       and collection.kind = 'CATEGORY'
       and collection.parent_id is null
       and collection.is_active
     for key share;
    if not found then
      raise exception using
        errcode = '23514',
        message = 'Every accessory category assignment must be active and under the accessory root.';
    end if;

    select count(*)
      into v_model_child_count
      from public.catalog_collections model
     where model.root_category_id = v_category_id
       and model.parent_id = v_assignment_category_id
       and model.kind = 'MODEL'
       and model.is_active;
    v_requested_count := jsonb_array_length(v_assignment -> 'modelIds');

    if coalesce((target_payload ->> 'legacyTaxonomy')::boolean, false)
       and v_model_child_count = 0
       and v_mode = 'ALL_MODELS' then
      v_mode := 'NOT_APPLICABLE';
    end if;

    if v_model_child_count = 0 then
      if v_mode <> 'NOT_APPLICABLE' or v_requested_count <> 0 then
        raise exception using
          errcode = '23514',
          message = 'A category without vehicle models must use NOT_APPLICABLE.';
      end if;
    elsif v_mode = 'ALL_MODELS' then
      if v_requested_count <> 0 then
        raise exception using
          errcode = '23514',
          message = 'ALL_MODELS must not include individual model IDs.';
      end if;
    elsif v_mode = 'SELECTED_MODELS' then
      if v_requested_count < 1 then
        raise exception using
          errcode = '23514',
          message = 'SELECTED_MODELS requires at least one model.';
      end if;
      select count(distinct collection.id)
        into v_resolved_count
        from jsonb_array_elements_text(v_assignment -> 'modelIds') requested(id)
        join public.catalog_collections collection
          on collection.id = requested.id::uuid
         and collection.root_category_id = v_category_id
         and collection.parent_id = v_assignment_category_id
         and collection.kind = 'MODEL'
         and collection.is_active;
      if v_resolved_count <> v_requested_count then
        raise exception using
          errcode = '23514',
          message = 'Every selected vehicle model must belong to its active accessory category.';
      end if;
    else
      raise exception using
        errcode = '23514',
        message = 'A category with vehicle models must use ALL_MODELS or SELECTED_MODELS.';
    end if;
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

  -- Validate media and allocate immutable SKUs before changing aggregate rows.
  for v_variant in
    select item.value
      from jsonb_array_elements(target_payload -> 'variants') item(value)
  loop
    if jsonb_typeof(v_variant) is distinct from 'object' then
      raise exception using
        errcode = '22023',
        message = format('variants.%s must be an object.', v_variant_index);
    end if;
    if v_variant ? 'sku' then
      raise exception using
        errcode = '22023',
        message = format('variants.%s.sku is generated by the database.', v_variant_index);
    end if;

    v_image_urls := v_variant -> 'imageUrls';
    if jsonb_typeof(v_image_urls) is distinct from 'array'
       or jsonb_array_length(v_image_urls) < 1
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

    if v_variant ? 'existingId' then
      v_variant_id := (v_variant ->> 'existingId')::uuid;
      select variant.sku
        into v_existing_sku
        from public.product_variants variant
       where variant.id = v_variant_id
         and variant.product_id = target_product_id;
      if not found then
        raise exception using
          errcode = '23503',
          message = 'Variant does not belong to this product.';
      end if;
      v_generated_sku := v_existing_sku;
    else
      v_sequence_value := nextval('public.accessory_sku_sequence');
      if v_sequence_value > 99999999 then
        raise exception using
          errcode = '22003',
          message = 'Accessory SKU sequence is exhausted.';
      end if;
      v_generated_sku := 'ACS' || lpad(v_sequence_value::text, 8, '0');
    end if;

    v_variants := v_variants || jsonb_build_array(
      v_variant || jsonb_build_object('sku', v_generated_sku)
    );
    v_variant_index := v_variant_index + 1;
  end loop;

  select item.value
    into v_representative
    from jsonb_array_elements(v_variants) item(value)
   where coalesce((item.value ->> 'isActive')::boolean, false)
   limit 1;
  if v_representative is null then
    select item.value
      into v_representative
      from jsonb_array_elements(v_variants) item(value)
     limit 1;
  end if;
  v_payload := target_payload || jsonb_build_object(
    'variants', v_variants,
    'productImageUrls', coalesce(v_representative -> 'imageUrls', '[]'::jsonb)
  );

  -- Every membership mutation below uses this one timestamp.
  v_now := clock_timestamp();

  if target_product_id is null then
    insert into public.products (
      category_id, name, slug, description, specifications, image_urls,
      is_active, product_type, displayed_price, thumbnail_url,
      accessory_template_code, accessory_template_version,
      accessory_template_version_id, updated_at
    ) values (
      v_category_id,
      btrim(v_payload ->> 'name'),
      btrim(v_payload ->> 'slug'),
      btrim(v_payload ->> 'description'),
      v_content,
      '[]'::jsonb,
      false,
      'ACCESSORY',
      null,
      null,
      v_template_code,
      v_template_version,
      v_template_version_id,
      v_now
    ) returning id into v_product_id;
  else
    v_product_id := target_product_id;
    update public.products product
       set category_id = v_category_id,
           name = btrim(v_payload ->> 'name'),
           slug = btrim(v_payload ->> 'slug'),
           description = btrim(v_payload ->> 'description'),
           specifications = v_content,
           is_active = false,
           accessory_template_code = v_template_code,
           accessory_template_version = v_template_version,
           accessory_template_version_id = v_template_version_id,
           updated_at = v_now
     where product.id = v_product_id;
  end if;

  -- Preserve source rows for audit, but replace the active projection. The
  -- GREATEST expressions make last_seen_at >= first_seen_at defensive even for
  -- imported rows carrying a future first_seen_at value.
  update public.product_collection_memberships membership
     set is_active = false,
         is_primary = false,
         last_seen_at = greatest(
           membership.first_seen_at,
           membership.last_seen_at,
           v_now
         ),
         updated_at = v_now
   where membership.product_id = v_product_id
     and membership.is_active;

  for v_assignment in
    select assignment.value
      from jsonb_array_elements(v_payload -> 'categoryAssignments') assignment(value)
  loop
    v_assignment_category_id := (v_assignment ->> 'categoryId')::uuid;
    v_mode := v_assignment ->> 'compatibilityMode';
    if coalesce((v_payload ->> 'legacyTaxonomy')::boolean, false)
       and v_mode = 'ALL_MODELS'
       and not exists (
         select 1
           from public.catalog_collections model
          where model.root_category_id = v_category_id
            and model.parent_id = v_assignment_category_id
            and model.kind = 'MODEL'
            and model.is_active
       ) then
      v_mode := 'NOT_APPLICABLE';
    end if;

    insert into public.product_collection_memberships (
      root_category_id, product_id, collection_id, source_system, is_primary,
      is_active, first_seen_at, last_seen_at, metadata
    ) values (
      v_category_id, v_product_id, v_assignment_category_id, 'admin', false,
      true, v_now, v_now,
      jsonb_build_object('managedBy', 'admin', 'compatibilityMode', v_mode)
    )
    on conflict (product_id, collection_id, source_system) do update
      set root_category_id = excluded.root_category_id,
          is_primary = false,
          is_active = true,
          last_seen_at = greatest(
            public.product_collection_memberships.first_seen_at,
            public.product_collection_memberships.last_seen_at,
            excluded.last_seen_at
          ),
          metadata = coalesce(
            public.product_collection_memberships.metadata,
            '{}'::jsonb
          ) || excluded.metadata;

    if v_mode = 'SELECTED_MODELS' then
      for v_model_id in
        select requested.id::uuid
          from jsonb_array_elements_text(v_assignment -> 'modelIds') requested(id)
      loop
        insert into public.product_collection_memberships (
          root_category_id, product_id, collection_id, source_system, is_primary,
          is_active, first_seen_at, last_seen_at, metadata
        ) values (
          v_category_id, v_product_id, v_model_id, 'admin', false,
          true, v_now, v_now,
          jsonb_build_object('managedBy', 'admin')
        )
        on conflict (product_id, collection_id, source_system) do update
          set root_category_id = excluded.root_category_id,
              is_primary = false,
              is_active = true,
              last_seen_at = greatest(
                public.product_collection_memberships.first_seen_at,
                public.product_collection_memberships.last_seen_at,
                excluded.last_seen_at
              ),
              metadata = coalesce(
                public.product_collection_memberships.metadata,
                '{}'::jsonb
              ) || excluded.metadata;
      end loop;
    end if;
  end loop;

  delete from public.product_service_label_assignments assignment
   where assignment.product_id = v_product_id;
  insert into public.product_service_label_assignments (
    product_id,
    service_label_id
  )
  select v_product_id, requested.id::uuid
    from jsonb_array_elements_text(v_payload -> 'serviceLabelIds') requested(id);

  update public.product_option_groups option_group
     set is_active = false,
         updated_at = v_now
   where option_group.product_id = v_product_id
     and option_group.is_active;

  for v_group in
    select item.value
      from jsonb_array_elements(v_payload -> 'optionGroups') item(value)
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
        maximum_selections, display_order, is_active, metadata, updated_at
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
          'drivesMedia', coalesce((v_group ->> 'drivesMedia')::boolean, false),
          'managedBy', 'admin'
        ),
        v_now
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
             metadata = coalesce(option_group.metadata, '{}'::jsonb)
               || jsonb_build_object(
                 'drivesMedia', coalesce((v_group ->> 'drivesMedia')::boolean, false),
                 'managedBy', 'admin'
               ),
             updated_at = v_now
       where option_group.id = v_group_id;
    end if;

    update public.product_option_values option_value
       set is_active = false,
           updated_at = v_now
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
          price_adjustment, display_order, is_active, metadata, updated_at
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
          jsonb_build_object('managedBy', 'admin'),
          v_now
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
               metadata = coalesce(option_value.metadata, '{}'::jsonb)
                 || jsonb_build_object('managedBy', 'admin'),
               updated_at = v_now
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
      from jsonb_array_elements(v_variants) item(value)
  loop
    v_variant_id := null;
    if v_variant ? 'existingId' then
      v_variant_id := (v_variant ->> 'existingId')::uuid;
    end if;

    select nullif(
      string_agg(mapping.key || '=' || mapping.value, '|' order by mapping.key),
      ''
    )
      into v_signature
      from jsonb_each_text(v_variant -> 'optionValues') mapping;

    if v_variant_id is null then
      insert into public.product_variants (
        product_id, sku, name, original_price, sale_price, is_active,
        option_signature, deposit_amount, metadata, updated_at
      ) values (
        v_product_id,
        v_variant ->> 'sku',
        v_variant ->> 'name',
        (v_variant ->> 'originalPrice')::numeric,
        nullif(v_variant ->> 'salePrice', '')::numeric,
        (v_variant ->> 'isActive')::boolean,
        v_signature,
        null,
        jsonb_build_object('managedBy', 'admin'),
        v_now
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
             metadata = coalesce(variant.metadata, '{}'::jsonb)
               || jsonb_build_object('managedBy', 'admin'),
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

  -- Media IDs are not referenced by cart or order rows. Replace the media
  -- projection while preserving product, option and variant identities.
  delete from public.product_media media
   where media.product_id = v_product_id;

  for v_media_url in
    select item.value
      from jsonb_array_elements(v_payload -> 'productImageUrls') item(value)
  loop
    v_media_url_text := v_media_url #>> '{}';
    v_media_count := v_media_count + 1;
    insert into public.product_media (
      product_id, role, media_type, url, alt_text, display_order, metadata,
      created_at, updated_at
    ) values (
      v_product_id,
      case when v_media_count = 1 then 'THUMBNAIL' else 'GALLERY' end,
      case when v_media_url_text ~* '\.(mp4|webm|mov)(\?|$)' then 'VIDEO' else 'IMAGE' end,
      v_media_url_text,
      v_payload ->> 'name',
      v_media_count * 10,
      jsonb_build_object('managedBy', 'admin'),
      v_now,
      v_now
    );
  end loop;

  for v_group in
    select item.value
      from jsonb_array_elements(v_payload -> 'optionGroups') item(value)
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
          from jsonb_array_elements(coalesce(v_value -> 'imageUrls', '[]'::jsonb)) item(value)
      loop
        v_scope_order := v_scope_order + 1;
        v_media_count := v_media_count + 1;
        v_media_url_text := v_media_url #>> '{}';
        insert into public.product_media (
          product_id, option_value_id, role, media_type, url, alt_text,
          display_order, metadata, created_at, updated_at
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
          v_payload ->> 'name',
          v_media_count * 10,
          jsonb_build_object('managedBy', 'admin'),
          v_now,
          v_now
        );
      end loop;
    end loop;
  end loop;

  for v_variant in
    select item.value
      from jsonb_array_elements(v_variants) item(value)
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
        display_order, metadata, created_at, updated_at
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
        v_payload ->> 'name',
        v_media_count * 10,
        jsonb_build_object('managedBy', 'admin'),
        v_now,
        v_now
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

  if (v_payload ->> 'isActive')::boolean
     and (v_displayed_price is null or v_media_count = 0) then
    raise exception using
      errcode = '23514',
      message = 'An active accessory requires an active variant and at least one media item.';
  end if;

  update public.products product
     set displayed_price = v_displayed_price,
         image_urls = coalesce(v_legacy_images, '[]'::jsonb),
         thumbnail_url = v_thumbnail_url,
         is_active = (v_payload ->> 'isActive')::boolean,
         accessory_template_code = v_template_code,
         accessory_template_version = v_template_version,
         accessory_template_version_id = v_template_version_id,
         updated_at = v_now
   where product.id = v_product_id
   returning product.updated_at into v_updated_at;

  return jsonb_build_object(
    'id', v_product_id,
    'productType', 'ACCESSORY',
    'isActive', (v_payload ->> 'isActive')::boolean,
    'updatedAt', v_updated_at
  );
end;
$function$;

revoke all on function public.save_admin_accessory_product(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product(uuid, timestamptz, jsonb)
  to service_role;

comment on function public.save_admin_accessory_product(uuid, timestamptz, jsonb) is
  'Canonical transactional ACCESSORY aggregate writer. Handles current taxonomy, template provenance, generated SKU, inventory and media in one implementation.';

create or replace function public.save_admin_accessory_product_v2(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select public.save_admin_accessory_product(
    target_product_id,
    expected_updated_at,
    target_payload
  );
$function$;

create or replace function public.save_admin_accessory_product_v3(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select public.save_admin_accessory_product(
    target_product_id,
    expected_updated_at,
    target_payload
  );
$function$;

create or replace function public.save_admin_accessory_product_v4(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select public.save_admin_accessory_product(
    target_product_id,
    expected_updated_at,
    target_payload
  );
$function$;

revoke all on function public.save_admin_accessory_product_v2(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_admin_accessory_product_v4(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product_v2(uuid, timestamptz, jsonb)
  to service_role;
grant execute on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb)
  to service_role;
grant execute on function public.save_admin_accessory_product_v4(uuid, timestamptz, jsonb)
  to service_role;

comment on function public.save_admin_accessory_product_v2(uuid, timestamptz, jsonb) is
  'Deprecated compatibility alias for save_admin_accessory_product.';
comment on function public.save_admin_accessory_product_v3(uuid, timestamptz, jsonb) is
  'Deprecated compatibility alias for save_admin_accessory_product.';
comment on function public.save_admin_accessory_product_v4(uuid, timestamptz, jsonb) is
  'Deprecated compatibility alias for save_admin_accessory_product.';

commit;
