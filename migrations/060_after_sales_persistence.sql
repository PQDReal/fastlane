-- After-sales persistence design only.
-- This migration is intentionally not applied in the current human-review phase.
-- The importer must pass dry-run and approval gates before any production write.

create table if not exists public.after_sales_sources (
  source_id text primary key,
  source_url text not null unique,
  service_type text not null,
  vehicle_type text not null,
  scope jsonb not null default '{}'::jsonb,
  title text,
  snapshot_id text,
  snapshot_hash text,
  captured_at timestamptz,
  capture_method text,
  http_status integer,
  availability text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint after_sales_sources_http_status_check
    check (http_status is null or http_status between 100 and 599)
);

create table if not exists public.after_sales_assets (
  asset_id text primary key,
  source_id text not null references public.after_sales_sources(source_id) on delete restrict,
  asset_url text not null,
  asset_type text not null,
  label text,
  content_hash text,
  mime_type text,
  byte_length bigint,
  classification jsonb,
  verification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint after_sales_assets_byte_length_check
    check (byte_length is null or byte_length >= 0),
  constraint after_sales_assets_source_url_hash_unique
    unique (source_id, asset_url, content_hash)
);

create table if not exists public.after_sales_facts (
  fact_id text primary key,
  fact_group_id text not null,
  canonical_key text not null unique,
  primary_source_id text not null references public.after_sales_sources(source_id) on delete restrict,
  source_ids text[] not null default '{}',
  service_type text not null,
  vehicle_type text not null,
  powertrain text not null default 'all',
  model text,
  subject text not null,
  policy_entity text not null,
  usage_condition text not null,
  applicability text not null,
  action text not null,
  fact_type text not null,
  value_numeric numeric not null,
  value_text text not null,
  unit text not null,
  qualifier text,
  interval_relation text,
  interval_group_id text,
  interval_group_distance_policy text,
  distance_policy text not null default 'not_stated',
  confidence numeric not null,
  source_review_status text not null,
  semantic_flags jsonb not null default '[]'::jsonb,
  group_semantic_flags jsonb not null default '[]'::jsonb,
  approval_status text not null default 'pending',
  reviewer_id text,
  reviewed_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint after_sales_facts_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected', 'superseded', 'revoked')),
  constraint after_sales_facts_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint after_sales_facts_approval_fields_check
    check (
      (approval_status = 'pending' and approved_by is null and approved_at is null)
      or
      (approval_status = 'approved' and approved_by is not null and approved_at is not null)
      or
      (approval_status in ('rejected', 'superseded', 'revoked') and reviewer_id is not null and reviewed_at is not null)
    )
);

alter table public.after_sales_facts
  add column if not exists powertrain text not null default 'all';

alter table public.after_sales_facts
  add column if not exists distance_policy text not null default 'not_stated';

alter table public.after_sales_facts
  add column if not exists interval_relation text;

alter table public.after_sales_facts
  add column if not exists interval_group_id text;

alter table public.after_sales_facts
  add column if not exists interval_group_distance_policy text;

alter table public.after_sales_facts
  add column if not exists group_semantic_flags jsonb not null default '[]'::jsonb;

create table if not exists public.after_sales_fact_evidence (
  fact_id text not null references public.after_sales_facts(fact_id) on delete cascade,
  evidence_id text not null,
  source_id text not null references public.after_sales_sources(source_id) on delete restrict,
  asset_id text references public.after_sales_assets(asset_id) on delete restrict,
  source_url text not null,
  snapshot_hash text,
  captured_at timestamptz,
  origin text not null,
  asset_url text,
  asset_hash text,
  pdf_page integer,
  extraction_method text,
  extraction_confidence numeric,
  excerpt text not null,
  context_index jsonb,
  raw_provenance jsonb,
  created_at timestamptz not null default now(),
  primary key (fact_id, evidence_id),
  constraint after_sales_fact_evidence_pdf_page_check
    check (pdf_page is null or pdf_page >= 1),
  constraint after_sales_fact_evidence_confidence_check
    check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1))
);

create table if not exists public.after_sales_fact_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  fact_id text not null references public.after_sales_facts(fact_id) on delete cascade,
  from_status text not null,
  to_status text not null,
  reviewer_id text not null,
  reviewed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint after_sales_fact_approvals_from_status_check
    check (from_status in ('pending', 'approved', 'rejected', 'superseded', 'revoked')),
  constraint after_sales_fact_approvals_to_status_check
    check (to_status in ('pending', 'approved', 'rejected', 'superseded', 'revoked'))
);

create index if not exists idx_after_sales_assets_source
  on public.after_sales_assets(source_id);

create index if not exists idx_after_sales_facts_source_status
  on public.after_sales_facts(primary_source_id, approval_status);

create index if not exists idx_after_sales_facts_review_queue
  on public.after_sales_facts(approval_status, service_type, vehicle_type);

create index if not exists idx_after_sales_facts_fact_type
  on public.after_sales_facts(fact_type, subject, model);

create index if not exists idx_after_sales_evidence_fact
  on public.after_sales_fact_evidence(fact_id);

create index if not exists idx_after_sales_evidence_source_asset
  on public.after_sales_fact_evidence(source_id, asset_id);

create index if not exists idx_after_sales_approvals_fact_time
  on public.after_sales_fact_approvals(fact_id, reviewed_at desc);

create or replace view public.after_sales_fact_review_queue as
select
  f.fact_id,
  f.canonical_key,
  f.service_type,
  f.vehicle_type,
  f.powertrain,
  f.model,
  f.subject,
  f.fact_type,
  f.value_numeric,
  f.value_text,
  f.unit,
  f.qualifier,
  f.interval_relation,
  f.interval_group_id,
  f.interval_group_distance_policy,
  f.distance_policy,
  f.confidence,
  f.approval_status,
  f.reviewer_id,
  f.reviewed_at,
  f.approved_by,
  f.approved_at,
  f.approval_note,
  count(e.evidence_id)::integer as evidence_count,
  coalesce(jsonb_agg(to_jsonb(e) order by e.pdf_page nulls last, e.evidence_id) filter (where e.evidence_id is not null), '[]'::jsonb) as evidence
from public.after_sales_facts f
left join public.after_sales_fact_evidence e on e.fact_id = f.fact_id
group by f.fact_id;

alter table public.after_sales_sources enable row level security;
alter table public.after_sales_assets enable row level security;
alter table public.after_sales_facts enable row level security;
alter table public.after_sales_fact_evidence enable row level security;
alter table public.after_sales_fact_approvals enable row level security;

revoke all on table public.after_sales_sources from public, anon, authenticated, service_role;
revoke all on table public.after_sales_assets from public, anon, authenticated, service_role;
revoke all on table public.after_sales_facts from public, anon, authenticated, service_role;
revoke all on table public.after_sales_fact_evidence from public, anon, authenticated, service_role;
revoke all on table public.after_sales_fact_approvals from public, anon, authenticated, service_role;
revoke all on table public.after_sales_fact_review_queue from public, anon, authenticated, service_role;

grant select, insert, update on table public.after_sales_sources to service_role;
grant select, insert, update on table public.after_sales_assets to service_role;
grant select, insert, update on table public.after_sales_facts to service_role;
grant select, insert, update on table public.after_sales_fact_evidence to service_role;
grant select, insert on table public.after_sales_fact_approvals to service_role;
grant select on table public.after_sales_fact_review_queue to service_role;

comment on table public.after_sales_facts is 'Normalized official after-sales business facts; approval is fact-level and independent from evidence.';
comment on table public.after_sales_fact_evidence is 'Complete provenance links from facts to official source snapshots and verified assets/PDF pages.';
comment on table public.after_sales_fact_approvals is 'Append-only fact approval/rejection transition history.';
