-- Atomic, admin-only publication for an explicitly approved after-sales release.
-- Depends on 060_after_sales_persistence.sql.

create table if not exists public.after_sales_publication_releases (
  release_id text primary key,
  manifest_hash text not null unique,
  payload_hash text not null unique,
  review_dataset_hash text not null,
  service_locations_hash text not null,
  approved_by text not null,
  approved_at timestamptz not null,
  counts jsonb not null,
  manifest jsonb not null,
  status text not null default 'publishing',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint after_sales_publication_releases_status_check
    check (status in ('publishing', 'published', 'superseded')),
  constraint after_sales_publication_releases_hash_check
    check (
      manifest_hash like 'sha256:%'
      and payload_hash like 'sha256:%'
      and review_dataset_hash like 'sha256:%'
      and service_locations_hash like 'sha256:%'
    )
);

alter table public.after_sales_facts
  add column if not exists review_reasons text[] not null default '{}';

alter table public.after_sales_facts
  add column if not exists publication_status text not null default 'review_required';

alter table public.after_sales_facts
  add column if not exists supersedes_fact_ids text[] not null default '{}';

alter table public.after_sales_facts
  add column if not exists source_fact_group_ids text[] not null default '{}';

alter table public.after_sales_facts
  add column if not exists release_id text references public.after_sales_publication_releases(release_id) on delete restrict;

alter table public.after_sales_fact_evidence
  add column if not exists release_id text references public.after_sales_publication_releases(release_id) on delete restrict;

alter table public.after_sales_fact_approvals
  add column if not exists release_id text references public.after_sales_publication_releases(release_id) on delete restrict;

create table if not exists public.after_sales_service_locations (
  location_id text primary key,
  release_id text not null references public.after_sales_publication_releases(release_id) on delete restrict,
  source_snapshot_id text not null,
  source_system text not null,
  upstream_identity jsonb not null,
  name text not null,
  location_type text not null,
  location_category text not null,
  category_label text,
  vehicle_types text[] not null,
  service_types text[] not null,
  bookable_service_types text[] not null default '{}',
  capability_granularity text not null,
  address jsonb not null,
  contact jsonb not null,
  service_hours jsonb not null,
  booking_actions jsonb not null default '[]'::jsonb,
  operational_status text not null,
  status_basis text not null,
  review_status text not null,
  evidence jsonb not null,
  approved_by text not null,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint after_sales_service_locations_category_check
    check (location_category in ('official_car_workshop', 'partner_car_workshop', 'electric_motorbike_workshop')),
  constraint after_sales_service_locations_status_check
    check (operational_status in ('active', 'inactive')),
  constraint after_sales_service_locations_review_check
    check (review_status = 'approved'),
  constraint after_sales_service_locations_capability_check
    check (capability_granularity = 'location_category_only' and service_types = array['general_after_sales']::text[])
);

create index if not exists idx_after_sales_facts_release
  on public.after_sales_facts(release_id, approval_status, publication_status);

create index if not exists idx_after_sales_evidence_release
  on public.after_sales_fact_evidence(release_id, fact_id);

create index if not exists idx_after_sales_approvals_release
  on public.after_sales_fact_approvals(release_id, fact_id);

create index if not exists idx_after_sales_service_locations_release_category
  on public.after_sales_service_locations(release_id, location_category, operational_status);

create unique index if not exists idx_after_sales_single_published_release
  on public.after_sales_publication_releases((status))
  where status = 'published';

create or replace view public.after_sales_current_published_release as
select
  release_id,
  manifest_hash,
  payload_hash,
  review_dataset_hash,
  service_locations_hash,
  approved_by,
  approved_at,
  counts,
  published_at
from public.after_sales_publication_releases
where status = 'published';

create or replace view public.after_sales_published_facts as
select
  f.*,
  coalesce(
    jsonb_agg(to_jsonb(e) order by e.pdf_page nulls last, e.evidence_id)
      filter (where e.evidence_id is not null),
    '[]'::jsonb
  ) as evidence
from public.after_sales_facts f
join public.after_sales_publication_releases r
  on r.release_id = f.release_id
  and r.status = 'published'
left join public.after_sales_fact_evidence e
  on e.fact_id = f.fact_id
  and e.release_id = f.release_id
where f.approval_status = 'approved'
  and f.publication_status = 'approved_for_publication'
group by f.fact_id;

create or replace view public.after_sales_published_service_locations as
select l.*
from public.after_sales_service_locations l
join public.after_sales_publication_releases r
  on r.release_id = l.release_id
  and r.status = 'published'
where l.review_status = 'approved';

create or replace function public.publish_after_sales_release(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_release jsonb := p_payload -> 'release';
  v_manifest jsonb := p_payload -> 'manifest';
  v_release_id text := v_release ->> 'release_id';
  v_counts jsonb := v_release -> 'counts';
  v_existing_manifest_hash text;
  v_existing_payload_hash text;
  v_replayed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'publish_after_sales_release requires service_role';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(v_release) <> 'object'
    or jsonb_typeof(v_manifest) <> 'object'
    or nullif(v_release_id, '') is null then
    raise exception 'invalid after-sales release payload';
  end if;

  if v_manifest ->> 'releaseId' is distinct from v_release_id
    or v_manifest ->> 'decision' is distinct from 'APPROVED_FOR_SUPABASE'
    or v_manifest #>> '{publication,requiredReleaseId}' is distinct from v_release_id then
    raise exception 'manifest is not approved for this release';
  end if;

  if v_release ->> 'review_dataset_hash' is distinct from v_manifest #>> '{datasets,reviewDataset,sha256}'
    or v_release ->> 'service_locations_hash' is distinct from v_manifest #>> '{datasets,serviceLocations,sha256}'
    or v_release ->> 'approved_by' is distinct from v_manifest #>> '{reviewer,id}'
    or v_release ->> 'approved_at' is distinct from v_manifest ->> 'approvedAt' then
    raise exception 'release metadata does not match its approved manifest';
  end if;

  if jsonb_typeof(p_payload -> 'sources') <> 'array'
    or jsonb_typeof(p_payload -> 'assets') <> 'array'
    or jsonb_typeof(p_payload -> 'facts') <> 'array'
    or jsonb_typeof(p_payload -> 'evidence') <> 'array'
    or jsonb_typeof(p_payload -> 'approvals') <> 'array'
    or jsonb_typeof(p_payload -> 'service_locations') <> 'array' then
    raise exception 'release payload tables must be JSON arrays';
  end if;

  if jsonb_array_length(p_payload -> 'sources') <> (v_counts ->> 'sources')::integer
    or jsonb_array_length(p_payload -> 'assets') <> (v_counts ->> 'assets')::integer
    or jsonb_array_length(p_payload -> 'facts') <> (v_counts ->> 'facts')::integer
    or jsonb_array_length(p_payload -> 'evidence') <> (v_counts ->> 'evidence')::integer
    or jsonb_array_length(p_payload -> 'approvals') <> (v_counts ->> 'approvals')::integer
    or jsonb_array_length(p_payload -> 'service_locations') <> (v_counts ->> 'serviceLocations')::integer then
    raise exception 'release payload counts do not match approved metadata';
  end if;

  if (v_counts ->> 'facts')::integer <= 0
    or (v_counts ->> 'evidence')::integer <= 0
    or (v_counts ->> 'approvals')::integer <> (v_counts ->> 'facts')::integer
    or (v_counts ->> 'serviceLocations')::integer <= 0 then
    raise exception 'release payload is incomplete';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'sources') item
    where item ->> 'source_url' !~ '^https://([a-z0-9-]+\.)*vinfastauto\.com/'
  ) then
    raise exception 'release contains a non-official source URL';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'facts') item
    where item ->> 'release_id' is distinct from v_release_id
      or item ->> 'approval_status' is distinct from 'approved'
      or item ->> 'source_review_status' is distinct from 'approved'
      or item ->> 'publication_status' is distinct from 'approved_for_publication'
      or nullif(item ->> 'approved_by', '') is null
      or nullif(item ->> 'approved_at', '') is null
  ) then
    raise exception 'every fact must be approved and bound to this release';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'evidence') item
    where item ->> 'release_id' is distinct from v_release_id
      or item ->> 'source_url' !~ '^https://([a-z0-9-]+\.)*vinfastauto\.com/'
      or nullif(item ->> 'excerpt', '') is null
  ) then
    raise exception 'evidence is incomplete, non-official, or not bound to this release';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'approvals') item
    where item ->> 'release_id' is distinct from v_release_id
      or item ->> 'from_status' is distinct from 'pending'
      or item ->> 'to_status' is distinct from 'approved'
      or nullif(item ->> 'reviewer_id', '') is null
      or nullif(item ->> 'reviewed_at', '') is null
  ) then
    raise exception 'approval history is incomplete or not bound to this release';
  end if;

  if (
    select count(distinct (item ->> 'fact_id'))
    from jsonb_array_elements(p_payload -> 'approvals') item
  ) <> (v_counts ->> 'facts')::integer then
    raise exception 'every fact requires exactly one release approval event';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'service_locations') item
    where item ->> 'release_id' is distinct from v_release_id
      or item ->> 'review_status' is distinct from 'approved'
      or item ->> 'capability_granularity' is distinct from 'location_category_only'
      or item -> 'service_types' is distinct from '["general_after_sales"]'::jsonb
      or item ->> 'operational_status' not in ('active', 'inactive')
      or nullif(item ->> 'approved_by', '') is null
      or nullif(item ->> 'approved_at', '') is null
  ) then
    raise exception 'service locations violate the approved no-inference scope';
  end if;

  if p_payload::text ~* 'incident_data_attributes|custom_url|\.my\.salesforce\.com|/services/data/v[0-9]+' then
    raise exception 'release payload contains blocked internal locator data';
  end if;

  select manifest_hash, payload_hash
  into v_existing_manifest_hash, v_existing_payload_hash
  from public.after_sales_publication_releases
  where release_id = v_release_id;

  if found then
    if v_existing_manifest_hash is distinct from v_release ->> 'manifest_hash'
      or v_existing_payload_hash is distinct from v_release ->> 'payload_hash' then
      raise exception 'release id already exists with different immutable hashes';
    end if;
    v_replayed := true;
  end if;

  insert into public.after_sales_publication_releases (
    release_id,
    manifest_hash,
    payload_hash,
    review_dataset_hash,
    service_locations_hash,
    approved_by,
    approved_at,
    counts,
    manifest,
    status
  ) values (
    v_release_id,
    v_release ->> 'manifest_hash',
    v_release ->> 'payload_hash',
    v_release ->> 'review_dataset_hash',
    v_release ->> 'service_locations_hash',
    v_release ->> 'approved_by',
    (v_release ->> 'approved_at')::timestamptz,
    v_counts,
    v_manifest,
    'publishing'
  )
  on conflict (release_id) do nothing;

  insert into public.after_sales_sources (
    source_id, source_url, service_type, vehicle_type, scope, title,
    snapshot_id, snapshot_hash, captured_at, capture_method, http_status,
    availability, updated_at
  )
  select
    x.source_id, x.source_url, x.service_type, x.vehicle_type, x.scope, x.title,
    x.snapshot_id, x.snapshot_hash, x.captured_at, x.capture_method, x.http_status,
    x.availability, now()
  from jsonb_to_recordset(p_payload -> 'sources') as x(
    source_id text,
    source_url text,
    service_type text,
    vehicle_type text,
    scope jsonb,
    title text,
    snapshot_id text,
    snapshot_hash text,
    captured_at timestamptz,
    capture_method text,
    http_status integer,
    availability text
  )
  on conflict (source_id) do update set
    source_url = excluded.source_url,
    service_type = excluded.service_type,
    vehicle_type = excluded.vehicle_type,
    scope = excluded.scope,
    title = excluded.title,
    snapshot_id = excluded.snapshot_id,
    snapshot_hash = excluded.snapshot_hash,
    captured_at = excluded.captured_at,
    capture_method = excluded.capture_method,
    http_status = excluded.http_status,
    availability = excluded.availability,
    updated_at = now();

  insert into public.after_sales_assets (
    asset_id, source_id, asset_url, asset_type, label, content_hash,
    mime_type, byte_length, classification, verification, updated_at
  )
  select
    x.asset_id, x.source_id, x.asset_url, x.asset_type, x.label, x.content_hash,
    x.mime_type, x.byte_length, x.classification, x.verification, now()
  from jsonb_to_recordset(p_payload -> 'assets') as x(
    asset_id text,
    source_id text,
    asset_url text,
    asset_type text,
    label text,
    content_hash text,
    mime_type text,
    byte_length bigint,
    classification jsonb,
    verification jsonb
  )
  on conflict (asset_id) do update set
    source_id = excluded.source_id,
    asset_url = excluded.asset_url,
    asset_type = excluded.asset_type,
    label = excluded.label,
    content_hash = excluded.content_hash,
    mime_type = excluded.mime_type,
    byte_length = excluded.byte_length,
    classification = excluded.classification,
    verification = excluded.verification,
    updated_at = now();

  insert into public.after_sales_facts (
    fact_id, fact_group_id, canonical_key, primary_source_id, source_ids,
    service_type, vehicle_type, powertrain, model, subject, policy_entity,
    battery_chemistry, usage_condition, applicability, action, fact_type,
    value_numeric, value_text, unit, qualifier, interval_relation,
    interval_group_id, interval_group_distance_policy, distance_policy,
    confidence, source_review_status, review_reasons, publication_status,
    supersedes_fact_ids, source_fact_group_ids, alternative_triggers, semantic_flags,
    group_semantic_flags, approval_status, reviewer_id, reviewed_at,
    approved_by, approved_at, approval_note, release_id, updated_at
  )
  select
    x.fact_id, x.fact_group_id, x.canonical_key, x.primary_source_id, x.source_ids,
    x.service_type, x.vehicle_type, x.powertrain, x.model, x.subject, x.policy_entity,
    x.battery_chemistry, x.usage_condition, x.applicability, x.action, x.fact_type,
    x.value_numeric, x.value_text, x.unit, x.qualifier, x.interval_relation,
    x.interval_group_id, x.interval_group_distance_policy, x.distance_policy,
    x.confidence, x.source_review_status, x.review_reasons, x.publication_status,
    x.supersedes_fact_ids, x.source_fact_group_ids, x.alternative_triggers, x.semantic_flags,
    x.group_semantic_flags, x.approval_status, x.reviewer_id, x.reviewed_at,
    x.approved_by, x.approved_at, x.approval_note, x.release_id, now()
  from jsonb_to_recordset(p_payload -> 'facts') as x(
    fact_id text,
    fact_group_id text,
    canonical_key text,
    primary_source_id text,
    source_ids text[],
    service_type text,
    vehicle_type text,
    powertrain text,
    model text,
    subject text,
    policy_entity text,
    battery_chemistry text,
    usage_condition text,
    applicability text,
    action text,
    fact_type text,
    value_numeric numeric,
    value_text text,
    unit text,
    qualifier text,
    interval_relation text,
    interval_group_id text,
    interval_group_distance_policy text,
    distance_policy text,
    confidence numeric,
    source_review_status text,
    review_reasons text[],
    publication_status text,
    supersedes_fact_ids text[],
    source_fact_group_ids text[],
    alternative_triggers jsonb,
    semantic_flags jsonb,
    group_semantic_flags jsonb,
    approval_status text,
    reviewer_id text,
    reviewed_at timestamptz,
    approved_by text,
    approved_at timestamptz,
    approval_note text,
    release_id text
  )
  on conflict (fact_id) do update set
    fact_group_id = excluded.fact_group_id,
    canonical_key = excluded.canonical_key,
    primary_source_id = excluded.primary_source_id,
    source_ids = excluded.source_ids,
    service_type = excluded.service_type,
    vehicle_type = excluded.vehicle_type,
    powertrain = excluded.powertrain,
    model = excluded.model,
    subject = excluded.subject,
    policy_entity = excluded.policy_entity,
    battery_chemistry = excluded.battery_chemistry,
    usage_condition = excluded.usage_condition,
    applicability = excluded.applicability,
    action = excluded.action,
    fact_type = excluded.fact_type,
    value_numeric = excluded.value_numeric,
    value_text = excluded.value_text,
    unit = excluded.unit,
    qualifier = excluded.qualifier,
    interval_relation = excluded.interval_relation,
    interval_group_id = excluded.interval_group_id,
    interval_group_distance_policy = excluded.interval_group_distance_policy,
    distance_policy = excluded.distance_policy,
    confidence = excluded.confidence,
    source_review_status = excluded.source_review_status,
    review_reasons = excluded.review_reasons,
    publication_status = excluded.publication_status,
    supersedes_fact_ids = excluded.supersedes_fact_ids,
    source_fact_group_ids = excluded.source_fact_group_ids,
    alternative_triggers = excluded.alternative_triggers,
    semantic_flags = excluded.semantic_flags,
    group_semantic_flags = excluded.group_semantic_flags,
    approval_status = excluded.approval_status,
    reviewer_id = excluded.reviewer_id,
    reviewed_at = excluded.reviewed_at,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    approval_note = excluded.approval_note,
    release_id = excluded.release_id,
    updated_at = now();

  insert into public.after_sales_fact_evidence (
    fact_id, evidence_id, source_id, asset_id, source_url, snapshot_hash,
    captured_at, origin, asset_url, asset_hash, pdf_page, extraction_method,
    extraction_confidence, source_value_text, excerpt, context_index,
    raw_provenance, release_id
  )
  select
    x.fact_id, x.evidence_id, x.source_id, x.asset_id, x.source_url, x.snapshot_hash,
    x.captured_at, x.origin, x.asset_url, x.asset_hash, x.pdf_page, x.extraction_method,
    x.extraction_confidence, x.source_value_text, x.excerpt, x.context_index,
    x.raw_provenance, x.release_id
  from jsonb_to_recordset(p_payload -> 'evidence') as x(
    fact_id text,
    evidence_id text,
    source_id text,
    asset_id text,
    source_url text,
    snapshot_hash text,
    captured_at timestamptz,
    origin text,
    asset_url text,
    asset_hash text,
    pdf_page integer,
    extraction_method text,
    extraction_confidence numeric,
    source_value_text text,
    excerpt text,
    context_index jsonb,
    raw_provenance jsonb,
    release_id text
  )
  on conflict (fact_id, evidence_id) do update set
    source_id = excluded.source_id,
    asset_id = excluded.asset_id,
    source_url = excluded.source_url,
    snapshot_hash = excluded.snapshot_hash,
    captured_at = excluded.captured_at,
    origin = excluded.origin,
    asset_url = excluded.asset_url,
    asset_hash = excluded.asset_hash,
    pdf_page = excluded.pdf_page,
    extraction_method = excluded.extraction_method,
    extraction_confidence = excluded.extraction_confidence,
    source_value_text = excluded.source_value_text,
    excerpt = excluded.excerpt,
    context_index = excluded.context_index,
    raw_provenance = excluded.raw_provenance,
    release_id = excluded.release_id;

  if exists (
    select 1
    from public.after_sales_fact_approvals existing
    join jsonb_to_recordset(p_payload -> 'approvals') as incoming(
      approval_id uuid,
      fact_id text,
      from_status text,
      to_status text,
      reviewer_id text,
      reviewed_at timestamptz,
      note text,
      release_id text
    ) on incoming.approval_id = existing.approval_id
    where existing.fact_id is distinct from incoming.fact_id
      or existing.from_status is distinct from incoming.from_status
      or existing.to_status is distinct from incoming.to_status
      or existing.reviewer_id is distinct from incoming.reviewer_id
      or existing.reviewed_at is distinct from incoming.reviewed_at
      or existing.note is distinct from incoming.note
      or existing.release_id is distinct from incoming.release_id
  ) then
    raise exception 'append-only approval event identity collision';
  end if;

  insert into public.after_sales_fact_approvals (
    approval_id, fact_id, from_status, to_status, reviewer_id,
    reviewed_at, note, release_id
  )
  select
    x.approval_id, x.fact_id, x.from_status, x.to_status, x.reviewer_id,
    x.reviewed_at, x.note, x.release_id
  from jsonb_to_recordset(p_payload -> 'approvals') as x(
    approval_id uuid,
    fact_id text,
    from_status text,
    to_status text,
    reviewer_id text,
    reviewed_at timestamptz,
    note text,
    release_id text
  )
  on conflict (approval_id) do nothing;

  insert into public.after_sales_service_locations (
    location_id, release_id, source_snapshot_id, source_system,
    upstream_identity, name, location_type, location_category, category_label,
    vehicle_types, service_types, bookable_service_types,
    capability_granularity, address, contact, service_hours, booking_actions,
    operational_status, status_basis, review_status, evidence,
    approved_by, approved_at, updated_at
  )
  select
    x.location_id, x.release_id, x.source_snapshot_id, x.source_system,
    x.upstream_identity, x.name, x.location_type, x.location_category, x.category_label,
    x.vehicle_types, x.service_types, x.bookable_service_types,
    x.capability_granularity, x.address, x.contact, x.service_hours, x.booking_actions,
    x.operational_status, x.status_basis, x.review_status, x.evidence,
    x.approved_by, x.approved_at, now()
  from jsonb_to_recordset(p_payload -> 'service_locations') as x(
    location_id text,
    release_id text,
    source_snapshot_id text,
    source_system text,
    upstream_identity jsonb,
    name text,
    location_type text,
    location_category text,
    category_label text,
    vehicle_types text[],
    service_types text[],
    bookable_service_types text[],
    capability_granularity text,
    address jsonb,
    contact jsonb,
    service_hours jsonb,
    booking_actions jsonb,
    operational_status text,
    status_basis text,
    review_status text,
    evidence jsonb,
    approved_by text,
    approved_at timestamptz
  )
  on conflict (location_id) do update set
    release_id = excluded.release_id,
    source_snapshot_id = excluded.source_snapshot_id,
    source_system = excluded.source_system,
    upstream_identity = excluded.upstream_identity,
    name = excluded.name,
    location_type = excluded.location_type,
    location_category = excluded.location_category,
    category_label = excluded.category_label,
    vehicle_types = excluded.vehicle_types,
    service_types = excluded.service_types,
    bookable_service_types = excluded.bookable_service_types,
    capability_granularity = excluded.capability_granularity,
    address = excluded.address,
    contact = excluded.contact,
    service_hours = excluded.service_hours,
    booking_actions = excluded.booking_actions,
    operational_status = excluded.operational_status,
    status_basis = excluded.status_basis,
    review_status = excluded.review_status,
    evidence = excluded.evidence,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    updated_at = now();

  update public.after_sales_publication_releases
  set status = 'superseded', updated_at = now()
  where status = 'published'
    and release_id <> v_release_id;

  update public.after_sales_publication_releases
  set status = 'published',
      published_at = coalesce(published_at, now()),
      updated_at = now()
  where release_id = v_release_id;

  return jsonb_build_object(
    'releaseId', v_release_id,
    'action', case when v_replayed then 'replayed_idempotently' else 'published' end,
    'status', 'published',
    'counts', v_counts
  );
end;
$$;

alter table public.after_sales_publication_releases enable row level security;
alter table public.after_sales_service_locations enable row level security;

revoke all on table public.after_sales_publication_releases from public, anon, authenticated, service_role;
revoke all on table public.after_sales_service_locations from public, anon, authenticated, service_role;
revoke all on table public.after_sales_current_published_release from public, anon, authenticated, service_role;
revoke all on table public.after_sales_published_facts from public, anon, authenticated, service_role;
revoke all on table public.after_sales_published_service_locations from public, anon, authenticated, service_role;
revoke all on function public.publish_after_sales_release(jsonb) from public, anon, authenticated, service_role;

-- 060 initially allowed service_role to stage rows directly. Publication is now
-- RPC-only so a leaked worker/runtime path cannot bypass approval projections.
revoke insert, update, delete, truncate on table public.after_sales_sources from service_role;
revoke insert, update, delete, truncate on table public.after_sales_assets from service_role;
revoke insert, update, delete, truncate on table public.after_sales_facts from service_role;
revoke insert, update, delete, truncate on table public.after_sales_fact_evidence from service_role;
revoke insert, update, delete, truncate on table public.after_sales_fact_approvals from service_role;

grant select on table public.after_sales_publication_releases to service_role;
grant select on table public.after_sales_service_locations to service_role;
grant select on table public.after_sales_current_published_release to service_role;
grant select on table public.after_sales_published_facts to service_role;
grant select on table public.after_sales_published_service_locations to service_role;
grant execute on function public.publish_after_sales_release(jsonb) to service_role;

comment on table public.after_sales_publication_releases is 'Immutable hash-bound approval manifests and atomic Supabase publication state.';
comment on table public.after_sales_service_locations is 'Admin-approved official workshop locations; detailed per-location capabilities are intentionally not inferred.';
comment on function public.publish_after_sales_release(jsonb) is 'Service-role-only, all-or-nothing publisher for a hash-verified after-sales release.';
