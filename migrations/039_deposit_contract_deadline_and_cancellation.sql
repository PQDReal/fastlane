-- Migration 039: production-grade deposit contract issuance, signature,
-- cancellation, expiry and audit lifecycle.
--
-- Preflight (2026-08-07):
--   * deposit_order_documents already exists from migration 035 and is empty;
--   * workflow deadline/cancellation columns do not exist on deposit_orders;
--   * deposit_order_events does not exist;
--   * no legacy legal document is fabricated or backfilled.

begin;

do $preflight$
declare
  v_missing text[];
begin
  if to_regclass('public.deposit_orders') is null
     or to_regclass('public.users') is null
     or to_regclass('public.customer_notifications') is null
     or to_regclass('public.vnpay_deposit_attempts') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_039_PREREQUISITE_TABLE_MISSING';
  end if;
  if to_regprocedure('public.order_status_notification_copy(text,text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_039_NOTIFICATION_FUNCTION_MISSING';
  end if;

  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(array[
      'id', 'order_number', 'customer_id', 'status', 'kyc_status',
      'vehicle_type', 'refund_status', 'contract_signed_at', 'updated_at'
    ]) as required_columns(required_column)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = 'public.deposit_orders'::regclass
        and attribute.attname = required_column
        and attribute.attnum > 0
        and not attribute.attisdropped
   );

  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_039_DEPOSIT_ORDER_SCHEMA_MISMATCH',
      detail = array_to_string(v_missing, ',');
  end if;
end;
$preflight$;

-- deposit_orders remains the commercial aggregate. These fields are the
-- current-contract projection used for fast workflow queries. The immutable
-- legal record lives in deposit_order_documents and deposit_order_events.
alter table public.deposit_orders
  add column if not exists contract_issued_at timestamptz,
  add column if not exists contract_signature_due_at timestamptz,
  add column if not exists contract_signature_window_hours smallint,
  add column if not exists contract_workflow_version smallint,
  add column if not exists contract_signature_expired_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_note text;

alter table public.deposit_orders
  drop constraint if exists deposit_orders_contract_workflow_version_check,
  drop constraint if exists deposit_orders_contract_signature_window_check,
  drop constraint if exists deposit_orders_contract_deadline_check,
  drop constraint if exists deposit_orders_contract_expiry_check,
  drop constraint if exists deposit_orders_cancellation_reason_code_check,
  drop constraint if exists deposit_orders_contract_v2_state_check,
  drop constraint if exists deposit_orders_contract_v2_cancellation_check;

alter table public.deposit_orders
  add constraint deposit_orders_contract_workflow_version_check
    check (contract_workflow_version is null or contract_workflow_version = 2),
  add constraint deposit_orders_contract_signature_window_check
    check (contract_signature_window_hours is null or contract_signature_window_hours between 1 and 720),
  add constraint deposit_orders_contract_deadline_check
    check (
      contract_signature_due_at is null
      or (contract_issued_at is not null and contract_signature_due_at > contract_issued_at)
    ),
  add constraint deposit_orders_contract_expiry_check
    check (contract_signature_expired_at is null or contract_signed_at is null),
  add constraint deposit_orders_cancellation_reason_code_check
    check (
      cancellation_reason_code is null
      or cancellation_reason_code in (
        'CUSTOMER_CANCELLED_BEFORE_CONTRACT',
        'CUSTOMER_CANCELLED_PENDING_SIGNATURE',
        'CONTRACT_SIGNATURE_EXPIRED',
        'ADMIN_CANCELLED_BEFORE_CONTRACT'
      )
    ),
  add constraint deposit_orders_contract_v2_state_check
    check (
      status <> 'PENDING_CONTRACT'
      or contract_workflow_version is distinct from 2
      or (
        contract_issued_at is not null
        and contract_signature_due_at is not null
        and contract_signature_window_hours is not null
      )
    ),
  add constraint deposit_orders_contract_v2_cancellation_check
    check (
      contract_workflow_version is distinct from 2
      or status <> 'CANCELLED'
      or (cancelled_at is not null and cancellation_reason_code is not null)
    );

create index if not exists idx_deposit_orders_pending_contract_due
  on public.deposit_orders (contract_signature_due_at, id)
  where status = 'PENDING_CONTRACT' and contract_signed_at is null;

create index if not exists idx_deposit_orders_cancelled_refund_pending
  on public.deposit_orders (updated_at, id)
  where status = 'CANCELLED' and refund_status = 'PENDING';

comment on column public.deposit_orders.contract_issued_at is
  'DB-authoritative issue time of the current contract workflow instance.';
comment on column public.deposit_orders.contract_signature_due_at is
  'Exclusive signature deadline of the current contract workflow instance.';
comment on column public.deposit_orders.contract_signature_window_hours is
  'Policy snapshot used to calculate the current signature deadline.';
comment on column public.deposit_orders.contract_workflow_version is
  'Nullable for legacy orders; value 2 identifies the contract workflow introduced by migration 039.';
comment on column public.deposit_orders.contract_signature_expired_at is
  'Time the unsigned contract deadline was processed; this is not contract validity expiry.';
comment on column public.deposit_orders.cancellation_reason_code is
  'Machine-readable cancellation reason. Human-entered context belongs in cancellation_note.';

-- Contract/refund notifications need their own idempotency key. The legacy
-- uniqueness by current_status is retained only for ORDER_STATUS_CHANGED rows.
alter table public.customer_notifications
  add column if not exists event_key text;

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check,
  drop constraint if exists customer_notifications_event_key_check;

alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check
    check (notification_type in (
      'ORDER_STATUS_CHANGED',
      'CONTRACT_ISSUED',
      'CONTRACT_SIGNATURE_REMINDER',
      'CONTRACT_EXPIRED',
      'REFUND_STARTED',
      'REFUND_COMPLETED',
      'REFUND_FAILED'
    )),
  add constraint customer_notifications_event_key_check
    check (event_key is null or length(btrim(event_key)) between 8 and 200);

drop index if exists public.customer_notifications_order_status_unique;
create unique index if not exists uq_customer_notifications_order_status
  on public.customer_notifications (customer_id, order_type, order_id, current_status)
  where notification_type = 'ORDER_STATUS_CHANGED';
create unique index if not exists uq_customer_notifications_event_key
  on public.customer_notifications (event_key);

comment on column public.customer_notifications.event_key is
  'Unique idempotency key for contract/refund notifications; legacy status notifications may keep null.';

create or replace function public.notify_accessory_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_copy record;
begin
  if old.status is not distinct from new.status then return new; end if;
  select * into v_copy from public.order_status_notification_copy(new.order_number, new.status::text);
  insert into public.customer_notifications (
    customer_id, notification_type, title, message, order_type, order_id,
    order_number, previous_status, current_status, action_url
  ) values (
    new.customer_id, 'ORDER_STATUS_CHANGED', v_copy.title, v_copy.message,
    'ACCESSORY', new.id, new.order_number, old.status::text, new.status::text,
    '/profile?tab=orders'
  ) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.notify_deposit_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_customer_id uuid; v_copy record;
begin
  if old.status is not distinct from new.status then return new; end if;
  v_customer_id := new.customer_id;
  if v_customer_id is null and new.email is not null then
    select id into v_customer_id from public.users
      where lower(email) = lower(new.email) limit 1;
  end if;
  if v_customer_id is null then return new; end if;
  select * into v_copy from public.order_status_notification_copy(new.order_number, new.status::text);
  insert into public.customer_notifications (
    customer_id, notification_type, title, message, order_type, order_id,
    order_number, previous_status, current_status, action_url
  ) values (
    v_customer_id, 'ORDER_STATUS_CHANGED', v_copy.title, v_copy.message,
    'DEPOSIT', new.id, new.order_number, old.status::text, new.status::text,
    '/profile?tab=car-orders'
  ) on conflict do nothing;
  return new;
end;
$$;

-- Migration 035 created this table in live environments. The CREATE supports a
-- validated fresh baseline; ALTER statements add only migration-039 fields.
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
    foreign key (deposit_order_id) references public.deposit_orders(id) on delete restrict,
  constraint deposit_order_documents_signed_by_fkey
    foreign key (signed_by_user_id) references public.users(id) on delete restrict,
  constraint deposit_order_documents_type_check
    check (document_type in ('CAR_SALES_CONTRACT', 'MOTORBIKE_SALES_CONTRACT')),
  constraint deposit_order_documents_status_check
    check (status in ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'VOID')),
  constraint deposit_order_documents_content_object_check
    check (jsonb_typeof(content_snapshot) = 'object')
);

alter table public.deposit_order_documents
  add column if not exists workflow_version smallint,
  add column if not exists issue_sequence integer,
  add column if not exists content_hash_algorithm text,
  add column if not exists content_canonicalization text,
  add column if not exists issued_at timestamptz,
  add column if not exists signature_due_at timestamptz,
  add column if not exists signature_consent_version text,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason_code text;

-- Preserve legal evidence if an account or order deletion is attempted.
alter table public.deposit_order_documents
  drop constraint if exists deposit_order_documents_order_fkey,
  drop constraint if exists deposit_order_documents_signed_by_fkey,
  drop constraint if exists deposit_order_documents_unique_version;

alter table public.deposit_order_documents
  add constraint deposit_order_documents_order_fkey
    foreign key (deposit_order_id) references public.deposit_orders(id) on delete restrict,
  add constraint deposit_order_documents_signed_by_fkey
    foreign key (signed_by_user_id) references public.users(id) on delete restrict;

alter table public.deposit_order_documents
  drop constraint if exists deposit_order_documents_workflow_version_check,
  drop constraint if exists deposit_order_documents_issue_sequence_check,
  drop constraint if exists deposit_order_documents_v2_content_check,
  drop constraint if exists deposit_order_documents_v2_issue_check,
  drop constraint if exists deposit_order_documents_signature_check,
  drop constraint if exists deposit_order_documents_void_check,
  drop constraint if exists deposit_order_documents_void_reason_check;

alter table public.deposit_order_documents
  add constraint deposit_order_documents_workflow_version_check
    check (workflow_version is null or workflow_version = 2),
  add constraint deposit_order_documents_issue_sequence_check
    check (issue_sequence is null or issue_sequence > 0),
  add constraint deposit_order_documents_v2_content_check
    check (
      workflow_version is distinct from 2
      or (
        content_snapshot <> '{}'::jsonb
        and content_snapshot ->> 'schemaVersion' = 'FASTLANE_CONTRACT_SNAPSHOT_V1'
        and content_snapshot ->> 'documentType' = document_type
        and content_snapshot ->> 'documentVersion' = document_version
        and content_snapshot ->> 'title' = title_snapshot
        and content_hash ~ '^[0-9a-f]{64}$'
        and content_hash_algorithm = 'SHA-256'
        and content_canonicalization = 'FASTLANE_JSON_V1'
      )
    ),
  add constraint deposit_order_documents_v2_issue_check
    check (
      workflow_version is distinct from 2
      or (
        issue_sequence is not null
        and issued_at is not null
        and signature_due_at is not null
        and signature_due_at > issued_at
      )
    ),
  add constraint deposit_order_documents_signature_check
    check (
      status <> 'SIGNED'
      or (
        signed_at is not null
        and signed_by_user_id is not null
        and signature_method = 'ELECTRONIC_CONSENT'
        and signature_consent_version is not null
        and jsonb_typeof(signature_evidence) = 'object'
        and signature_evidence <> '{}'::jsonb
      )
    ),
  add constraint deposit_order_documents_void_check
    check (
      status <> 'VOID'
      or (voided_at is not null and void_reason_code is not null)
    ),
  add constraint deposit_order_documents_void_reason_check
    check (
      void_reason_code is null
      or void_reason_code in (
        'CUSTOMER_CANCELLED_BEFORE_CONTRACT',
        'CUSTOMER_CANCELLED_PENDING_SIGNATURE',
        'CONTRACT_SIGNATURE_EXPIRED',
        'CONTRACT_REISSUED',
        'ADMIN_CANCELLED_BEFORE_CONTRACT'
      )
    );

create unique index if not exists uq_deposit_order_documents_issue_sequence
  on public.deposit_order_documents (deposit_order_id, document_type, issue_sequence)
  where issue_sequence is not null;

create unique index if not exists uq_deposit_order_documents_pending_type
  on public.deposit_order_documents (deposit_order_id, document_type)
  where status = 'PENDING_SIGNATURE';

create index if not exists idx_deposit_order_documents_order_status
  on public.deposit_order_documents (deposit_order_id, status, issued_at desc);

comment on table public.deposit_order_documents is
  'Immutable versioned legal-document snapshots belonging to a deposit order. A new issue creates a new row; issued content is never edited.';
comment on column public.deposit_order_documents.document_version is
  'Version of the legal template, independent from workflow_version and issue_sequence.';
comment on column public.deposit_order_documents.issue_sequence is
  'Monotonic issue/reissue number within one order and document type.';
comment on column public.deposit_order_documents.content_snapshot is
  'Complete structured content shown to the signer, including template clauses and commercial data.';
comment on column public.deposit_order_documents.content_hash is
  'Lowercase SHA-256 digest of content_snapshot serialized with content_canonicalization.';
comment on column public.deposit_order_documents.signature_evidence is
  'Server-recorded consent/request evidence; raw secrets and raw IP addresses are forbidden.';

-- Append-only audit trail. It records state transitions without duplicating PII.
create table if not exists public.deposit_order_events (
  id uuid primary key default gen_random_uuid(),
  deposit_order_id uuid not null references public.deposit_orders(id) on delete restrict,
  document_id uuid references public.deposit_order_documents(id) on delete restrict,
  event_type text not null,
  actor_type text not null,
  actor_user_id uuid references public.users(id) on delete restrict,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint deposit_order_events_type_check check (event_type in (
    'CONTRACT_ISSUED',
    'CONTRACT_SIGNED',
    'CONTRACT_VOIDED',
    'CONTRACT_EXPIRED',
    'DEPOSIT_CANCELLED',
    'REFUND_QUEUED',
    'REFUND_PROCESSING',
    'REFUND_COMPLETED',
    'REFUND_FAILED'
  )),
  constraint deposit_order_events_actor_check check (actor_type in ('CUSTOMER', 'ADMIN', 'SYSTEM', 'PROVIDER')),
  constraint deposit_order_events_actor_user_check check (
    (actor_type in ('SYSTEM', 'PROVIDER') and actor_user_id is null)
    or (actor_type in ('CUSTOMER', 'ADMIN') and actor_user_id is not null)
  ),
  constraint deposit_order_events_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint deposit_order_events_event_key_check check (length(btrim(event_key)) between 8 and 200)
);

create unique index if not exists uq_deposit_order_events_event_key
  on public.deposit_order_events (event_key);
create index if not exists idx_deposit_order_events_order_occurred
  on public.deposit_order_events (deposit_order_id, occurred_at desc, id desc);
create index if not exists idx_deposit_order_events_document_occurred
  on public.deposit_order_events (document_id, occurred_at desc)
  where document_id is not null;

comment on table public.deposit_order_events is
  'Append-only audit events for deposit contract, cancellation and refund transitions. metadata must not contain PII.';
comment on column public.deposit_order_events.event_key is
  'Globally unique deterministic idempotency key for exactly-once transition recording.';

create or replace function public.guard_deposit_order_document_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('SIGNED', 'VOID') then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_TERMINAL';
  end if;

  if old.status <> 'DRAFT' and (
    new.deposit_order_id is distinct from old.deposit_order_id
    or new.document_type is distinct from old.document_type
    or new.document_version is distinct from old.document_version
    or new.workflow_version is distinct from old.workflow_version
    or new.issue_sequence is distinct from old.issue_sequence
    or new.title_snapshot is distinct from old.title_snapshot
    or new.content_snapshot is distinct from old.content_snapshot
    or new.content_hash is distinct from old.content_hash
    or new.content_hash_algorithm is distinct from old.content_hash_algorithm
    or new.content_canonicalization is distinct from old.content_canonicalization
    or new.issued_at is distinct from old.issued_at
    or new.signature_due_at is distinct from old.signature_due_at
  ) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_IMMUTABLE';
  end if;

  if old.status = 'PENDING_SIGNATURE' and new.status not in ('SIGNED', 'VOID') then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_TRANSITION_INVALID';
  end if;
  if old.status = 'DRAFT' and new.status not in ('DRAFT', 'PENDING_SIGNATURE', 'VOID') then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_TRANSITION_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_deposit_order_document_update on public.deposit_order_documents;
create trigger trg_guard_deposit_order_document_update
before update on public.deposit_order_documents
for each row execute function public.guard_deposit_order_document_update();

create or replace function public.reject_deposit_order_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_EVENT_IMMUTABLE';
end;
$$;

drop trigger if exists trg_reject_deposit_order_event_mutation on public.deposit_order_events;
create trigger trg_reject_deposit_order_event_mutation
before update or delete on public.deposit_order_events
for each row execute function public.reject_deposit_order_event_mutation();

-- Remove pre-release signatures if an earlier local environment created them.
-- Changing input arguments with CREATE OR REPLACE would otherwise leave an
-- overloaded RPC visible in the PostgREST schema cache.
drop function if exists public.issue_deposit_order_contract(uuid,text,jsonb,text,integer);
drop function if exists public.sign_deposit_order_contract(uuid,uuid,text,jsonb,uuid,text);
drop function if exists public.cancel_deposit_order_before_signature(uuid,uuid,text);
drop function if exists public.expire_deposit_order_contract(uuid);

-- Idempotently issue one immutable car-sales contract. Both the KYC and order
-- approval paths use the same deterministic event key.
create or replace function public.issue_deposit_order_contract(
  p_order_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_document_type text,
  p_document_version text,
  p_title_snapshot text,
  p_content_snapshot jsonb,
  p_content_hash text,
  p_signature_window_hours integer,
  p_event_key text
)
returns table(
  document_id uuid,
  issue_sequence integer,
  issued_at timestamptz,
  signature_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_document public.deposit_order_documents%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_issued_at timestamptz := clock_timestamp();
  v_due_at timestamptz;
  v_issue_sequence integer;
begin
  if p_signature_window_hours is distinct from 72 then
    raise exception using errcode = 'P0001', message = 'CONTRACT_WINDOW_INVALID';
  end if;
  if coalesce(p_actor_type, '') not in ('SYSTEM', 'ADMIN')
     or (p_actor_type = 'SYSTEM' and p_actor_user_id is not null)
     or (p_actor_type = 'ADMIN' and p_actor_user_id is null) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_ACTOR_INVALID';
  end if;
  if coalesce(p_document_type, '') <> 'CAR_SALES_CONTRACT' then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_TYPE_UNSUPPORTED';
  end if;
  if length(btrim(coalesce(p_document_version, ''))) < 3
     or length(btrim(coalesce(p_title_snapshot, ''))) < 3
     or jsonb_typeof(p_content_snapshot) is distinct from 'object'
     or p_content_snapshot = '{}'::jsonb
     or coalesce(p_content_hash, '') !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'CONTRACT_CONTENT_INVALID';
  end if;

  select * into v_order
    from public.deposit_orders
   where id = p_order_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND';
  end if;

  select * into v_event
    from public.deposit_order_events
   where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'CONTRACT_ISSUED'
       or v_event.document_id is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select * into v_document from public.deposit_order_documents where id = v_event.document_id;
    return query select v_document.id, v_document.issue_sequence, v_document.issued_at,
      v_document.signature_due_at, true;
    return;
  end if;

  if v_order.status <> 'CONFIRMED' or v_order.kyc_status is distinct from 'APPROVED' then
    raise exception using errcode = 'P0001', message = 'CONTRACT_NOT_ISSUABLE';
  end if;
  if not exists (
    select 1 from public.vnpay_deposit_attempts
     where deposit_order_id = p_order_id and status = 'PAID'
  ) then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_NOT_PAID';
  end if;
  if v_order.vehicle_type is distinct from 'car' then
    raise exception using errcode = 'P0001', message = 'CONTRACT_VEHICLE_UNSUPPORTED';
  end if;

  select coalesce(max(d.issue_sequence), 0) + 1 into v_issue_sequence
    from public.deposit_order_documents d
   where d.deposit_order_id = p_order_id and d.document_type = p_document_type;
  v_due_at := v_issued_at + make_interval(hours => p_signature_window_hours);

  insert into public.deposit_order_documents (
    deposit_order_id, document_type, document_version, workflow_version,
    issue_sequence, status, title_snapshot, content_snapshot, content_hash,
    content_hash_algorithm, content_canonicalization, issued_at,
    signature_due_at, created_at, updated_at
  ) values (
    p_order_id, p_document_type, p_document_version, 2,
    v_issue_sequence, 'PENDING_SIGNATURE', p_title_snapshot,
    p_content_snapshot, p_content_hash, 'SHA-256', 'FASTLANE_JSON_V1',
    v_issued_at, v_due_at, v_issued_at, v_issued_at
  ) returning * into v_document;

  update public.deposit_orders
     set status = 'PENDING_CONTRACT',
         contract_issued_at = v_issued_at,
         contract_signature_due_at = v_due_at,
         contract_signature_window_hours = p_signature_window_hours,
         contract_workflow_version = 2,
         contract_signature_expired_at = null,
         updated_at = v_issued_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, document_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, v_document.id, 'CONTRACT_ISSUED', p_actor_type,
    p_actor_user_id, p_event_key,
    jsonb_build_object(
      'workflowVersion', 2,
      'documentVersion', p_document_version,
      'issueSequence', v_issue_sequence,
      'contentHash', p_content_hash,
      'signatureDueAt', v_due_at
    ),
    v_issued_at
  );

  return query select v_document.id, v_issue_sequence, v_issued_at, v_due_at, false;
end;
$$;

create or replace function public.sign_deposit_order_contract(
  p_order_id uuid,
  p_document_id uuid,
  p_customer_id uuid,
  p_expected_content_hash text,
  p_consent_version text,
  p_signature_method text,
  p_signature_evidence jsonb,
  p_event_key text
)
returns table(document_id uuid, order_status text, signed_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_document public.deposit_order_documents%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_signed_at timestamptz := clock_timestamp();
begin
  if p_document_id is null
     or coalesce(p_expected_content_hash, '') !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_consent_version, ''))) < 3
     or coalesce(p_signature_method, '') <> 'ELECTRONIC_CONSENT'
     or jsonb_typeof(p_signature_evidence) is distinct from 'object'
     or p_signature_evidence = '{}'::jsonb
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'CONTRACT_SIGNATURE_INPUT_INVALID';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;
  if v_order.customer_id is distinct from p_customer_id then
    raise exception using errcode = 'P0001', message = 'CONTRACT_ACTION_FORBIDDEN';
  end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.document_id is distinct from p_document_id
       or v_event.event_type <> 'CONTRACT_SIGNED' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select * into v_document from public.deposit_order_documents where id = p_document_id;
    return query select v_document.id, 'CONTRACT_SIGNED'::text, v_document.signed_at, true;
    return;
  end if;

  if v_order.status <> 'PENDING_CONTRACT' or v_order.contract_signed_at is not null then
    raise exception using errcode = 'P0001', message = 'CONTRACT_NOT_SIGNABLE';
  end if;
  if v_order.contract_signature_due_at is null or v_signed_at >= v_order.contract_signature_due_at then
    raise exception using errcode = 'P0001', message = 'CONTRACT_SIGNATURE_EXPIRED';
  end if;

  select * into v_document
    from public.deposit_order_documents
   where id = p_document_id
     and deposit_order_id = p_order_id
     and status = 'PENDING_SIGNATURE'
   for update;
  if not found then raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_NOT_FOUND'; end if;
  if v_document.content_hash is distinct from p_expected_content_hash then
    raise exception using errcode = 'P0001', message = 'CONTRACT_CONTENT_HASH_MISMATCH';
  end if;
  if v_document.signature_due_at is distinct from v_order.contract_signature_due_at then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DEADLINE_MISMATCH';
  end if;

  update public.deposit_order_documents
     set status = 'SIGNED',
         signature_method = p_signature_method,
         signature_consent_version = p_consent_version,
         signature_evidence = p_signature_evidence || jsonb_build_object(
           'contentHash', v_document.content_hash,
           'consentVersion', p_consent_version
         ),
         signed_at = v_signed_at,
         signed_by_user_id = p_customer_id,
         updated_at = v_signed_at
   where id = v_document.id;

  update public.deposit_orders
     set status = 'CONTRACT_SIGNED', contract_signed_at = v_signed_at, updated_at = v_signed_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, document_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, v_document.id, 'CONTRACT_SIGNED', 'CUSTOMER', p_customer_id,
    p_event_key,
    jsonb_build_object(
      'contentHash', v_document.content_hash,
      'consentVersion', p_consent_version,
      'signatureMethod', p_signature_method
    ),
    v_signed_at
  );

  return query select v_document.id, 'CONTRACT_SIGNED'::text, v_signed_at, false;
end;
$$;

create or replace function public.cancel_deposit_order_before_signature(
  p_order_id uuid,
  p_customer_id uuid,
  p_cancellation_reason_code text,
  p_event_key text
)
returns table(order_status text, refund_status text, cancelled_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_refund_status text := 'NONE';
  v_cancelled_at timestamptz := clock_timestamp();
  v_voided_count integer := 0;
begin
  if coalesce(p_cancellation_reason_code, '') not in (
      'CUSTOMER_CANCELLED_BEFORE_CONTRACT',
      'CUSTOMER_CANCELLED_PENDING_SIGNATURE'
    ) or length(btrim(coalesce(p_event_key, ''))) not between 8 and 150 then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CANCELLATION_INPUT_INVALID';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;
  if v_order.customer_id is distinct from p_customer_id then
    raise exception using errcode = 'P0001', message = 'CONTRACT_ACTION_FORBIDDEN';
  end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'DEPOSIT_CANCELLED' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.status, v_order.refund_status, v_order.cancelled_at, true;
    return;
  end if;

  if v_order.status not in ('PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PENDING_CONTRACT')
     or v_order.contract_signed_at is not null then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CANNOT_BE_CANCELLED';
  end if;

  if exists (
    select 1 from public.vnpay_deposit_attempts
     where deposit_order_id = p_order_id and status = 'PAID'
  ) then
    v_refund_status := 'PENDING';
  end if;

  update public.deposit_order_documents
     set status = 'VOID',
         voided_at = v_cancelled_at,
         void_reason_code = p_cancellation_reason_code,
         updated_at = v_cancelled_at
   where deposit_order_id = p_order_id and status = 'PENDING_SIGNATURE';
  get diagnostics v_voided_count = row_count;

  insert into public.deposit_order_events (
    deposit_order_id, document_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  )
  select d.deposit_order_id, d.id, 'CONTRACT_VOIDED', 'CUSTOMER', p_customer_id,
         'CONTRACT_VOIDED:' || d.id::text,
         jsonb_build_object('reasonCode', p_cancellation_reason_code),
         v_cancelled_at
    from public.deposit_order_documents d
   where d.deposit_order_id = p_order_id
     and d.status = 'VOID'
     and d.voided_at = v_cancelled_at;

  update public.deposit_orders
     set status = 'CANCELLED',
         refund_status = v_refund_status,
         cancelled_at = v_cancelled_at,
         cancellation_reason_code = p_cancellation_reason_code,
         updated_at = v_cancelled_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, 'DEPOSIT_CANCELLED', 'CUSTOMER', p_customer_id,
    p_event_key,
    jsonb_build_object(
      'reasonCode', p_cancellation_reason_code,
      'documentsVoided', v_voided_count,
      'refundStatus', v_refund_status
    ),
    v_cancelled_at
  );

  if v_refund_status = 'PENDING' then
    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, actor_user_id,
      event_key, metadata, occurred_at
    ) values (
      p_order_id, 'REFUND_QUEUED', 'CUSTOMER', p_customer_id,
      p_event_key || ':REFUND', jsonb_build_object('source', 'DEPOSIT_CANCELLED'),
      v_cancelled_at
    );
  end if;

  return query select 'CANCELLED'::text, v_refund_status, v_cancelled_at, false;
end;
$$;

-- Batch expiry uses the due index and SKIP LOCKED, allowing safe concurrent cron
-- invocations. Refund provider calls remain an application-level saga after commit.
create or replace function public.expire_due_deposit_order_contracts(
  p_job_run_id uuid,
  p_limit integer default 100
)
returns table(
  order_id uuid,
  order_number text,
  customer_id uuid,
  refund_status text,
  expired_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_document public.deposit_order_documents%rowtype;
  v_refund_status text;
  v_expired_at timestamptz;
  v_event_key text;
begin
  if p_job_run_id is null or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = 'P0001', message = 'CONTRACT_EXPIRY_JOB_INPUT_INVALID';
  end if;

  for v_order in
    select o.*
      from public.deposit_orders o
     where o.status = 'PENDING_CONTRACT'
       and o.contract_signed_at is null
       and o.contract_signature_due_at <= clock_timestamp()
     order by o.contract_signature_due_at, o.id
     for update skip locked
     limit p_limit
  loop
    v_expired_at := clock_timestamp();
    v_refund_status := 'NONE';

    select * into v_document
      from public.deposit_order_documents d
     where d.deposit_order_id = v_order.id
       and d.status = 'PENDING_SIGNATURE'
     order by d.issue_sequence desc
     limit 1
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_NOT_FOUND';
    end if;

    if exists (
      select 1 from public.vnpay_deposit_attempts
       where deposit_order_id = v_order.id and status = 'PAID'
    ) then
      v_refund_status := 'PENDING';
    end if;

    update public.deposit_order_documents
       set status = 'VOID',
           voided_at = v_expired_at,
           void_reason_code = 'CONTRACT_SIGNATURE_EXPIRED',
           updated_at = v_expired_at
     where id = v_document.id;

    insert into public.deposit_order_events (
      deposit_order_id, document_id, event_type, actor_type,
      event_key, metadata, occurred_at
    ) values (
      v_order.id, v_document.id, 'CONTRACT_VOIDED', 'SYSTEM',
      'CONTRACT_VOIDED:' || v_document.id::text,
      jsonb_build_object('reasonCode', 'CONTRACT_SIGNATURE_EXPIRED'),
      v_expired_at
    );

    update public.deposit_orders
       set status = 'CANCELLED',
           refund_status = v_refund_status,
           contract_signature_expired_at = v_expired_at,
           cancelled_at = v_expired_at,
           cancellation_reason_code = 'CONTRACT_SIGNATURE_EXPIRED',
           updated_at = v_expired_at
     where id = v_order.id;

    v_event_key := 'CONTRACT_EXPIRED:' || v_document.id::text;
    insert into public.deposit_order_events (
      deposit_order_id, document_id, event_type, actor_type,
      event_key, metadata, occurred_at
    ) values (
      v_order.id, v_document.id, 'CONTRACT_EXPIRED', 'SYSTEM',
      v_event_key,
      jsonb_build_object(
        'jobRunId', p_job_run_id,
        'signatureDueAt', v_order.contract_signature_due_at,
        'refundStatus', v_refund_status
      ),
      v_expired_at
    );

    if v_refund_status = 'PENDING' then
      insert into public.deposit_order_events (
        deposit_order_id, document_id, event_type, actor_type,
        event_key, metadata, occurred_at
      ) values (
        v_order.id, v_document.id, 'REFUND_QUEUED', 'SYSTEM',
        v_event_key || ':REFUND', jsonb_build_object('source', 'CONTRACT_EXPIRED'),
        v_expired_at
      );
    end if;

    order_id := v_order.id;
    order_number := v_order.order_number;
    customer_id := v_order.customer_id;
    refund_status := v_refund_status;
    expired_at := v_expired_at;
    return next;
  end loop;
end;
$$;

alter table public.deposit_order_documents enable row level security;
alter table public.deposit_order_events enable row level security;

revoke all on table public.deposit_order_documents from public, anon, authenticated;
revoke all on table public.deposit_order_events from public, anon, authenticated;
grant select, insert, update on table public.deposit_order_documents to service_role;
grant select, insert on table public.deposit_order_events to service_role;

revoke all on function public.guard_deposit_order_document_update() from public, anon, authenticated;
revoke all on function public.reject_deposit_order_event_mutation() from public, anon, authenticated;
revoke all on function public.issue_deposit_order_contract(uuid,text,uuid,text,text,text,jsonb,text,integer,text) from public, anon, authenticated;
revoke all on function public.sign_deposit_order_contract(uuid,uuid,uuid,text,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.cancel_deposit_order_before_signature(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.expire_due_deposit_order_contracts(uuid,integer) from public, anon, authenticated;

grant execute on function public.issue_deposit_order_contract(uuid,text,uuid,text,text,text,jsonb,text,integer,text) to service_role;
grant execute on function public.sign_deposit_order_contract(uuid,uuid,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.cancel_deposit_order_before_signature(uuid,uuid,text,text) to service_role;
grant execute on function public.expire_due_deposit_order_contracts(uuid,integer) to service_role;

commit;
