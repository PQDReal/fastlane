begin;

alter table public.products
  add column if not exists accessory_template_code text,
  add column if not exists accessory_template_version integer;

do $constraint$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'products_accessory_template_pair_check'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_accessory_template_pair_check
      check (
        (accessory_template_code is null and accessory_template_version is null)
        or (
          accessory_template_code is not null
          and accessory_template_version is not null
          and accessory_template_version > 0
        )
      );
  end if;
end
$constraint$;

-- Normalize the previously ambiguous empty model list without changing a
-- membership row. Existing products remain editable before any admin save.
with category_memberships as (
  select
    membership.id,
    membership.product_id,
    collection.id as collection_id,
    exists (
      select 1
        from public.catalog_collections model
       where model.root_category_id = collection.root_category_id
         and model.parent_id = collection.id
         and model.kind = 'MODEL'
         and model.is_active
    ) as has_models
  from public.product_collection_memberships membership
  join public.catalog_collections collection
    on collection.id = membership.collection_id
  where membership.is_active
    and collection.kind = 'CATEGORY'
    and collection.is_active
)
update public.product_collection_memberships membership
   set metadata = coalesce(membership.metadata, '{}'::jsonb) || jsonb_build_object(
     'compatibilityMode',
     case
       when not category_memberships.has_models then 'NOT_APPLICABLE'
       when exists (
         select 1
           from public.product_collection_memberships model_membership
           join public.catalog_collections model
             on model.id = model_membership.collection_id
          where model_membership.product_id = category_memberships.product_id
            and model_membership.is_active
            and model.kind = 'MODEL'
            and model.parent_id = category_memberships.collection_id
            and model.is_active
       ) then 'SELECTED_MODELS'
       else 'ALL_MODELS'
     end
   )
  from category_memberships
 where membership.id = category_memberships.id
   and coalesce(membership.metadata ->> 'compatibilityMode', '') = '';

-- v2 keeps the trusted aggregate writer for product/content/SKU/media work and
-- replaces only its single-primary taxonomy projection inside the same outer
-- transaction. This preserves existing race, ownership and inventory guards.
create or replace function public.save_admin_accessory_product_v2(
  target_product_id uuid,
  expected_updated_at timestamptz,
  target_payload jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_result jsonb;
  v_legacy_payload jsonb;
  v_first_assignment jsonb;
  v_first_model_ids jsonb;
  v_assignment jsonb;
  v_product_id uuid;
  v_category_id uuid;
  v_assignment_category_id uuid;
  v_model_id uuid;
  v_mode text;
  v_requested_count integer;
  v_resolved_count integer;
  v_model_child_count integer;
  v_now timestamptz := clock_timestamp();
  v_updated_at timestamptz;
begin
  if jsonb_typeof(target_payload) <> 'object'
     or not (target_payload ?& array[
       'categoryId', 'templateCode', 'templateVersion', 'categoryAssignments',
       'name', 'slug', 'description', 'isActive', 'serviceLabelIds', 'content',
       'optionGroups', 'variants', 'productImageUrls'
     ]) then
    raise exception using
      errcode = '22023',
      message = 'Accessory v2 payload is incomplete.';
  end if;

  if jsonb_typeof(target_payload -> 'categoryAssignments') <> 'array'
     or jsonb_array_length(target_payload -> 'categoryAssignments') < 1
     or jsonb_array_length(target_payload -> 'categoryAssignments') > 20 then
    raise exception using errcode = '22023', message = 'Accessory category assignments are invalid.';
  end if;

  if target_payload ->> 'templateCode' not in ('vehicle_fit', 'window_film', 'apparel', 'ev_charger', 'custom')
     or (target_payload ->> 'templateVersion')::integer <> 1 then
    raise exception using errcode = '23514', message = 'Accessory template code or version is invalid.';
  end if;

  v_category_id := (target_payload ->> 'categoryId')::uuid;
  perform category.id
    from public.categories category
   where category.id = v_category_id
     and category.slug = 'phu-kien'
     and category.is_active
   for key share;
  if not found then
    raise exception using errcode = '23514', message = 'The root category must be the active accessory category.';
  end if;

  v_requested_count := jsonb_array_length(target_payload -> 'categoryAssignments');
  select count(distinct (assignment.value ->> 'categoryId')::uuid)
    into v_resolved_count
    from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value);
  if v_resolved_count <> v_requested_count then
    raise exception using errcode = '23514', message = 'Accessory category assignments must be unique.';
  end if;

  for v_assignment in
    select assignment.value
      from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value)
  loop
    if jsonb_typeof(v_assignment) <> 'object'
       or not (v_assignment ?& array['categoryId', 'compatibilityMode', 'modelIds'])
       or jsonb_typeof(v_assignment -> 'modelIds') <> 'array' then
      raise exception using errcode = '22023', message = 'Accessory category assignment is invalid.';
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
      raise exception using errcode = '23514', message = 'Every accessory category assignment must be active and under the accessory root.';
    end if;

    select count(*) into v_model_child_count
      from public.catalog_collections model
     where model.root_category_id = v_category_id
       and model.parent_id = v_assignment_category_id
       and model.kind = 'MODEL'
       and model.is_active;
    v_requested_count := jsonb_array_length(v_assignment -> 'modelIds');

    if coalesce((target_payload ->> 'legacyTaxonomy')::boolean, false)
       and v_model_child_count = 0
       and v_mode = 'ALL_MODELS' then
      -- Empty modelCollectionIds in v1 was ambiguous. For a category that has
      -- no child model, preserve the old write as NOT_APPLICABLE.
      v_mode := 'NOT_APPLICABLE';
    end if;

    if v_model_child_count = 0 then
      if v_mode <> 'NOT_APPLICABLE' or v_requested_count <> 0 then
        raise exception using errcode = '23514', message = 'A category without vehicle models must use NOT_APPLICABLE.';
      end if;
    elsif v_mode = 'ALL_MODELS' then
      if v_requested_count <> 0 then
        raise exception using errcode = '23514', message = 'ALL_MODELS must not include individual model IDs.';
      end if;
    elsif v_mode = 'SELECTED_MODELS' then
      if v_requested_count < 1 then
        raise exception using errcode = '23514', message = 'SELECTED_MODELS requires at least one model.';
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
        raise exception using errcode = '23514', message = 'Every selected vehicle model must belong to its active accessory category.';
      end if;
    else
      raise exception using errcode = '23514', message = 'A category with vehicle models must use ALL_MODELS or SELECTED_MODELS.';
    end if;
  end loop;

  select assignment.value into v_first_assignment
    from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value)
   limit 1;
  select coalesce(jsonb_agg(requested.value), '[]'::jsonb) into v_first_model_ids
    from jsonb_array_elements(v_first_assignment -> 'modelIds') requested(value);
  v_legacy_payload := target_payload - 'templateCode' - 'templateVersion' - 'categoryAssignments'
    || jsonb_build_object(
      'primaryCollectionId', v_first_assignment ->> 'categoryId',
      'modelCollectionIds', v_first_model_ids
    );
  v_result := public.save_admin_accessory_product(
    target_product_id,
    expected_updated_at,
    v_legacy_payload
  );
  v_product_id := (v_result ->> 'id')::uuid;

  -- The legacy writer created one primary projection. Replace it with every
  -- category assignment; previous rows remain inactive for audit purposes.
  update public.product_collection_memberships membership
     set is_active = false,
         is_primary = false,
         last_seen_at = greatest(membership.last_seen_at, v_now),
         updated_at = v_now
   where membership.product_id = v_product_id
     and membership.is_active;

  for v_assignment in
    select assignment.value
      from jsonb_array_elements(target_payload -> 'categoryAssignments') assignment(value)
  loop
    v_assignment_category_id := (v_assignment ->> 'categoryId')::uuid;
    v_mode := v_assignment ->> 'compatibilityMode';
    if coalesce((target_payload ->> 'legacyTaxonomy')::boolean, false)
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
          last_seen_at = excluded.last_seen_at,
          metadata = coalesce(public.product_collection_memberships.metadata, '{}'::jsonb) || excluded.metadata;

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
              last_seen_at = excluded.last_seen_at,
              metadata = coalesce(public.product_collection_memberships.metadata, '{}'::jsonb) || excluded.metadata;
      end loop;
    end if;
  end loop;

  update public.products product
     set accessory_template_code = target_payload ->> 'templateCode',
         accessory_template_version = (target_payload ->> 'templateVersion')::integer,
         updated_at = v_now
   where product.id = v_product_id
  returning product.updated_at into v_updated_at;

  return v_result || jsonb_build_object('updatedAt', v_updated_at);
end
$function$;

revoke all on function public.save_admin_accessory_product_v2(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_admin_accessory_product_v2(uuid, timestamptz, jsonb)
  to service_role;

commit;
