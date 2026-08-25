begin;

-- Persist one fully planned product snapshot in a single database transaction.
-- Extraction and resolution remain in the versioned TypeScript core; this RPC
-- validates that contract, stores the provenance chain and protects reviewed
-- facts while applying deterministic canonical proposals.
create or replace function public.persist_catalog_intelligence_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_runtime public.catalog_runtime_revision%rowtype;
  v_product_id uuid;
  v_product_type text;
  v_extractor_version text;
  v_selection_policy_version text;
  v_snapshot_completeness text;
  v_input_hash text;
  v_source_hash text;
  v_observed_at timestamptz;
  v_specifications jsonb;
  v_queue_fingerprint text;
  v_job_id uuid;
  v_snapshot_id uuid;
  v_observation jsonb;
  v_candidate_payload jsonb;
  v_fact jsonb;
  v_event jsonb;
  v_value jsonb;
  v_definition_id uuid;
  v_observation_id uuid;
  v_candidate_id uuid;
  v_candidate public.catalog_spec_observation_candidates%rowtype;
  v_current public.product_spec_facts%rowtype;
  v_current_found boolean;
  v_same_value boolean;
  v_tolerance numeric;
  v_created integer := 0;
  v_updated integer := 0;
  v_kept integer := 0;
  v_conflicts integer := 0;
  v_observations integer := 0;
  v_candidates integer := 0;
  v_events integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role is required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'payload must be a JSON object';
  end if;
  if coalesce((p_payload ->> 'payloadVersion')::integer, 0) <> 1 then
    raise exception using errcode = '22023', message = 'unsupported catalog persistence payload version';
  end if;

  v_product_id := (p_payload ->> 'productId')::uuid;
  v_product_type := p_payload ->> 'productType';
  v_extractor_version := p_payload ->> 'extractorVersion';
  v_selection_policy_version := p_payload ->> 'selectionPolicyVersion';
  v_snapshot_completeness := p_payload ->> 'snapshotCompleteness';
  v_input_hash := p_payload ->> 'inputHash';
  v_source_hash := p_payload ->> 'sourceHash';
  v_observed_at := (p_payload ->> 'observedAt')::timestamptz;
  v_specifications := p_payload -> 'specificationsSnapshot';

  if v_product_type not in ('CAR', 'MOTORBIKE', 'ACCESSORY') then
    raise exception using errcode = '22023', message = 'unsupported product type';
  end if;
  if v_snapshot_completeness not in ('FULL', 'PARTIAL') then
    raise exception using errcode = '22023', message = 'invalid snapshot completeness';
  end if;
  if v_input_hash !~ '^[a-f0-9]{64}$' or v_source_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid snapshot hash';
  end if;
  if jsonb_typeof(v_specifications) is null or jsonb_typeof(v_specifications) = 'null' then
    raise exception using errcode = '22023', message = 'specificationsSnapshot is required';
  end if;

  select * into strict v_runtime
  from public.catalog_runtime_revision
  where singleton = true;
  if v_runtime.extractor_version <> v_extractor_version
    or v_runtime.selection_policy_version <> v_selection_policy_version then
    raise exception using
      errcode = '22023',
      message = 'catalog runtime version mismatch',
      detail = format(
        'database=%s/%s payload=%s/%s',
        v_runtime.extractor_version,
        v_runtime.selection_policy_version,
        v_extractor_version,
        v_selection_policy_version
      );
  end if;
  if not exists (select 1 from public.products where id = v_product_id) then
    raise exception using errcode = '23503', message = 'catalog product does not exist';
  end if;

  -- Serialize every snapshot for the same product, including different input
  -- hashes, so concurrent workers cannot race the contextual fact unique keys.
  perform pg_advisory_xact_lock(hashtextextended(v_product_id::text, 0));

  select snapshot.id into v_snapshot_id
  from public.catalog_spec_snapshots snapshot
  where snapshot.product_id = v_product_id
    and snapshot.input_hash = v_input_hash;
  if found then
    return jsonb_build_object(
      'status', 'already_applied',
      'productId', v_product_id,
      'snapshotId', v_snapshot_id,
      'observations', 0,
      'candidates', 0,
      'factsCreated', 0,
      'factsUpdated', 0,
      'factsKept', 0,
      'conflicts', 0,
      'events', 0
    );
  end if;

  v_queue_fingerprint := md5(v_extractor_version || E'\n' || v_specifications::text);
  insert into public.catalog_spec_ingestion_jobs (
    product_id,
    product_type,
    extractor_version,
    specifications_snapshot,
    queue_fingerprint,
    snapshot_completeness
  ) values (
    v_product_id,
    v_product_type,
    v_extractor_version,
    v_specifications,
    v_queue_fingerprint,
    v_snapshot_completeness
  )
  on conflict (product_id, extractor_version, queue_fingerprint) do nothing;

  select job.id into strict v_job_id
  from public.catalog_spec_ingestion_jobs job
  where job.product_id = v_product_id
    and job.extractor_version = v_extractor_version
    and job.queue_fingerprint = v_queue_fingerprint
  for update;

  -- Recheck after the per-job lock. A concurrent caller may have committed the
  -- same authoritative snapshot while this transaction waited for the lock.
  select snapshot.id into v_snapshot_id
  from public.catalog_spec_snapshots snapshot
  where snapshot.product_id = v_product_id
    and snapshot.input_hash = v_input_hash;
  if found then
    return jsonb_build_object(
      'status', 'already_applied',
      'productId', v_product_id,
      'snapshotId', v_snapshot_id,
      'observations', 0,
      'candidates', 0,
      'factsCreated', 0,
      'factsUpdated', 0,
      'factsKept', 0,
      'conflicts', 0,
      'events', 0
    );
  end if;

  update public.catalog_spec_ingestion_jobs
  set status = 'PROCESSING',
      attempts = attempts + 1,
      claimed_at = clock_timestamp(),
      claimed_by = 'catalog-intelligence-backfill',
      completed_at = null,
      last_error = null
  where id = v_job_id;

  insert into public.catalog_spec_snapshots (
    ingestion_job_id,
    product_id,
    input_hash,
    extractor_version,
    snapshot_completeness,
    specifications_snapshot,
    source_uri,
    captured_at
  ) values (
    v_job_id,
    v_product_id,
    v_input_hash,
    v_extractor_version,
    v_snapshot_completeness,
    v_specifications,
    nullif(p_payload ->> 'sourceUri', ''),
    v_observed_at
  )
  returning id into v_snapshot_id;

  if p_payload -> 'sourceReview' <> 'null'::jsonb then
    insert into public.catalog_source_reviews (
      product_id,
      source_hash,
      disposition,
      reason,
      evidence_urls,
      reviewed_by,
      reviewed_at
    ) values (
      v_product_id,
      v_source_hash,
      p_payload #>> '{sourceReview,disposition}',
      p_payload #>> '{sourceReview,reason}',
      p_payload #> '{sourceReview,evidenceUrls}',
      'catalog-intelligence-admin-review',
      (p_payload #>> '{sourceReview,reviewedAt}')::timestamptz
    )
    on conflict (product_id, source_hash) do nothing;
  end if;

  for v_observation in
    select value from jsonb_array_elements(coalesce(p_payload -> 'observations', '[]'::jsonb))
  loop
    v_definition_id := null;
    if nullif(v_observation ->> 'definitionKey', '') is not null then
      select definition.id into v_definition_id
      from public.catalog_spec_definitions definition
      where definition.canonical_key = v_observation ->> 'definitionKey';
      if v_definition_id is null then
        raise exception using
          errcode = '22023',
          message = format('unknown canonical definition: %s', v_observation ->> 'definitionKey');
      end if;
    end if;
    v_value := v_observation -> 'value';

    insert into public.catalog_spec_observations (
      snapshot_id,
      ingestion_job_id,
      product_id,
      product_variant_id,
      source_variant_key,
      spec_definition_id,
      source_schema,
      source_path,
      source_uri,
      raw_key,
      raw_value,
      display_value,
      numeric_value,
      text_value,
      boolean_value,
      duration_seconds,
      canonical_unit,
      resolution_status,
      resolution_method,
      source_authority,
      confidence,
      observed_at,
      ignored_reason_code,
      resolution_reason
    ) values (
      v_snapshot_id,
      v_job_id,
      v_product_id,
      nullif(v_observation ->> 'productVariantId', '')::uuid,
      nullif(v_observation ->> 'sourceVariantKey', ''),
      v_definition_id,
      v_observation ->> 'sourceSchema',
      v_observation ->> 'sourcePath',
      nullif(v_observation ->> 'sourceUri', ''),
      v_observation ->> 'rawKey',
      v_observation -> 'rawValue',
      nullif(v_value ->> 'displayValue', ''),
      nullif(v_value ->> 'numericValue', '')::numeric,
      nullif(v_value ->> 'textValue', ''),
      nullif(v_value ->> 'booleanValue', '')::boolean,
      nullif(v_value ->> 'durationSeconds', '')::numeric,
      nullif(v_value ->> 'canonicalUnit', ''),
      v_observation ->> 'resolutionStatus',
      nullif(v_observation ->> 'resolutionMethod', ''),
      'AUTO_EXTRACTED',
      nullif(v_observation ->> 'confidence', '')::numeric,
      v_observed_at,
      nullif(v_observation ->> 'ignoredReasonCode', ''),
      nullif(v_observation ->> 'resolutionReason', '')
    )
    returning id into v_observation_id;
    v_observations := v_observations + 1;

    for v_candidate_payload in
      select value from jsonb_array_elements(coalesce(v_observation -> 'candidates', '[]'::jsonb))
    loop
      v_value := v_candidate_payload -> 'value';
      insert into public.catalog_spec_observation_candidates (
        observation_id,
        spec_definition_id,
        ordinal,
        display_value,
        numeric_value,
        numeric_upper_value,
        numeric_tolerance,
        text_value,
        boolean_value,
        duration_seconds,
        canonical_unit,
        comparison_operator,
        qualifiers,
        context_key
      ) values (
        v_observation_id,
        v_definition_id,
        (v_candidate_payload ->> 'ordinal')::integer,
        v_value ->> 'displayValue',
        nullif(v_value ->> 'numericValue', '')::numeric,
        nullif(v_value ->> 'numericUpperValue', '')::numeric,
        nullif(v_value ->> 'numericTolerance', '')::numeric,
        nullif(v_value ->> 'textValue', ''),
        nullif(v_value ->> 'booleanValue', '')::boolean,
        nullif(v_value ->> 'durationSeconds', '')::numeric,
        nullif(v_value ->> 'canonicalUnit', ''),
        v_value ->> 'comparisonOperator',
        v_candidate_payload -> 'qualifiers',
        v_candidate_payload ->> 'contextKey'
      );
      v_candidates := v_candidates + 1;
    end loop;
  end loop;

  for v_event in
    select value from jsonb_array_elements(coalesce(p_payload -> 'events', '[]'::jsonb))
  loop
    v_definition_id := null;
    if nullif(v_event ->> 'definitionKey', '') is not null then
      select definition.id into v_definition_id
      from public.catalog_spec_definitions definition
      where definition.canonical_key = v_event ->> 'definitionKey';
      if v_definition_id is null then
        raise exception using
          errcode = '22023',
          message = format('unknown event definition: %s', v_event ->> 'definitionKey');
      end if;
    end if;
    select observation.id into v_observation_id
    from public.catalog_spec_observations observation
    where observation.snapshot_id = v_snapshot_id
      and observation.source_path = v_event ->> 'sourcePath'
    order by observation.id
    limit 1;

    insert into public.catalog_intelligence_events (
      event_type,
      product_id,
      spec_definition_id,
      observation_id,
      payload,
      event_fingerprint
    ) values (
      v_event ->> 'eventType',
      v_product_id,
      v_definition_id,
      v_observation_id,
      v_event -> 'payload',
      v_event ->> 'eventFingerprint'
    )
    on conflict (event_fingerprint) do nothing;
    if found then v_events := v_events + 1; end if;
  end loop;

  for v_fact in
    select value from jsonb_array_elements(coalesce(p_payload -> 'canonicalFacts', '[]'::jsonb))
  loop
    select definition.id, coalesce(definition.change_tolerance, 0)
      into strict v_definition_id, v_tolerance
    from public.catalog_spec_definitions definition
    where definition.canonical_key = v_fact ->> 'definitionKey';

    select observation.id into strict v_observation_id
    from public.catalog_spec_observations observation
    where observation.snapshot_id = v_snapshot_id
      and observation.source_path = v_fact ->> 'sourcePath'
      and observation.source_variant_key is not distinct from nullif(v_fact ->> 'sourceVariantKey', '')
      and observation.product_variant_id is not distinct from nullif(v_fact ->> 'productVariantId', '')::uuid;

    select candidate.* into strict v_candidate
    from public.catalog_spec_observation_candidates candidate
    where candidate.observation_id = v_observation_id
      and candidate.ordinal = (v_fact ->> 'candidateOrdinal')::integer;
    v_candidate_id := v_candidate.id;

    select fact.* into v_current
    from public.product_spec_facts fact
    where fact.product_id = v_product_id
      and fact.product_variant_id is not distinct from nullif(v_fact ->> 'productVariantId', '')::uuid
      and fact.spec_definition_id = v_definition_id
      and fact.context_key = v_fact ->> 'contextKey'
    for update;
    v_current_found := found;

    if v_current_found then
      v_same_value := v_current.comparison_operator = v_candidate.comparison_operator
        and v_current.canonical_unit is not distinct from v_candidate.canonical_unit
        and v_current.qualifiers = v_candidate.qualifiers
        and (
          (v_candidate.numeric_value is not null
            and v_current.numeric_value is not null
            and abs(v_current.numeric_value - v_candidate.numeric_value) <= v_tolerance
            and (
              (v_current.numeric_upper_value is null and v_candidate.numeric_upper_value is null)
              or (v_current.numeric_upper_value is not null and v_candidate.numeric_upper_value is not null
                and abs(v_current.numeric_upper_value - v_candidate.numeric_upper_value) <= v_tolerance)
            )
            and (
              (v_current.numeric_tolerance is null and v_candidate.numeric_tolerance is null)
              or (v_current.numeric_tolerance is not null and v_candidate.numeric_tolerance is not null
                and abs(v_current.numeric_tolerance - v_candidate.numeric_tolerance) <= v_tolerance)
            ))
          or (v_candidate.text_value is not null and v_current.text_value = v_candidate.text_value)
          or (v_candidate.boolean_value is not null and v_current.boolean_value = v_candidate.boolean_value)
          or (v_candidate.duration_seconds is not null
            and v_current.duration_seconds is not null
            and abs(v_current.duration_seconds - v_candidate.duration_seconds) <= v_tolerance)
        );

      if not v_same_value and (
        v_current.verification_status = 'VERIFIED'
        or case v_current.source_authority
          when 'MANUAL_VERIFIED' then 4
          when 'OFFICIAL_PRIMARY' then 3
          when 'OFFICIAL_SECONDARY' then 2
          else 1
        end > 1
        or v_snapshot_completeness = 'PARTIAL'
      ) then
        insert into public.catalog_intelligence_events (
          event_type,
          product_id,
          spec_definition_id,
          observation_id,
          payload,
          event_fingerprint
        ) values (
          'CONFLICT',
          v_product_id,
          v_definition_id,
          v_observation_id,
          jsonb_build_object(
            'inputHash', v_input_hash,
            'contextKey', v_fact ->> 'contextKey',
            'reason', case
              when v_current.verification_status = 'VERIFIED' then 'Canonical fact đã VERIFIED nên snapshot mới không được overwrite.'
              when v_snapshot_completeness = 'PARTIAL' then 'Partial snapshot không được thay đổi canonical fact.'
              else 'Nguồn AUTO_EXTRACTED không được ghi đè nguồn authority cao hơn.'
            end,
            'currentFactId', v_current.id,
            'candidateId', v_candidate_id
          ),
          v_fact ->> 'eventFingerprint'
        )
        on conflict (event_fingerprint) do nothing;
        if found then v_events := v_events + 1; end if;
        v_conflicts := v_conflicts + 1;
      elsif v_same_value then
        update public.product_spec_facts
        set last_seen_at = greatest(last_seen_at, v_observed_at),
            updated_at = clock_timestamp()
        where id = v_current.id;
        v_kept := v_kept + 1;
      else
        update public.product_spec_facts
        set selected_observation_id = v_observation_id,
            selected_candidate_id = v_candidate_id,
            display_value = v_candidate.display_value,
            numeric_value = v_candidate.numeric_value,
            numeric_upper_value = v_candidate.numeric_upper_value,
            numeric_tolerance = v_candidate.numeric_tolerance,
            text_value = v_candidate.text_value,
            boolean_value = v_candidate.boolean_value,
            duration_seconds = v_candidate.duration_seconds,
            canonical_unit = v_candidate.canonical_unit,
            comparison_operator = v_candidate.comparison_operator,
            qualifiers = v_candidate.qualifiers,
            source_authority = v_fact ->> 'sourceAuthority',
            selection_reason = v_fact ->> 'selectionReason',
            selection_policy_version = v_selection_policy_version,
            last_seen_at = greatest(last_seen_at, v_observed_at),
            selected_at = v_observed_at,
            updated_at = clock_timestamp()
        where id = v_current.id;
        insert into public.catalog_intelligence_events (
          event_type, product_id, spec_definition_id, observation_id, payload, event_fingerprint
        ) values (
          'VALUE_CHANGED', v_product_id, v_definition_id, v_observation_id,
          jsonb_build_object('inputHash', v_input_hash, 'contextKey', v_fact ->> 'contextKey'),
          v_fact ->> 'eventFingerprint'
        ) on conflict (event_fingerprint) do nothing;
        if found then v_events := v_events + 1; end if;
        v_updated := v_updated + 1;
      end if;
    else
      insert into public.product_spec_facts (
        product_id,
        product_variant_id,
        spec_definition_id,
        selected_observation_id,
        selected_candidate_id,
        display_value,
        numeric_value,
        numeric_upper_value,
        numeric_tolerance,
        text_value,
        boolean_value,
        duration_seconds,
        canonical_unit,
        comparison_operator,
        qualifiers,
        context_key,
        verification_status,
        source_authority,
        selection_reason,
        selection_policy_version,
        first_seen_at,
        last_seen_at,
        selected_at
      ) values (
        v_product_id,
        nullif(v_fact ->> 'productVariantId', '')::uuid,
        v_definition_id,
        v_observation_id,
        v_candidate_id,
        v_candidate.display_value,
        v_candidate.numeric_value,
        v_candidate.numeric_upper_value,
        v_candidate.numeric_tolerance,
        v_candidate.text_value,
        v_candidate.boolean_value,
        v_candidate.duration_seconds,
        v_candidate.canonical_unit,
        v_candidate.comparison_operator,
        v_candidate.qualifiers,
        v_fact ->> 'contextKey',
        'AUTO',
        v_fact ->> 'sourceAuthority',
        v_fact ->> 'selectionReason',
        v_selection_policy_version,
        v_observed_at,
        v_observed_at,
        v_observed_at
      );
      insert into public.catalog_intelligence_events (
        event_type, product_id, spec_definition_id, observation_id, payload, event_fingerprint
      ) values (
        'NEW_FACT', v_product_id, v_definition_id, v_observation_id,
        jsonb_build_object('inputHash', v_input_hash, 'contextKey', v_fact ->> 'contextKey'),
        v_fact ->> 'eventFingerprint'
      ) on conflict (event_fingerprint) do nothing;
      if found then v_events := v_events + 1; end if;
      v_created := v_created + 1;
    end if;
  end loop;

  update public.catalog_spec_ingestion_jobs
  set status = 'COMPLETED',
      completed_at = clock_timestamp(),
      claimed_at = null,
      claimed_by = null,
      last_error = null
  where id = v_job_id;

  if v_created + v_updated > 0 then
    update public.catalog_runtime_revision
    set facts_revision = facts_revision + 1,
        updated_at = clock_timestamp()
    where singleton = true;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'productId', v_product_id,
    'snapshotId', v_snapshot_id,
    'observations', v_observations,
    'candidates', v_candidates,
    'factsCreated', v_created,
    'factsUpdated', v_updated,
    'factsKept', v_kept,
    'conflicts', v_conflicts,
    'events', v_events
  );
end;
$$;

revoke all on function public.persist_catalog_intelligence_snapshot(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_catalog_intelligence_snapshot(jsonb)
  to service_role;

comment on function public.persist_catalog_intelligence_snapshot(jsonb) is
  'Atomically persists one versioned catalog-intelligence snapshot. Same product/input_hash is idempotent; VERIFIED and higher-authority facts fail closed to CONFLICT events.';

commit;

-- Rollback: drop function public.persist_catalog_intelligence_snapshot(jsonb).
