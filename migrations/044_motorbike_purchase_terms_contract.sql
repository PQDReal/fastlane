-- Task 015: allow the existing motorbike sales document type through the
-- immutable contract issue RPC. The table constraint already reserves this
-- value; this migration only replaces the overly narrow car-only gate.
begin;

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
  if coalesce(p_document_type, '') not in ('CAR_SALES_CONTRACT', 'MOTORBIKE_SALES_CONTRACT') then
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

  if (v_order.vehicle_type = 'car' and p_document_type <> 'CAR_SALES_CONTRACT')
     or (v_order.vehicle_type = 'motorbike' and p_document_type <> 'MOTORBIKE_SALES_CONTRACT')
     or v_order.vehicle_type not in ('car', 'motorbike') then
    raise exception using errcode = 'P0001', message = 'CONTRACT_DOCUMENT_VEHICLE_MISMATCH';
  end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'CONTRACT_ISSUED'
       or v_event.document_id is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select * into v_document from public.deposit_order_documents where id = v_event.document_id;
    if not found or v_document.status <> 'PENDING_SIGNATURE' then
      raise exception using errcode = 'P0001', message = 'CONTRACT_ISSUE_EVENT_DOCUMENT_INACTIVE';
    end if;
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
      'documentType', p_document_type,
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

revoke all on function public.issue_deposit_order_contract(uuid,text,uuid,text,text,text,jsonb,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.issue_deposit_order_contract(uuid,text,uuid,text,text,text,jsonb,text,integer,text)
  to service_role;

commit;
