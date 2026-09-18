begin;

-- Catalog Intelligence is a deterministic read model over products.specifications.
-- Raw catalog JSON remains the publication source while observations retain
-- provenance and product_spec_facts contains only the selected canonical value.

create table public.catalog_spec_definitions (
  id uuid primary key default gen_random_uuid(),
  canonical_key varchar(100) not null unique,
  label_vi varchar(200) not null,
  label_en varchar(200),
  value_type varchar(20) not null,
  unit_dimension varchar(30),
  canonical_unit varchar(30),
  is_sortable boolean not null default false,
  is_searchable boolean not null default true,
  ranking_aggregation varchar(10),
  change_tolerance numeric,
  status varchar(20) not null default 'ACTIVE',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_definitions_key_check
    check (canonical_key ~ '^[a-z][a-z0-9_]*$'),
  constraint catalog_spec_definitions_value_type_check
    check (value_type in ('NUMBER', 'TEXT', 'BOOLEAN', 'DURATION')),
  constraint catalog_spec_definitions_unit_dimension_check
    check (unit_dimension is null or unit_dimension in ('DISTANCE', 'SPEED', 'POWER', 'ENERGY', 'TORQUE', 'TIME', 'COUNT')),
  constraint catalog_spec_definitions_ranking_check
    check (ranking_aggregation is null or ranking_aggregation in ('MIN', 'MAX')),
  constraint catalog_spec_definitions_tolerance_check
    check (change_tolerance is null or change_tolerance >= 0),
  constraint catalog_spec_definitions_status_check
    check (status in ('ACTIVE', 'RETIRED'))
);

create table public.catalog_spec_aliases (
  id uuid primary key default gen_random_uuid(),
  spec_definition_id uuid not null
    references public.catalog_spec_definitions(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (
    public.fastlane_normalize_product_search(alias)
  ) stored,
  product_type varchar(20) not null default '*',
  source_schema varchar(80) not null default '*',
  match_kind varchar(20) not null default 'LABEL',
  created_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_aliases_product_type_check
    check (product_type in ('*', 'CAR', 'MOTORBIKE', 'ACCESSORY')),
  constraint catalog_spec_aliases_match_kind_check
    check (match_kind in ('LABEL', 'PATH')),
  constraint catalog_spec_aliases_value_check
    check (btrim(alias) <> '' and btrim(normalized_alias) <> '')
);

create unique index catalog_spec_alias_resolution_uq
  on public.catalog_spec_aliases(product_type, source_schema, match_kind, normalized_alias);

create index catalog_spec_alias_definition_idx
  on public.catalog_spec_aliases(spec_definition_id);

create table public.catalog_runtime_revision (
  singleton boolean primary key default true,
  facts_revision bigint not null default 1,
  registry_revision bigint not null default 1,
  extractor_version varchar(80) not null,
  selection_policy_version varchar(80) not null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint catalog_runtime_revision_singleton_check check (singleton),
  constraint catalog_runtime_revision_facts_check check (facts_revision >= 1),
  constraint catalog_runtime_revision_registry_check check (registry_revision >= 1),
  constraint catalog_runtime_revision_extractor_check check (btrim(extractor_version) <> ''),
  constraint catalog_runtime_revision_policy_check check (btrim(selection_policy_version) <> '')
);

insert into public.catalog_runtime_revision
  (singleton, facts_revision, registry_revision, extractor_version, selection_policy_version)
values
  (true, 1, 1, 'catalog-extractor-v1', 'catalog-selection-v1')
on conflict (singleton) do nothing;

create table public.catalog_spec_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_type varchar(20) not null,
  extractor_version varchar(80) not null,
  specifications_snapshot jsonb not null,
  queue_fingerprint varchar(32) not null,
  snapshot_completeness varchar(20) not null default 'FULL',
  status varchar(20) not null default 'PENDING',
  attempts integer not null default 0,
  available_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_jobs_product_type_check
    check (product_type in ('CAR', 'MOTORBIKE', 'ACCESSORY')),
  constraint catalog_spec_jobs_completeness_check
    check (snapshot_completeness in ('FULL', 'PARTIAL')),
  constraint catalog_spec_jobs_status_check
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  constraint catalog_spec_jobs_attempts_check check (attempts >= 0),
  unique (product_id, extractor_version, queue_fingerprint)
);

create index catalog_spec_jobs_claim_idx
  on public.catalog_spec_ingestion_jobs(available_at, created_at, id)
  where status = 'PENDING';

create table public.catalog_spec_snapshots (
  id uuid primary key default gen_random_uuid(),
  ingestion_job_id uuid not null unique
    references public.catalog_spec_ingestion_jobs(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  input_hash varchar(64) not null,
  extractor_version varchar(80) not null,
  snapshot_completeness varchar(20) not null,
  specifications_snapshot jsonb not null,
  source_uri text,
  captured_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_snapshots_hash_check
    check (input_hash ~ '^[a-f0-9]{64}$'),
  constraint catalog_spec_snapshots_completeness_check
    check (snapshot_completeness in ('FULL', 'PARTIAL')),
  unique (product_id, input_hash)
);

create table public.catalog_spec_observations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null
    references public.catalog_spec_snapshots(id) on delete cascade,
  ingestion_job_id uuid not null
    references public.catalog_spec_ingestion_jobs(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  source_variant_key text,
  spec_definition_id uuid references public.catalog_spec_definitions(id) on delete restrict,
  source_schema varchar(80) not null,
  source_path text not null,
  source_uri text,
  raw_key text not null,
  raw_value jsonb not null,
  display_value text,
  numeric_value numeric,
  text_value text,
  boolean_value boolean,
  duration_seconds numeric,
  canonical_unit varchar(30),
  resolution_status varchar(30) not null,
  resolution_method varchar(30),
  source_authority varchar(30) not null default 'AUTO_EXTRACTED',
  confidence numeric(5,4),
  observed_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_observations_status_check
    check (resolution_status in ('RESOLVED', 'UNKNOWN_SPEC', 'AMBIGUOUS', 'INVALID_VALUE', 'IGNORED')),
  constraint catalog_spec_observations_method_check
    check (resolution_method is null or resolution_method in ('PATH', 'LABEL', 'ADMIN')),
  constraint catalog_spec_observations_authority_check
    check (source_authority in ('AUTO_EXTRACTED', 'OFFICIAL_SECONDARY', 'OFFICIAL_PRIMARY', 'MANUAL_VERIFIED')),
  constraint catalog_spec_observations_confidence_check
    check (confidence is null or confidence between 0 and 1),
  constraint catalog_spec_observations_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint catalog_spec_observations_single_value_check
    check (num_nonnulls(numeric_value, text_value, boolean_value, duration_seconds) <= 1),
  constraint catalog_spec_observations_resolved_definition_check
    check (resolution_status <> 'RESOLVED' or spec_definition_id is not null)
);

create unique index catalog_spec_observation_source_uq
  on public.catalog_spec_observations(snapshot_id, product_variant_id, source_variant_key, source_path)
  nulls not distinct;

create index catalog_spec_observation_product_idx
  on public.catalog_spec_observations(product_id, spec_definition_id, observed_at desc);

create index catalog_spec_observation_review_idx
  on public.catalog_spec_observations(resolution_status, observed_at desc)
  where resolution_status in ('UNKNOWN_SPEC', 'AMBIGUOUS', 'INVALID_VALUE');

create table public.product_spec_facts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete cascade,
  spec_definition_id uuid not null
    references public.catalog_spec_definitions(id) on delete restrict,
  selected_observation_id uuid not null
    references public.catalog_spec_observations(id) on delete restrict,
  display_value text not null,
  numeric_value numeric,
  text_value text,
  boolean_value boolean,
  duration_seconds numeric,
  canonical_unit varchar(30),
  verification_status varchar(20) not null default 'AUTO',
  source_authority varchar(30) not null,
  selection_reason text not null,
  selection_policy_version varchar(80) not null,
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  selected_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint product_spec_facts_verification_check
    check (verification_status in ('AUTO', 'VERIFIED')),
  constraint product_spec_facts_authority_check
    check (source_authority in ('AUTO_EXTRACTED', 'OFFICIAL_SECONDARY', 'OFFICIAL_PRIMARY', 'MANUAL_VERIFIED')),
  constraint product_spec_facts_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint product_spec_facts_single_value_check
    check (num_nonnulls(numeric_value, text_value, boolean_value, duration_seconds) = 1)
);

create unique index product_spec_fact_product_uq
  on public.product_spec_facts(product_id, spec_definition_id)
  where product_variant_id is null;

create unique index product_spec_fact_variant_uq
  on public.product_spec_facts(product_id, product_variant_id, spec_definition_id)
  where product_variant_id is not null;

create index product_spec_fact_ranking_idx
  on public.product_spec_facts(spec_definition_id, numeric_value, product_id)
  where numeric_value is not null;

create table public.catalog_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  event_type varchar(30) not null,
  status varchar(20) not null default 'OPEN',
  product_id uuid not null references public.products(id) on delete cascade,
  spec_definition_id uuid references public.catalog_spec_definitions(id) on delete set null,
  observation_id uuid references public.catalog_spec_observations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  event_fingerprint varchar(64) not null,
  detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by text,
  constraint catalog_intelligence_events_type_check
    check (event_type in ('NEW_FACT', 'VALUE_CHANGED', 'NEW_SPEC_TYPE', 'CONFLICT', 'INVALID_VALUE')),
  constraint catalog_intelligence_events_status_check
    check (status in ('OPEN', 'APPROVED', 'MAPPED', 'IGNORED')),
  constraint catalog_intelligence_events_fingerprint_check
    check (event_fingerprint ~ '^[a-f0-9]{64}$'),
  unique (event_fingerprint)
);

create index catalog_intelligence_events_review_idx
  on public.catalog_intelligence_events(status, detected_at desc)
  where status = 'OPEN';

insert into public.catalog_spec_definitions
  (canonical_key, label_vi, label_en, value_type, unit_dimension, canonical_unit, is_sortable, is_searchable, ranking_aggregation)
values
  ('range_km', 'Quãng đường di chuyển', 'Range', 'NUMBER', 'DISTANCE', 'km', true, true, 'MAX'),
  ('top_speed_kmh', 'Tốc độ tối đa', 'Top speed', 'NUMBER', 'SPEED', 'km/h', true, true, 'MAX'),
  ('max_power_kw', 'Công suất tối đa', 'Maximum power', 'NUMBER', 'POWER', 'kW', true, true, 'MAX'),
  ('max_torque_nm', 'Mô-men xoắn cực đại', 'Maximum torque', 'NUMBER', 'TORQUE', 'Nm', true, true, 'MAX'),
  ('battery_capacity_kwh', 'Dung lượng pin', 'Battery capacity', 'NUMBER', 'ENERGY', 'kWh', true, true, 'MAX'),
  ('charging_time', 'Thời gian sạc', 'Charging time', 'DURATION', 'TIME', 'second', false, true, null),
  ('dimensions_mm', 'Kích thước (D x R x C)', 'Dimensions', 'TEXT', null, 'mm', false, true, null),
  ('seats', 'Số chỗ ngồi', 'Seats', 'NUMBER', 'COUNT', 'seat', true, true, 'MAX'),
  ('drive_type', 'Hệ dẫn động', 'Drive type', 'TEXT', null, null, false, true, null)
on conflict (canonical_key) do nothing;

insert into public.catalog_spec_aliases
  (spec_definition_id, alias, product_type, source_schema, match_kind)
select definition.id, seed.alias, seed.product_type, '*', seed.match_kind
from (
  values
    ('range_km', 'specs.*.specs.powertrain.distance', 'CAR', 'PATH'),
    ('max_power_kw', 'specs.*.specs.powertrain.maxPower', 'CAR', 'PATH'),
    ('max_torque_nm', 'specs.*.specs.powertrain.maxTorque', 'CAR', 'PATH'),
    ('top_speed_kmh', 'specs.*.specs.powertrain.topSpeed', 'CAR', 'PATH'),
    ('drive_type', 'specs.*.specs.powertrain.drivetrain', 'CAR', 'PATH'),
    ('battery_capacity_kwh', 'specs.*.specs.powertrain.batteryCapacity', 'CAR', 'PATH'),
    ('charging_time', 'specs.*.specs.powertrain.fastChargingTime', 'CAR', 'PATH'),
    ('dimensions_mm', 'specs.*.specs.dimension.length', 'CAR', 'PATH'),
    ('seats', 'specs.*.specs.interior.numberOfSeats', 'CAR', 'PATH'),
    ('range_km', 'Quãng đường đi được', 'CAR', 'LABEL'),
    ('max_power_kw', 'Công suất tối đa', 'CAR', 'LABEL'),
    ('max_torque_nm', 'Mô-men xoắn cực đại', 'CAR', 'LABEL'),
    ('top_speed_kmh', 'Tốc độ tối đa', 'CAR', 'LABEL'),
    ('drive_type', 'Hệ dẫn động', 'CAR', 'LABEL'),
    ('battery_capacity_kwh', 'Dung lượng pin', 'CAR', 'LABEL'),
    ('charging_time', 'Thời gian sạc nhanh', 'CAR', 'LABEL'),
    ('dimensions_mm', 'Dài x Rộng x Cao', 'CAR', 'LABEL'),
    ('seats', 'Số chỗ ngồi', 'CAR', 'LABEL'),
    ('range_km', 'Quãng đường đi được mỗi lần sạc', 'MOTORBIKE', 'LABEL'),
    ('range_km', 'Quãng đường đi được', 'MOTORBIKE', 'LABEL'),
    ('range_km', 'Quãng đường 1 lần sạc (2 pin)', 'MOTORBIKE', 'LABEL'),
    ('range_km', 'Quãng đường', 'MOTORBIKE', 'LABEL'),
    ('range_km', 'Phạm vi hoạt động', 'MOTORBIKE', 'LABEL'),
    ('max_power_kw', 'Công suất tối đa', 'MOTORBIKE', 'LABEL'),
    ('max_power_kw', 'Công suất lớn nhất', 'MOTORBIKE', 'LABEL'),
    ('max_power_kw', 'Công suất', 'MOTORBIKE', 'LABEL'),
    ('max_torque_nm', 'Mô-men xoắn cực đại', 'MOTORBIKE', 'LABEL'),
    ('max_torque_nm', 'Momen xoắn cực đại', 'MOTORBIKE', 'LABEL'),
    ('top_speed_kmh', 'Tốc độ tối đa', 'MOTORBIKE', 'LABEL'),
    ('top_speed_kmh', 'Tốc độ tối đa - SPORT', 'MOTORBIKE', 'LABEL'),
    ('top_speed_kmh', 'Vận tốc', 'MOTORBIKE', 'LABEL'),
    ('top_speed_kmh', 'Vận tốc lên tới', 'MOTORBIKE', 'LABEL'),
    ('drive_type', 'Loại động cơ', 'MOTORBIKE', 'LABEL'),
    ('battery_capacity_kwh', 'Dung lượng pin/ắc quy', 'MOTORBIKE', 'LABEL'),
    ('battery_capacity_kwh', 'Dung lượng pin', 'MOTORBIKE', 'LABEL'),
    ('battery_capacity_kwh', 'Dung lượng ắc quy', 'MOTORBIKE', 'LABEL'),
    ('charging_time', 'Thời gian sạc tiêu chuẩn', 'MOTORBIKE', 'LABEL'),
    ('charging_time', 'Thời gian sạc nhanh', 'MOTORBIKE', 'LABEL'),
    ('dimensions_mm', 'Dài x Rộng x Cao (mm)', 'MOTORBIKE', 'LABEL'),
    ('dimensions_mm', 'Dài x Rộng x Cao', 'MOTORBIKE', 'LABEL'),
    ('dimensions_mm', 'Kích thước (D x R x C)', 'MOTORBIKE', 'LABEL'),
    ('seats', 'Số chỗ ngồi', 'MOTORBIKE', 'LABEL'),
    ('seats', 'Số người chở', 'MOTORBIKE', 'LABEL')
) as seed(canonical_key, alias, product_type, match_kind)
join public.catalog_spec_definitions definition
  on definition.canonical_key = seed.canonical_key
on conflict do nothing;

create or replace function public.catalog_enqueue_product_spec_ingestion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_product_type text;
  v_extractor_version text;
  v_queue_fingerprint text;
begin
  v_product_type := case upper(coalesce(new.product_type::text, ''))
    when 'CAR' then 'CAR'
    when 'VEHICLE' then 'CAR'
    when 'BIKE' then 'MOTORBIKE'
    when 'MOTORBIKE' then 'MOTORBIKE'
    when 'ACCESSORY' then 'ACCESSORY'
    else null
  end;
  if v_product_type is null then return new; end if;

  select extractor_version
    into v_extractor_version
    from public.catalog_runtime_revision
   where singleton = true;

  -- This MD5 is only a cheap queue dedupe key. The worker records the
  -- authoritative stable SHA-256 over extractor_version + canonical JSON.
  v_queue_fingerprint := md5(v_extractor_version || E'\n' || new.specifications::text);

  insert into public.catalog_spec_ingestion_jobs (
    product_id,
    product_type,
    extractor_version,
    specifications_snapshot,
    queue_fingerprint,
    snapshot_completeness
  ) values (
    new.id,
    v_product_type,
    v_extractor_version,
    new.specifications,
    v_queue_fingerprint,
    'FULL'
  ) on conflict (product_id, extractor_version, queue_fingerprint) do nothing;

  return new;
end;
$$;

drop trigger if exists products_catalog_spec_ingestion on public.products;
create trigger products_catalog_spec_ingestion
after insert or update of specifications, product_type
on public.products
for each row execute function public.catalog_enqueue_product_spec_ingestion();

create or replace function public.claim_catalog_spec_ingestion_jobs(
  p_worker_id text,
  p_limit integer default 10
)
returns setof public.catalog_spec_ingestion_jobs
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception using errcode = '22023', message = 'worker_id is required';
  end if;

  return query
  with claimable as (
    select job.id
      from public.catalog_spec_ingestion_jobs job
     where job.status = 'PENDING'
       and job.available_at <= clock_timestamp()
     order by job.available_at, job.created_at, job.id
     for update skip locked
     limit least(greatest(coalesce(p_limit, 10), 1), 100)
  )
  update public.catalog_spec_ingestion_jobs job
     set status = 'PROCESSING',
         attempts = job.attempts + 1,
         claimed_at = clock_timestamp(),
         claimed_by = btrim(p_worker_id),
         last_error = null
    from claimable
   where job.id = claimable.id
  returning job.*;
end;
$$;

create or replace function public.bump_catalog_registry_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.catalog_runtime_revision
     set registry_revision = registry_revision + 1,
         updated_at = clock_timestamp()
   where singleton = true;
  return null;
end;
$$;

create trigger catalog_spec_definitions_bump_registry_revision
after insert or update or delete on public.catalog_spec_definitions
for each statement execute function public.bump_catalog_registry_revision();

create trigger catalog_spec_aliases_bump_registry_revision
after insert or update or delete on public.catalog_spec_aliases
for each statement execute function public.bump_catalog_registry_revision();

alter table public.catalog_spec_definitions enable row level security;
alter table public.catalog_spec_aliases enable row level security;
alter table public.catalog_runtime_revision enable row level security;
alter table public.catalog_spec_ingestion_jobs enable row level security;
alter table public.catalog_spec_snapshots enable row level security;
alter table public.catalog_spec_observations enable row level security;
alter table public.product_spec_facts enable row level security;
alter table public.catalog_intelligence_events enable row level security;

revoke all on table public.catalog_spec_definitions from public, anon, authenticated;
revoke all on table public.catalog_spec_aliases from public, anon, authenticated;
revoke all on table public.catalog_runtime_revision from public, anon, authenticated;
revoke all on table public.catalog_spec_ingestion_jobs from public, anon, authenticated;
revoke all on table public.catalog_spec_snapshots from public, anon, authenticated;
revoke all on table public.catalog_spec_observations from public, anon, authenticated;
revoke all on table public.product_spec_facts from public, anon, authenticated;
revoke all on table public.catalog_intelligence_events from public, anon, authenticated;

grant select, insert, update, delete on table public.catalog_spec_definitions to service_role;
grant select, insert, update, delete on table public.catalog_spec_aliases to service_role;
grant select, insert, update, delete on table public.catalog_runtime_revision to service_role;
grant select, insert, update, delete on table public.catalog_spec_ingestion_jobs to service_role;
grant select, insert, update, delete on table public.catalog_spec_snapshots to service_role;
grant select, insert, update, delete on table public.catalog_spec_observations to service_role;
grant select, insert, update, delete on table public.product_spec_facts to service_role;
grant select, insert, update, delete on table public.catalog_intelligence_events to service_role;

revoke all on function public.catalog_enqueue_product_spec_ingestion() from public, anon, authenticated;
revoke all on function public.claim_catalog_spec_ingestion_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.bump_catalog_registry_revision() from public, anon, authenticated;
grant execute on function public.claim_catalog_spec_ingestion_jobs(text, integer) to service_role;

commit;

-- Rollback procedure (review before use):
-- begin;
-- drop trigger if exists catalog_spec_aliases_bump_registry_revision on public.catalog_spec_aliases;
-- drop trigger if exists catalog_spec_definitions_bump_registry_revision on public.catalog_spec_definitions;
-- drop trigger if exists products_catalog_spec_ingestion on public.products;
-- drop function if exists public.bump_catalog_registry_revision();
-- drop function if exists public.claim_catalog_spec_ingestion_jobs(text, integer);
-- drop function if exists public.catalog_enqueue_product_spec_ingestion();
-- drop table if exists public.catalog_intelligence_events;
-- drop table if exists public.product_spec_facts;
-- drop table if exists public.catalog_spec_observations;
-- drop table if exists public.catalog_spec_snapshots;
-- drop table if exists public.catalog_spec_ingestion_jobs;
-- drop table if exists public.catalog_runtime_revision;
-- drop table if exists public.catalog_spec_aliases;
-- drop table if exists public.catalog_spec_definitions;
-- commit;
