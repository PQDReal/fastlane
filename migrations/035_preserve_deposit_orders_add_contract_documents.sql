-- Preserve the existing deposit order ledger while retiring the obsolete
-- product_variants relation and introducing immutable contract snapshots.
--
-- Safety properties:
--   * no deposit_orders row or pre-existing column value is deleted/rewritten;
--   * legacy variant_id UUIDs remain available for historical investigation;
--   * the transaction aborts if any original row value changes;
--   * document structures are added only after the legacy relation
--     has been detached and the original order data has been snapshotted.

begin;

lock table public.deposit_orders in share row exclusive mode;

-- product_variants is now the accessory variant model. Historical vehicle
-- orders must retain their old UUID values, but new vehicle orders must use
-- vehicle_variant_id -> vehicle_variants(id).
--
-- Keep the lossless snapshot in PL/pgSQL memory instead of a temporary table.
-- Supabase SQL Editor may not preserve an unqualified temp-table lookup across
-- a compiled DO block, while this representation stays in the same block.
do $migration$
declare
  before_count bigint;
  after_count bigint;
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  select count(*), coalesce(jsonb_agg(row_snapshot order by id), '[]'::jsonb)
    into before_count, before_snapshot
  from (
    select
      existing_order.id,
      to_jsonb(existing_order) as row_snapshot
    from public.deposit_orders existing_order
  ) snapshot_rows;

  alter table public.deposit_orders
    drop constraint if exists deposit_orders_variant_id_fkey;

  comment on column public.deposit_orders.variant_id is
    'DEPRECATED, READ-ONLY: legacy vehicle/product variant UUID retained verbatim for historical orders. New vehicle orders use vehicle_variant_id.';

  select count(*), coalesce(jsonb_agg(row_snapshot order by id), '[]'::jsonb)
    into after_count, after_snapshot
  from (
    select
      migrated_order.id,
      to_jsonb(migrated_order) as row_snapshot
    from public.deposit_orders migrated_order
  ) snapshot_rows;

  if before_count is distinct from after_count
     or before_snapshot is distinct from after_snapshot then
    raise exception
      'Migration 035 aborted: deposit_orders differs from the lossless snapshot held in memory';
  end if;
end
$migration$;

-- One deposit order remains the commercial workflow aggregate. It may own
-- multiple independently versioned legal documents for the same sale.
create table if not exists public.deposit_order_documents (
  id uuid primary key default gen_random_uuid(),
  deposit_order_id uuid not null,
  document_type text not null,
  document_version text not null,
  status text not null default 'DRAFT',
  title_snapshot text not null,
  content_snapshot jsonb not null,
  content_hash text not null,
  signature_method text,
  signature_evidence jsonb,
  signed_at timestamptz,
  signed_by_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint deposit_order_documents_order_fkey
    foreign key (deposit_order_id)
    references public.deposit_orders(id)
    on delete restrict,
  constraint deposit_order_documents_signed_by_fkey
    foreign key (signed_by_user_id)
    references public.users(id)
    on delete set null,
  constraint deposit_order_documents_type_check
    check (document_type in (
      'CAR_SALES_CONTRACT',
      'MOTORBIKE_SALES_CONTRACT'
    )),
  constraint deposit_order_documents_status_check
    check (status in ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'VOID')),
  constraint deposit_order_documents_content_object_check
    check (jsonb_typeof(content_snapshot) = 'object'),
  constraint deposit_order_documents_signature_check
    check (
      status <> 'SIGNED'
      or (signed_at is not null and signature_method is not null)
    ),
  constraint deposit_order_documents_unique_version
    unique (deposit_order_id, document_type, document_version)
);

create index if not exists idx_deposit_order_documents_order
  on public.deposit_order_documents (deposit_order_id, created_at desc);

create index if not exists idx_deposit_order_documents_status
  on public.deposit_order_documents (status, created_at desc);

comment on table public.deposit_order_documents is
  'Versioned legal-document snapshots belonging to a deposit order. Signed content is preserved independently from mutable catalog and policy data.';
comment on column public.deposit_order_documents.content_hash is
  'Digest of the canonical content snapshot used to detect changes after signing.';
comment on column public.deposit_order_documents.signature_evidence is
  'Server-recorded signing evidence such as consent version, request id, IP hash, and user-agent hash; do not store raw secrets.';

alter table public.deposit_order_documents enable row level security;

commit;
