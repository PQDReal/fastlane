-- Migration 043: restore the product boundary to deposit-only vehicle orders.
-- The website collects the deposit and tracks delivery; any remaining vehicle
-- settlement is handled outside this application.

begin;

-- Legacy test rows predate several NOT VALID data-quality checks. PostgreSQL
-- still enforces those checks on UPDATE, so preserve and temporarily remove
-- only the unvalidated constraints while the status-only reconciliation runs.
create temporary table preserved_deposit_order_checks on commit drop as
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.deposit_orders'::regclass
  and contype = 'c'
  and not convalidated;

do $drop_unvalidated_checks$
declare
  v_check record;
begin
  for v_check in select * from preserved_deposit_order_checks loop
    execute format('alter table public.deposit_orders drop constraint %I', v_check.conname);
  end loop;
end;
$drop_unvalidated_checks$;

create temporary table retired_balance_orders on commit drop as
select id, order_number, status as previous_status
from public.deposit_orders
where status in ('PENDING_PAYMENT', 'PAID');

update public.vnpay_vehicle_balance_attempts
set status = 'FAILED',
    response_code = 'PRODUCT_SCOPE_REMOVED',
    response_payload = coalesce(response_payload, '{}'::jsonb)
      || jsonb_build_object('reason', 'Vehicle balance payment is outside the deposit-only product scope'),
    updated_at = clock_timestamp()
where status = 'PENDING';

update public.deposit_orders
set status = case
      when status = 'PAID' then 'PREPARING_DELIVERY'
      when contract_signed_at is not null then 'WAITING_VEHICLE'
      when exists (
        select 1 from public.vnpay_deposit_attempts p
        where p.deposit_order_id = deposit_orders.id and p.status = 'PAID'
      ) then 'PENDING_CONFIRMATION'
      else 'PENDING_DEPOSIT'
    end,
    balance_payment_due_at = null,
    balance_payment_window_business_days = null,
    balance_payment_policy_version = null,
    balance_payment_overdue_at = null,
    balance_payment_mode = null,
    updated_at = clock_timestamp()
where status in ('PENDING_PAYMENT', 'PAID');

-- Remove the one test-era projection from already progressed orders as well.
update public.deposit_orders
set balance_payment_due_at = null,
    balance_payment_window_business_days = null,
    balance_payment_policy_version = null,
    balance_payment_overdue_at = null,
    balance_payment_mode = null
where balance_payment_due_at is not null
   or balance_payment_window_business_days is not null
   or balance_payment_policy_version is not null
   or balance_payment_overdue_at is not null
   or balance_payment_mode is not null;

alter table public.deposit_orders
  drop constraint if exists deposit_orders_status_check,
  drop constraint if exists deposit_orders_vehicle_ready_projection_check,
  drop constraint if exists deposit_orders_balance_payment_policy_check,
  drop constraint if exists deposit_orders_balance_payment_state_check;

alter table public.deposit_orders
  add constraint deposit_orders_status_check check (status in (
    'PENDING_DEPOSIT',
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'PENDING_CONTRACT',
    'CONTRACT_SIGNED',
    'WAITING_VEHICLE',
    'PREPARING_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'PENDING'
  )),
  add constraint deposit_orders_vehicle_ready_projection_check check (
    (vehicle_ready_at is null or contract_signed_at is not null)
    and (vehicle_ready_notified_at is null or vehicle_ready_at is not null)
  );

do $restore_unvalidated_checks$
declare
  v_check record;
begin
  for v_check in select * from preserved_deposit_order_checks loop
    execute format(
      'alter table public.deposit_orders add constraint %I %s',
      v_check.conname,
      v_check.definition
    );
  end loop;
end;
$restore_unvalidated_checks$;

drop index if exists public.idx_deposit_orders_balance_payment_due;
drop function if exists public.notify_deposit_order_vehicle_ready(uuid, uuid, text, timestamptz, text, text, text, text);
drop function if exists public.mark_due_deposit_balance_payments(uuid, integer);
drop function if exists public.add_business_days(timestamptz, integer, text, text, text);
drop function if exists public.is_business_calendar_day(text, text, date);
drop table if exists public.business_calendar_dates;

comment on column public.deposit_orders.balance_payment_due_at is
  'Deprecated. Remaining vehicle payment is outside this deposit-only application.';
comment on column public.deposit_orders.balance_payment_window_business_days is
  'Deprecated. Remaining vehicle payment is outside this deposit-only application.';
comment on column public.deposit_orders.balance_payment_policy_version is
  'Deprecated. Remaining vehicle payment is outside this deposit-only application.';
comment on column public.deposit_orders.balance_payment_overdue_at is
  'Deprecated. Remaining vehicle payment is outside this deposit-only application.';
comment on column public.deposit_orders.balance_payment_mode is
  'Deprecated. Remaining vehicle payment is outside this deposit-only application.';
comment on table public.vnpay_vehicle_balance_attempts is
  'Historical audit only. New vehicle balance payments are disabled.';

revoke insert, update, delete, truncate on table public.vnpay_vehicle_balance_attempts
  from anon, authenticated, service_role;

alter table public.deposit_order_events
  drop constraint if exists deposit_order_events_type_check;

alter table public.deposit_order_events
  add constraint deposit_order_events_type_check check (event_type in (
    'CONTRACT_ISSUED',
    'CONTRACT_SIGNED',
    'CONTRACT_VOIDED',
    'CONTRACT_EXPIRED',
    'DEPOSIT_CANCELLED',
    'REFUND_QUEUED',
    'REFUND_PROCESSING',
    'REFUND_COMPLETED',
    'REFUND_FAILED',
    'VEHICLE_READY_NOTIFIED',
    'BALANCE_PAYMENT_REMINDER',
    'BALANCE_PAYMENT_OVERDUE',
    'BALANCE_PAYMENT_COMPLETED',
    'BALANCE_PAYMENT_WORKFLOW_MIGRATED',
    'BALANCE_PAYMENT_WORKFLOW_RETIRED'
  ));

insert into public.deposit_order_events (
  deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
)
select r.id,
  'BALANCE_PAYMENT_WORKFLOW_RETIRED',
  'SYSTEM',
  'BALANCE_PAYMENT_WORKFLOW_RETIRED:' || r.id || ':V1',
  jsonb_build_object(
    'previous_status', r.previous_status,
    'reason', 'Product is deposit-only; remaining payment is handled outside the application'
  ),
  clock_timestamp()
from retired_balance_orders r
on conflict (event_key) do nothing;

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;

update public.customer_notifications n
set notification_type = 'VEHICLE_READY_FOR_DELIVERY',
    title = 'Xe đã sẵn sàng để chuẩn bị bàn giao',
    message = format('Xe cho đơn %s đã sẵn sàng. FastLane sẽ liên hệ để hẹn lịch bàn giao.', n.order_number),
    current_status = 'PREPARING_DELIVERY'
where n.notification_type = 'VEHICLE_READY_PAYMENT_REQUESTED';

alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (notification_type in (
    'ORDER_STATUS_CHANGED',
    'CONTRACT_ISSUED',
    'CONTRACT_SIGNATURE_REMINDER',
    'CONTRACT_EXPIRED',
    'REFUND_STARTED',
    'REFUND_COMPLETED',
    'REFUND_FAILED',
    'VEHICLE_READY_FOR_DELIVERY'
  ));

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
    return query select v_document.id, v_order.status, v_document.signed_at, true;
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
     set status = 'WAITING_VEHICLE', contract_signed_at = v_signed_at, updated_at = v_signed_at
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
      'signatureMethod', p_signature_method,
      'nextStatus', 'WAITING_VEHICLE'
    ),
    v_signed_at
  );

  return query select v_document.id, 'WAITING_VEHICLE'::text, v_signed_at, false;
end;
$$;

drop function if exists public.mark_deposit_order_vehicle_ready(uuid, uuid, text, timestamptz, text);

create or replace function public.mark_deposit_order_vehicle_ready(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_event_key text,
  p_vehicle_ready_at timestamptz,
  p_note text
)
returns table (
  order_id uuid,
  status text,
  vehicle_ready_at timestamptz,
  vehicle_ready_notified_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_ready_at timestamptz;
  v_notified_at timestamptz;
begin
  if p_order_id is null or p_actor_user_id is null
     or length(btrim(coalesce(p_event_key, ''))) not between 8 and 180 then
    raise exception using errcode = 'P0001', message = 'INVALID_VEHICLE_READY_COMMAND';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_ADMIN_REQUIRED';
  end if;

  select * into v_order from public.deposit_orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'DEPOSIT_ORDER_NOT_FOUND'; end if;

  select * into v_event from public.deposit_order_events where event_key = p_event_key;
  if found then
    if v_event.deposit_order_id is distinct from p_order_id
       or v_event.event_type <> 'VEHICLE_READY_NOTIFIED' then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select v_order.id, v_order.status, v_order.vehicle_ready_at,
      v_order.vehicle_ready_notified_at, true;
    return;
  end if;

  if v_order.status not in ('CONTRACT_SIGNED', 'WAITING_VEHICLE') then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_INVALID_ORDER_STATE';
  end if;
  if v_order.contract_signed_at is null then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_CONTRACT_NOT_SIGNED';
  end if;
  if not exists (
    select 1 from public.deposit_order_documents d
    where d.deposit_order_id = v_order.id and d.status = 'SIGNED'
  ) then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_SIGNED_DOCUMENT_REQUIRED';
  end if;

  v_ready_at := coalesce(p_vehicle_ready_at, clock_timestamp());
  v_notified_at := clock_timestamp();
  if v_ready_at > v_notified_at then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_TIME_IN_FUTURE';
  end if;

  update public.deposit_orders
  set status = 'PREPARING_DELIVERY',
      vehicle_ready_at = v_ready_at,
      vehicle_ready_notified_at = v_notified_at,
      updated_at = v_notified_at
  where id = v_order.id;

  insert into public.deposit_order_events (
    deposit_order_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  ) values (
    v_order.id, 'VEHICLE_READY_NOTIFIED', 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'vehicle_ready_at', v_ready_at,
      'vehicle_ready_notified_at', v_notified_at,
      'nextStatus', 'PREPARING_DELIVERY',
      'note', p_note
    ),
    v_notified_at
  );

  insert into public.customer_notifications (
    event_key, customer_id, notification_type, title, message, order_type,
    order_id, order_number, previous_status, current_status, action_url
  )
  select
    'VEHICLE_READY_FOR_DELIVERY:' || v_order.id,
    v_order.customer_id,
    'VEHICLE_READY_FOR_DELIVERY',
    'Xe đã sẵn sàng để chuẩn bị bàn giao',
    format('Xe cho đơn %s đã sẵn sàng. FastLane sẽ liên hệ để hẹn lịch bàn giao.', v_order.order_number),
    'DEPOSIT', v_order.id, v_order.order_number, v_order.status, 'PREPARING_DELIVERY',
    '/profile?tab=car-orders&orderId=' || v_order.id
  where v_order.customer_id is not null
  on conflict (event_key) do nothing;

  return query select v_order.id, 'PREPARING_DELIVERY'::text,
    v_ready_at, v_notified_at, false;
end;
$$;

revoke all on function public.sign_deposit_order_contract(uuid,uuid,uuid,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.sign_deposit_order_contract(uuid,uuid,uuid,text,text,text,jsonb,text)
  to service_role;
revoke all on function public.mark_deposit_order_vehicle_ready(uuid,uuid,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.mark_deposit_order_vehicle_ready(uuid,uuid,text,timestamptz,text)
  to service_role;

commit;
