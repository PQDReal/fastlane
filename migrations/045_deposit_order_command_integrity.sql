-- Migration 045: make deposit payment and administrative commands atomic.
--
-- VNPAY IPN is the only payment writer. Administrative cancellation and
-- delivery transitions are named commands so they cannot bypass refund,
-- document, or audit invariants with a generic status update.

begin;

do $preflight$
declare
  v_missing text[];
begin
  if to_regclass('public.deposit_orders') is null
     or to_regclass('public.vnpay_deposit_attempts') is null
     or to_regclass('public.deposit_order_documents') is null
     or to_regclass('public.deposit_order_events') is null
     or to_regclass('public.users') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_045_PREREQUISITE_TABLE_MISSING';
  end if;

  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(array[
      'id', 'customer_id', 'email', 'status', 'kyc_status', 'refund_status',
      'contract_issued_at', 'contract_signature_due_at',
      'contract_signature_window_hours', 'contract_workflow_version',
      'contract_signature_expired_at', 'contract_signed_at', 'cancelled_at',
      'cancellation_reason_code', 'cancellation_note', 'updated_at'
    ]) as required_columns(required_column)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = 'public.deposit_orders'::regclass
        and attribute.attname = required_column
        and not attribute.attisdropped
   );
  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_045_DEPOSIT_ORDER_COLUMN_MISSING',
      detail = array_to_string(v_missing, ', ');
  end if;

  select array_agg(required_column order by required_column)
    into v_missing
    from unnest(array[
      'id', 'deposit_order_id', 'status', 'response_code',
      'vnpay_transaction_no', 'bank_code', 'response_payload',
      'paid_at', 'updated_at'
    ]) as required_columns(required_column)
   where not exists (
     select 1
       from pg_attribute attribute
      where attribute.attrelid = 'public.vnpay_deposit_attempts'::regclass
        and attribute.attname = required_column
        and not attribute.attisdropped
   );
  if v_missing is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_045_DEPOSIT_ATTEMPT_COLUMN_MISSING',
      detail = array_to_string(v_missing, ', ');
  end if;
end;
$preflight$;

alter table public.deposit_order_events
  drop constraint if exists deposit_order_events_type_check;

alter table public.deposit_order_events
  add constraint deposit_order_events_type_check check (event_type in (
    'CONTRACT_ISSUED',
    'CONTRACT_SIGNED',
    'CONTRACT_VOIDED',
    'CONTRACT_EXPIRED',
    'CONTRACT_ISSUE_REQUEUED',
    'DEPOSIT_CANCELLED',
    'DEPOSIT_ORDER_CLAIMED',
    'DEPOSIT_PAYMENT_CONFIRMED',
    'LATE_DEPOSIT_PAYMENT_RECEIVED',
    'REFUND_QUEUED',
    'REFUND_PROCESSING',
    'REFUND_COMPLETED',
    'REFUND_FAILED',
    'VEHICLE_READY_NOTIFIED',
    'VEHICLE_DELIVERED',
    'DEPOSIT_ORDER_COMPLETED',
    'BALANCE_PAYMENT_REMINDER',
    'BALANCE_PAYMENT_OVERDUE',
    'BALANCE_PAYMENT_COMPLETED',
    'BALANCE_PAYMENT_WORKFLOW_MIGRATED',
    'BALANCE_PAYMENT_WORKFLOW_RETIRED'
  ));

create or replace function public.guard_deposit_order_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'PENDING_DEPOSIT' and new.status in ('PENDING_CONFIRMATION', 'CANCELLED'))
    or (old.status = 'PENDING' and new.status in ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED'))
    or (old.status = 'PENDING_CONFIRMATION' and new.status in ('CONFIRMED', 'CANCELLED'))
    or (old.status = 'CONFIRMED' and new.status in ('PENDING_CONTRACT', 'CANCELLED'))
    or (old.status = 'PENDING_CONTRACT' and new.status in ('CONFIRMED', 'CONTRACT_SIGNED', 'WAITING_VEHICLE', 'CANCELLED'))
    or (old.status = 'CONTRACT_SIGNED' and new.status in ('WAITING_VEHICLE', 'PREPARING_DELIVERY'))
    or (old.status = 'WAITING_VEHICLE' and new.status = 'PREPARING_DELIVERY')
    or (old.status = 'PREPARING_DELIVERY' and new.status = 'DELIVERED')
    or (old.status = 'DELIVERED' and new.status = 'COMPLETED')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'DEPOSIT_ORDER_STATUS_TRANSITION_INVALID',
      detail = old.status || ' -> ' || new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists deposit_orders_guard_status_transition on public.deposit_orders;
create trigger deposit_orders_guard_status_transition
before update of status on public.deposit_orders
for each row
execute function public.guard_deposit_order_status_transition();

-- The application verifies the VNPAY signature and amount before invoking
-- this command. This function is the single transaction that commits the
-- verified provider result together with the order projection.
create or replace function public.process_vnpay_deposit_callback(
  p_attempt_id uuid,
  p_success boolean,
  p_response_code text,
  p_transaction_no text,
  p_bank_code text,
  p_response_payload jsonb,
  p_paid_at timestamptz
)
returns table(
  attempt_status text,
  order_status text,
  refund_status text,
  outcome text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.vnpay_deposit_attempts%rowtype;
  v_order public.deposit_orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_paid_at timestamptz;
  v_outcome text;
begin
  if p_attempt_id is null
     or p_success is null
     or jsonb_typeof(coalesce(p_response_payload, '{}'::jsonb)) is distinct from 'object'
     or length(coalesce(p_response_code, '')) > 100
     or length(coalesce(p_transaction_no, '')) > 180
     or length(coalesce(p_bank_code, '')) > 100 then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CALLBACK_INPUT_INVALID';
  end if;

  select * into v_attempt
    from public.vnpay_deposit_attempts
   where id = p_attempt_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  select * into v_order
    from public.deposit_orders
   where id = v_attempt.deposit_order_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND';
  end if;

  if v_attempt.status = 'FAILED' then
    return query select v_attempt.status, v_order.status, v_order.refund_status,
      'ATTEMPT_TERMINAL_FAILED'::text, true;
    return;
  end if;

  if not p_success then
    if v_attempt.status = 'PENDING' then
      update public.vnpay_deposit_attempts
         set status = 'FAILED',
             response_code = nullif(p_response_code, ''),
             vnpay_transaction_no = nullif(p_transaction_no, ''),
             bank_code = nullif(p_bank_code, ''),
             response_payload = coalesce(p_response_payload, '{}'::jsonb),
             updated_at = v_now
       where id = v_attempt.id;
      v_attempt.status := 'FAILED';
      return query select v_attempt.status, v_order.status, v_order.refund_status,
        'PAYMENT_FAILED'::text, false;
      return;
    end if;

    return query select v_attempt.status, v_order.status, v_order.refund_status,
      'ALREADY_PAID'::text, true;
    return;
  end if;

  v_paid_at := coalesce(v_attempt.paid_at, p_paid_at, v_now);
  if v_paid_at > v_now + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CALLBACK_PAID_AT_INVALID';
  end if;

  if v_attempt.status = 'PENDING' then
    update public.vnpay_deposit_attempts
       set status = 'PAID',
           response_code = nullif(p_response_code, ''),
           vnpay_transaction_no = nullif(p_transaction_no, ''),
           bank_code = nullif(p_bank_code, ''),
           response_payload = coalesce(p_response_payload, '{}'::jsonb),
           paid_at = v_paid_at,
           updated_at = v_now
     where id = v_attempt.id;
    v_attempt.status := 'PAID';
  end if;

  if v_order.status in ('PENDING_DEPOSIT', 'PENDING') then
    update public.deposit_orders
       set status = 'PENDING_CONFIRMATION', updated_at = v_now
     where id = v_order.id;
    v_order.status := 'PENDING_CONFIRMATION';
    v_outcome := 'PAYMENT_CONFIRMED';

    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
    ) values (
      v_order.id,
      'DEPOSIT_PAYMENT_CONFIRMED',
      'PROVIDER',
      'DEPOSIT_PAYMENT_CONFIRMED:' || v_attempt.id::text,
      jsonb_build_object(
        'attemptId', v_attempt.id,
        'responseCode', p_response_code,
        'transactionNo', p_transaction_no,
        'nextStatus', 'PENDING_CONFIRMATION'
      ),
      v_paid_at
    ) on conflict (event_key) do nothing;
  elsif v_order.status = 'CANCELLED' then
    if v_order.refund_status in ('NONE', 'FAILED') then
      update public.deposit_orders
         set refund_status = 'PENDING', updated_at = v_now
       where id = v_order.id;
      v_order.refund_status := 'PENDING';
    end if;
    v_outcome := 'REFUND_REQUIRED';

    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
    ) values (
      v_order.id,
      'LATE_DEPOSIT_PAYMENT_RECEIVED',
      'PROVIDER',
      'LATE_DEPOSIT_PAYMENT:' || v_attempt.id::text,
      jsonb_build_object(
        'attemptId', v_attempt.id,
        'responseCode', p_response_code,
        'transactionNo', p_transaction_no,
        'refundStatus', v_order.refund_status
      ),
      v_paid_at
    ) on conflict (event_key) do nothing;

    if v_order.refund_status = 'PENDING' then
      insert into public.deposit_order_events (
        deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
      ) values (
        v_order.id,
        'REFUND_QUEUED',
        'SYSTEM',
        'REFUND_QUEUED:LATE_DEPOSIT_PAYMENT:' || v_attempt.id::text,
        jsonb_build_object('source', 'LATE_DEPOSIT_PAYMENT', 'attemptId', v_attempt.id),
        v_now
      ) on conflict (event_key) do nothing;
    end if;
  else
    -- The order may already have advanced because an earlier callback wrote
    -- the projection before this migration. Preserve that legitimate state
    -- while reconciling the provider attempt to PAID.
    v_outcome := 'ORDER_ALREADY_ADVANCED';

    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
    ) values (
      v_order.id,
      'DEPOSIT_PAYMENT_CONFIRMED',
      'PROVIDER',
      'DEPOSIT_PAYMENT_CONFIRMED:' || v_attempt.id::text,
      jsonb_build_object(
        'attemptId', v_attempt.id,
        'responseCode', p_response_code,
        'transactionNo', p_transaction_no,
        'preservedOrderStatus', v_order.status
      ),
      v_paid_at
    ) on conflict (event_key) do nothing;
  end if;

  return query select v_attempt.status, v_order.status, v_order.refund_status,
    v_outcome, (v_attempt.paid_at is not null);
end;
$$;

-- Repair only the known legacy shape where the order says PENDING_CONTRACT
-- but no legal document exists. An admin must explicitly request the repair;
-- the command never fabricates or backfills a signed document.
create or replace function public.admin_requeue_unissued_deposit_document(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_event_key text
)
returns table(order_status text, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_changed_at timestamptz := clock_timestamp();
begin
  if p_order_id is null
     or p_actor_user_id is null
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'CONTRACT_REQUEUE_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_REQUEUE_ADMIN_REQUIRED';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'CONTRACT_ISSUE_REQUEUED' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.status, true;
    return;
  end if;

  if v_order.status <> 'PENDING_CONTRACT'
     or v_order.contract_signed_at is not null
     or v_order.kyc_status is distinct from 'APPROVED'
     or exists (
       select 1 from public.deposit_order_documents d
        where d.deposit_order_id = p_order_id
          and d.status in ('PENDING_SIGNATURE', 'SIGNED')
     )
     or not exists (
       select 1 from public.vnpay_deposit_attempts p
        where p.deposit_order_id = p_order_id and p.status = 'PAID'
     ) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_REQUEUE_NOT_ALLOWED';
  end if;

  update public.deposit_orders
     set status = 'CONFIRMED',
         contract_issued_at = null,
         contract_signature_due_at = null,
         contract_signature_window_hours = null,
         contract_workflow_version = null,
         contract_signature_expired_at = null,
         updated_at = v_changed_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, 'CONTRACT_ISSUE_REQUEUED', 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'previousStatus', 'PENDING_CONTRACT',
      'nextStatus', 'CONFIRMED',
      'reason', 'MISSING_LEGAL_DOCUMENT'
    ),
    v_changed_at
  );

  return query select 'CONFIRMED'::text, false;
end;
$$;

-- Guest deposits are visible by verified account email, but customer-only
-- commands use the immutable users.id. Claim that guest aggregate exactly
-- once before KYC, cancellation, or signature commands are executed.
create or replace function public.claim_guest_deposit_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_event_key text
)
returns table(customer_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_user public.users%rowtype;
  v_event public.deposit_order_events%rowtype;
begin
  if p_order_id is null
     or p_customer_id is null
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CLAIM_INPUT_INVALID';
  end if;

  select * into v_user from public.users where id = p_customer_id;
  if not found
     or v_user.role <> 'CUSTOMER'
     or v_user.status <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CLAIM_CUSTOMER_REQUIRED';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  if v_order.customer_id = p_customer_id then
    return query select p_customer_id, true;
    return;
  end if;
  if v_order.customer_id is not null
     or lower(btrim(v_order.email)) <> lower(btrim(v_user.email)) then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CLAIM_FORBIDDEN';
  end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'DEPOSIT_ORDER_CLAIMED'
       or v_event.actor_user_id is distinct from p_customer_id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select p_customer_id, true;
    return;
  end if;

  update public.deposit_orders
     set customer_id = p_customer_id, updated_at = clock_timestamp()
   where id = p_order_id and customer_id is null;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, 'DEPOSIT_ORDER_CLAIMED', 'CUSTOMER', p_customer_id,
    p_event_key, jsonb_build_object('matchedBy', 'VERIFIED_ACCOUNT_EMAIL'),
    clock_timestamp()
  );

  return query select p_customer_id, false;
end;
$$;

create or replace function public.admin_cancel_deposit_order_before_signature(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_cancellation_note text,
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
  if p_order_id is null
     or p_actor_user_id is null
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 150
     or length(coalesce(p_cancellation_note, '')) > 1000 then
    raise exception using errcode = 'P0001', message = 'ADMIN_DEPOSIT_CANCELLATION_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'DEPOSIT_CANCELLATION_ADMIN_REQUIRED';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'DEPOSIT_CANCELLED'
       or v_event.actor_type <> 'ADMIN' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.status, v_order.refund_status, v_order.cancelled_at, true;
    return;
  end if;

  if v_order.status not in ('PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PENDING_CONTRACT')
     or v_order.contract_signed_at is not null
     or exists (
       select 1 from public.deposit_order_documents d
        where d.deposit_order_id = p_order_id and d.status = 'SIGNED'
     ) then
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
         void_reason_code = 'ADMIN_CANCELLED_BEFORE_CONTRACT',
         updated_at = v_cancelled_at
   where deposit_order_id = p_order_id and status = 'PENDING_SIGNATURE';
  get diagnostics v_voided_count = row_count;

  insert into public.deposit_order_events (
    deposit_order_id, document_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  )
  select d.deposit_order_id, d.id, 'CONTRACT_VOIDED', 'ADMIN', p_actor_user_id,
         'CONTRACT_VOIDED:' || d.id::text,
         jsonb_build_object('reasonCode', 'ADMIN_CANCELLED_BEFORE_CONTRACT'),
         v_cancelled_at
    from public.deposit_order_documents d
   where d.deposit_order_id = p_order_id
     and d.status = 'VOID'
     and d.voided_at = v_cancelled_at
  on conflict (event_key) do nothing;

  update public.deposit_orders
     set status = 'CANCELLED',
         refund_status = v_refund_status,
         cancelled_at = v_cancelled_at,
         cancellation_reason_code = 'ADMIN_CANCELLED_BEFORE_CONTRACT',
         cancellation_note = nullif(btrim(p_cancellation_note), ''),
         updated_at = v_cancelled_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, 'DEPOSIT_CANCELLED', 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'reasonCode', 'ADMIN_CANCELLED_BEFORE_CONTRACT',
      'documentsVoided', v_voided_count,
      'refundStatus', v_refund_status,
      'note', nullif(btrim(p_cancellation_note), '')
    ),
    v_cancelled_at
  );

  if v_refund_status = 'PENDING' then
    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, actor_user_id,
      event_key, metadata, occurred_at
    ) values (
      p_order_id, 'REFUND_QUEUED', 'ADMIN', p_actor_user_id,
      p_event_key || ':REFUND',
      jsonb_build_object('source', 'ADMIN_DEPOSIT_CANCELLATION'),
      v_cancelled_at
    );
  end if;

  return query select 'CANCELLED'::text, v_refund_status, v_cancelled_at, false;
end;
$$;

create or replace function public.advance_deposit_order_delivery(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_target_status text,
  p_event_key text,
  p_note text
)
returns table(order_id uuid, previous_status text, order_status text, changed_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_expected_status text;
  v_event_type text;
  v_changed_at timestamptz := clock_timestamp();
begin
  if p_order_id is null
     or p_actor_user_id is null
     or p_target_status is null
     or p_target_status not in ('DELIVERED', 'COMPLETED')
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180
     or length(coalesce(p_note, '')) > 1000 then
    raise exception using errcode = 'P0001', message = 'DELIVERY_TRANSITION_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_TRANSITION_ADMIN_REQUIRED';
  end if;

  v_expected_status := case p_target_status
    when 'DELIVERED' then 'PREPARING_DELIVERY'
    when 'COMPLETED' then 'DELIVERED'
  end;
  v_event_type := case p_target_status
    when 'DELIVERED' then 'VEHICLE_DELIVERED'
    when 'COMPLETED' then 'DEPOSIT_ORDER_COMPLETED'
  end;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> v_event_type then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.id, v_expected_status, v_order.status,
      v_event.occurred_at, true;
    return;
  end if;

  if v_order.status <> v_expected_status then
    raise exception using errcode = 'P0001', message = 'DELIVERY_TRANSITION_INVALID_ORDER_STATE';
  end if;
  if v_order.contract_signed_at is null
     or not exists (
       select 1 from public.deposit_order_documents d
        where d.deposit_order_id = p_order_id and d.status = 'SIGNED'
     ) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_TRANSITION_SIGNED_DOCUMENT_REQUIRED';
  end if;

  update public.deposit_orders
     set status = p_target_status, updated_at = v_changed_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, v_event_type, 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'previousStatus', v_expected_status,
      'nextStatus', p_target_status,
      'note', nullif(btrim(p_note), '')
    ),
    v_changed_at
  );

  return query select p_order_id, v_expected_status, p_target_status,
    v_changed_at, false;
end;
$$;

-- Forward repair for legacy cancelled orders that received a successful
-- deposit but never projected refund_status=PENDING. It is intentionally an
-- explicit admin action and does not mutate any provider attempt.
create or replace function public.admin_queue_cancelled_deposit_refund(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_event_key text
)
returns table(refund_status text, replayed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_queued_at timestamptz := clock_timestamp();
begin
  if p_order_id is null
     or p_actor_user_id is null
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'REFUND_QUEUE_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'REFUND_QUEUE_ADMIN_REQUIRED';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  if v_order.status <> 'CANCELLED'
     or v_order.refund_status not in ('NONE', 'FAILED', 'PENDING')
     or not exists (
       select 1 from public.vnpay_deposit_attempts p
        where p.deposit_order_id = p_order_id and p.status = 'PAID'
     ) then
    raise exception using errcode = 'P0001', message = 'REFUND_QUEUE_NOT_ALLOWED';
  end if;
  if v_order.refund_status = 'PENDING' then
    return query select 'PENDING'::text, true;
    return;
  end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'REFUND_QUEUED' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.refund_status, true;
    return;
  end if;

  update public.deposit_orders
     set refund_status = 'PENDING', updated_at = v_queued_at
   where id = p_order_id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    p_order_id, 'REFUND_QUEUED', 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'source', 'ADMIN_LEGACY_REFUND_REPAIR',
      'previousRefundStatus', v_order.refund_status
    ),
    v_queued_at
  );

  return query select 'PENDING'::text, false;
end;
$$;

revoke all on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz)
  to service_role;

revoke all on function public.guard_deposit_order_status_transition()
  from public, anon, authenticated;
grant execute on function public.guard_deposit_order_status_transition()
  to service_role;

revoke all on function public.admin_cancel_deposit_order_before_signature(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_cancel_deposit_order_before_signature(uuid,uuid,text,text)
  to service_role;

revoke all on function public.claim_guest_deposit_order(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.claim_guest_deposit_order(uuid,uuid,text)
  to service_role;

revoke all on function public.admin_requeue_unissued_deposit_document(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_requeue_unissued_deposit_document(uuid,uuid,text)
  to service_role;

revoke all on function public.advance_deposit_order_delivery(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.advance_deposit_order_delivery(uuid,uuid,text,text,text)
  to service_role;

revoke all on function public.admin_queue_cancelled_deposit_refund(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_queue_cancelled_deposit_refund(uuid,uuid,text)
  to service_role;

comment on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz) is
  'Atomically records a verified VNPAY deposit callback and advances or reconciles the deposit order.';
comment on function public.admin_cancel_deposit_order_before_signature(uuid,uuid,text,text) is
  'Atomically cancels an unsigned deposit order, voids pending documents, and queues any required refund.';
comment on function public.advance_deposit_order_delivery(uuid,uuid,text,text,text) is
  'Strict admin command for PREPARING_DELIVERY -> DELIVERED -> COMPLETED.';
comment on function public.claim_guest_deposit_order(uuid,uuid,text) is
  'Claims an unowned guest deposit for the active customer whose verified account email matches the order.';
comment on function public.admin_requeue_unissued_deposit_document(uuid,uuid,text) is
  'Explicit admin repair for PENDING_CONTRACT orders that have no pending or signed legal document.';
comment on function public.admin_queue_cancelled_deposit_refund(uuid,uuid,text) is
  'Queues refund for a paid cancelled deposit, including explicit repair of legacy refund projections.';

commit;
