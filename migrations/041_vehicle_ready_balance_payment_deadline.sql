-- Migration 041: vehicle-ready handoff and direct balance-payment deadline.
-- The signed contract does not open balance payment. The seller's committed
-- vehicle-ready notification starts a versioned 7-business-day window.

begin;

do $preflight$
begin
  if to_regclass('public.deposit_orders') is null
     or to_regclass('public.deposit_order_events') is null
     or to_regclass('public.customer_notifications') is null then
    raise exception using errcode = 'P0001',
      message = 'VRB_SCHEMA_PREREQUISITE_MISSING';
  end if;
end;
$preflight$;

alter table public.deposit_orders
  add column if not exists vehicle_ready_at timestamptz,
  add column if not exists vehicle_ready_notified_at timestamptz,
  add column if not exists balance_payment_due_at timestamptz,
  add column if not exists balance_payment_window_business_days smallint,
  add column if not exists balance_payment_policy_version text,
  add column if not exists balance_payment_overdue_at timestamptz,
  add column if not exists balance_payment_mode text;

alter table public.deposit_orders
  drop constraint if exists deposit_orders_status_check;

alter table public.deposit_orders
  add constraint deposit_orders_status_check check (status in (
    'PENDING_DEPOSIT',
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'PENDING_CONTRACT',
    'CONTRACT_SIGNED',
    'WAITING_VEHICLE',
    'PENDING_PAYMENT',
    'PAID',
    'PREPARING_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
    'PENDING'
  ));

alter table public.deposit_orders
  drop constraint if exists deposit_orders_vehicle_ready_projection_check,
  drop constraint if exists deposit_orders_balance_payment_policy_check,
  drop constraint if exists deposit_orders_balance_payment_state_check;

alter table public.deposit_orders
  add constraint deposit_orders_vehicle_ready_projection_check check (
    (vehicle_ready_at is null or contract_signed_at is not null)
    and (vehicle_ready_notified_at is null or vehicle_ready_at is not null)
    and (balance_payment_due_at is null or vehicle_ready_notified_at is not null)
    and (balance_payment_overdue_at is null or balance_payment_due_at is not null)
  ),
  add constraint deposit_orders_balance_payment_policy_check check (
    (balance_payment_window_business_days is null and balance_payment_policy_version is null)
    or (
      balance_payment_window_business_days between 1 and 365
      and balance_payment_policy_version is not null
      and length(btrim(balance_payment_policy_version)) between 3 and 120
    )
  ),
  add constraint deposit_orders_balance_payment_state_check check (
    (status <> 'PENDING_PAYMENT')
    or (balance_payment_policy_version is null)
    or (
      balance_payment_due_at is not null
      and vehicle_ready_notified_at is not null
      and balance_payment_window_business_days is not null
      and balance_payment_policy_version is not null
      and balance_payment_mode is not null
    )
  );

create index if not exists idx_deposit_orders_balance_payment_due
  on public.deposit_orders (balance_payment_due_at, id)
  where status = 'PENDING_PAYMENT' and balance_payment_overdue_at is null;

create index if not exists idx_deposit_orders_vehicle_ready
  on public.deposit_orders (status, vehicle_ready_notified_at, id)
  where status = 'WAITING_VEHICLE';

comment on column public.deposit_orders.vehicle_ready_at is
  'Operational timestamp at which the seller confirmed the vehicle is ready for delivery.';
comment on column public.deposit_orders.vehicle_ready_notified_at is
  'Database commit timestamp of the seller notification that starts the balance-payment window.';
comment on column public.deposit_orders.balance_payment_due_at is
  'Authoritative direct-payment deadline calculated from vehicle_ready_notified_at using the stored policy version.';
comment on column public.deposit_orders.balance_payment_window_business_days is
  'Snapshot of the business-day window used for this order; rollout default is 7.';
comment on column public.deposit_orders.balance_payment_policy_version is
  'Version of the business calendar/payment policy used to calculate the stored due date.';
comment on column public.deposit_orders.balance_payment_overdue_at is
  'First database timestamp at which the scheduler recorded the payment as overdue; does not terminate the contract.';
comment on column public.deposit_orders.balance_payment_mode is
  'Payment mode for the balance workflow. DIRECT is implemented by this migration; financing is a separate workflow.';

create table if not exists public.business_calendar_dates (
  calendar_code text not null,
  calendar_date date not null,
  is_business_day boolean not null,
  reason text,
  policy_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint business_calendar_dates_code_check check (length(btrim(calendar_code)) between 2 and 64),
  constraint business_calendar_dates_policy_check check (length(btrim(policy_version)) between 3 and 120),
  constraint business_calendar_dates_reason_check check (reason is null or length(btrim(reason)) between 1 and 240),
  primary key (calendar_code, calendar_date, policy_version)
);

alter table public.business_calendar_dates enable row level security;
revoke all on table public.business_calendar_dates from public, anon, authenticated, service_role;

create or replace function public.is_business_calendar_day(
  p_calendar_code text,
  p_policy_version text,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select c.is_business_day
      from public.business_calendar_dates c
      where c.calendar_code = p_calendar_code
        and c.policy_version = p_policy_version
        and c.calendar_date = p_date
    ),
    extract(isodow from p_date)::integer between 1 and 5
  );
$$;

create or replace function public.add_business_days(
  p_start_at timestamptz,
  p_business_days integer,
  p_calendar_code text,
  p_policy_version text,
  p_timezone text default 'Asia/Ho_Chi_Minh'
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := (p_start_at at time zone p_timezone)::date;
  v_count integer := 0;
begin
  if p_start_at is null or p_business_days is null or p_business_days < 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_BUSINESS_DAY_INPUT';
  end if;

  while v_count < p_business_days loop
    v_date := v_date + 1;
    if public.is_business_calendar_day(p_calendar_code, p_policy_version, v_date) then
      v_count := v_count + 1;
    end if;
  end loop;

  -- The customer has until the end of the last business day in Vietnam time.
  return ((v_date::text || ' 23:59:59.999999')::timestamp at time zone p_timezone);
end;
$$;

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
    'BALANCE_PAYMENT_COMPLETED'
  ));

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;

alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (notification_type in (
    'ORDER_STATUS_CHANGED',
    'CONTRACT_ISSUED',
    'CONTRACT_SIGNATURE_REMINDER',
    'CONTRACT_EXPIRED',
    'REFUND_STARTED',
    'REFUND_COMPLETED',
    'REFUND_FAILED',
    'VEHICLE_READY_PAYMENT_REQUESTED',
    'BALANCE_PAYMENT_REMINDER',
    'BALANCE_PAYMENT_OVERDUE',
    'BALANCE_PAYMENT_COMPLETED'
  ));

drop function if exists public.notify_deposit_order_vehicle_ready(uuid, uuid, text, timestamptz, text, text, text, text);

create or replace function public.notify_deposit_order_vehicle_ready(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_event_key text,
  p_vehicle_ready_at timestamptz,
  p_payment_mode text,
  p_calendar_code text,
  p_policy_version text,
  p_note text
)
returns table (
  order_id uuid,
  status text,
  vehicle_ready_at timestamptz,
  vehicle_ready_notified_at timestamptz,
  balance_payment_due_at timestamptz,
  balance_payment_window_business_days smallint,
  balance_payment_policy_version text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.deposit_orders%rowtype;
  v_event public.deposit_order_events%rowtype;
  v_document_id uuid;
  v_notified_at timestamptz;
  v_ready_at timestamptz;
  v_due_at timestamptz;
  v_calendar_code text := coalesce(nullif(btrim(p_calendar_code), ''), 'VN_DEFAULT');
  v_policy_version text := coalesce(nullif(btrim(p_policy_version), ''), 'VN_WEEKDAY_V1');
begin
  if p_order_id is null or p_actor_user_id is null or p_event_key is null
     or length(btrim(p_event_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_VEHICLE_READY_COMMAND';
  end if;

  if p_payment_mode is distinct from 'DIRECT' then
    raise exception using errcode = 'P0001', message = 'FINANCING_WORKFLOW_REQUIRED';
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = p_actor_user_id and u.role = 'ADMIN' and u.status = 'ACTIVE'
  ) then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_ADMIN_REQUIRED';
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
    if v_event.deposit_order_id <> p_order_id then
      raise exception using errcode = 'P0001', message = 'VEHICLE_READY_EVENT_KEY_REUSED';
    end if;
    return query
      select v_order.id, v_order.status, v_order.vehicle_ready_at,
        v_order.vehicle_ready_notified_at, v_order.balance_payment_due_at,
        v_order.balance_payment_window_business_days,
        v_order.balance_payment_policy_version, true;
    return;
  end if;

  if v_order.status = 'PENDING_PAYMENT' and v_order.balance_payment_due_at is not null then
    return query
      select v_order.id, v_order.status, v_order.vehicle_ready_at,
        v_order.vehicle_ready_notified_at, v_order.balance_payment_due_at,
        v_order.balance_payment_window_business_days,
        v_order.balance_payment_policy_version, true;
    return;
  end if;

  if v_order.status not in ('CONTRACT_SIGNED', 'WAITING_VEHICLE', 'PENDING_PAYMENT') then
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

  if not exists (
    select 1 from public.vnpay_deposit_attempts p
    where p.deposit_order_id = v_order.id and p.status = 'PAID'
  ) then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_DEPOSIT_NOT_PAID';
  end if;

  v_ready_at := coalesce(p_vehicle_ready_at, clock_timestamp());
  v_notified_at := clock_timestamp();
  if v_ready_at > v_notified_at then
    raise exception using errcode = 'P0001', message = 'VEHICLE_READY_TIME_IN_FUTURE';
  end if;

  v_due_at := public.add_business_days(v_notified_at, 7, v_calendar_code, v_policy_version);

  update public.deposit_orders
  set status = 'PENDING_PAYMENT',
      vehicle_ready_at = v_ready_at,
      vehicle_ready_notified_at = v_notified_at,
      balance_payment_due_at = v_due_at,
      balance_payment_window_business_days = 7,
      balance_payment_policy_version = v_policy_version,
      balance_payment_overdue_at = null,
      balance_payment_mode = 'DIRECT',
      updated_at = v_notified_at
  where id = v_order.id;

  insert into public.deposit_order_events (
    deposit_order_id, document_id, event_type, actor_type, actor_user_id,
    event_key, metadata, occurred_at
  )
  select v_order.id, d.id, 'VEHICLE_READY_NOTIFIED', 'ADMIN', p_actor_user_id,
    p_event_key,
    jsonb_build_object(
      'vehicle_ready_at', v_ready_at,
      'vehicle_ready_notified_at', v_notified_at,
      'balance_payment_due_at', v_due_at,
      'balance_payment_window_business_days', 7,
      'balance_payment_mode', 'DIRECT',
      'calendar_code', v_calendar_code,
      'policy_version', v_policy_version,
      'note', p_note
    ),
    v_notified_at
  from public.deposit_order_documents d
  where d.deposit_order_id = v_order.id and d.status = 'SIGNED'
  order by d.signed_at desc nulls last
  limit 1;

  insert into public.customer_notifications (
    event_key, customer_id, notification_type, title, message, order_type,
    order_id, order_number, previous_status, current_status, action_url
  )
  select
    'VEHICLE_READY_PAYMENT_REQUESTED:' || v_order.id,
    v_order.customer_id,
    'VEHICLE_READY_PAYMENT_REQUESTED',
    'Xe đã sẵn sàng, đến hạn thanh toán phần còn lại',
    format('Xe cho đơn %s đã sẵn sàng. Vui lòng thanh toán phần còn lại trong 07 ngày làm việc, trước %s.', v_order.order_number, to_char(v_due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')),
    'DEPOSIT', v_order.id, v_order.order_number, 'WAITING_VEHICLE', 'PENDING_PAYMENT',
    '/profile?tab=car-orders&orderId=' || v_order.id
  where v_order.customer_id is not null
  on conflict (event_key) do nothing;

  return query
    select v_order.id, 'PENDING_PAYMENT'::text, v_ready_at, v_notified_at,
      v_due_at, 7::smallint, v_policy_version, false;
end;
$$;

drop function if exists public.mark_due_deposit_balance_payments(uuid, integer);

create or replace function public.mark_due_deposit_balance_payments(
  p_job_run_id uuid,
  p_limit integer
)
returns table (
  order_id uuid,
  order_number text,
  customer_id uuid,
  overdue_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_now timestamptz := clock_timestamp();
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
begin
  if p_job_run_id is null then
    raise exception using errcode = 'P0001', message = 'BALANCE_OVERDUE_JOB_ID_REQUIRED';
  end if;

  for v_order in
    select d.id, d.order_number, d.customer_id, d.balance_payment_due_at,
      d.balance_payment_policy_version
    from public.deposit_orders d
    where d.status = 'PENDING_PAYMENT'
      and d.balance_payment_due_at <= v_now
      and d.balance_payment_overdue_at is null
    order by d.balance_payment_due_at, d.id
    limit v_limit
    for update skip locked
  loop
    update public.deposit_orders
    set balance_payment_overdue_at = v_now, updated_at = v_now
    where id = v_order.id and balance_payment_overdue_at is null;

    insert into public.deposit_order_events (
      deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
    ) values (
      v_order.id, 'BALANCE_PAYMENT_OVERDUE', 'SYSTEM',
      'BALANCE_PAYMENT_OVERDUE:' || v_order.id || ':' || coalesce(v_order.balance_payment_policy_version, 'UNKNOWN'),
      jsonb_build_object('job_run_id', p_job_run_id, 'due_at', v_order.balance_payment_due_at, 'overdue_at', v_now),
      v_now
    ) on conflict (event_key) do nothing;

    insert into public.customer_notifications (
      event_key, customer_id, notification_type, title, message, order_type,
      order_id, order_number, previous_status, current_status, action_url
    ) values (
      'BALANCE_PAYMENT_OVERDUE:' || v_order.id,
      v_order.customer_id,
      'BALANCE_PAYMENT_OVERDUE',
      'Khoản thanh toán phần còn lại đã quá hạn',
      format('Khoản thanh toán phần còn lại của đơn %s đã quá hạn. Vui lòng liên hệ FastLane để được hướng dẫn.', v_order.order_number),
      'DEPOSIT', v_order.id, v_order.order_number, 'PENDING_PAYMENT', 'PENDING_PAYMENT',
      '/profile?tab=car-orders&orderId=' || v_order.id
    ) on conflict (event_key) do nothing;

    order_id := v_order.id;
    order_number := v_order.order_number;
    customer_id := v_order.customer_id;
    overdue_at := v_now;
    return next;
  end loop;
end;
$$;

revoke all on function public.is_business_calendar_day(text, text, date) from public, anon, authenticated, service_role;
revoke all on function public.add_business_days(timestamptz, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.notify_deposit_order_vehicle_ready(uuid, uuid, text, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_due_deposit_balance_payments(uuid, integer) from public, anon, authenticated;
grant execute on function public.notify_deposit_order_vehicle_ready(uuid, uuid, text, timestamptz, text, text, text, text) to service_role;
grant execute on function public.mark_due_deposit_balance_payments(uuid, integer) to service_role;

commit;
