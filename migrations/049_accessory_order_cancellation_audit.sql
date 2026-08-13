-- Migration 049: make accessory-order cancellation attributable, idempotent,
-- and append-only while preserving the existing inventory/refund command.

begin;

do $preflight$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.users') is null
     or to_regnamespace('app_private') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_049_PREREQUISITE_SCHEMA_MISSING';
  end if;

  if to_regprocedure('public.cancel_accessory_order(uuid,uuid,text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_049_LEGACY_CANCELLATION_COMMAND_MISSING';
  end if;
end;
$preflight$;

alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_type text,
  add column if not exists cancelled_by_user_id uuid,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_note text,
  add column if not exists cancellation_audit_version smallint;

alter table public.orders
  drop constraint if exists orders_cancelled_by_user_id_fkey,
  drop constraint if exists orders_cancelled_by_type_check,
  drop constraint if exists orders_cancellation_reason_code_check,
  drop constraint if exists orders_cancellation_note_length_check,
  drop constraint if exists orders_cancellation_audit_version_check,
  drop constraint if exists orders_cancellation_projection_check;

alter table public.orders
  add constraint orders_cancelled_by_user_id_fkey
    foreign key (cancelled_by_user_id)
    references public.users(id)
    on delete restrict
    not valid,
  add constraint orders_cancelled_by_type_check
    check (
      cancelled_by_type is null
      or cancelled_by_type in ('CUSTOMER', 'ADMIN', 'SYSTEM')
      or (cancelled_by_type = 'UNKNOWN' and cancellation_audit_version = 1)
    ),
  add constraint orders_cancellation_reason_code_check
    check (
      cancellation_reason_code is null
      or cancellation_reason_code in (
        'changed_mind',
        'configuration_change',
        'payment_unavailable',
        'duplicate_order',
        'payment_deadline_expired',
        'inventory_unavailable',
        'admin_decision',
        'other'
      )
    ),
  add constraint orders_cancellation_note_length_check
    check (cancellation_note is null or char_length(cancellation_note) <= 500),
  add constraint orders_cancellation_audit_version_check
    check (cancellation_audit_version is null or cancellation_audit_version in (1, 2)),
  add constraint orders_cancellation_projection_check
    check (
      (
        status = 'CANCELLED'
        and cancellation_audit_version is distinct from 2
      )
      or (
        status = 'CANCELLED'
        and cancellation_audit_version = 2
        and cancelled_at is not null
        and cancelled_by_type in ('CUSTOMER', 'ADMIN', 'SYSTEM')
        and cancellation_reason_code is not null
        and (
          (cancelled_by_type = 'SYSTEM' and cancelled_by_user_id is null)
          or (cancelled_by_type in ('CUSTOMER', 'ADMIN') and cancelled_by_user_id is not null)
        )
      )
      or (
        status <> 'CANCELLED'
        and cancelled_at is null
        and cancelled_by_type is null
        and cancelled_by_user_id is null
        and cancellation_reason_code is null
        and cancellation_note is null
        and cancellation_audit_version is null
      )
    );

alter table public.orders
  validate constraint orders_cancelled_by_user_id_fkey;

create table if not exists public.accessory_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null,
  actor_type text not null,
  actor_user_id uuid references public.users(id) on delete restrict,
  reason_code text not null,
  note text,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  audit_version smallint not null default 2,
  constraint accessory_order_events_type_check
    check (event_type = 'ORDER_CANCELLED'),
  constraint accessory_order_events_actor_type_check
    check (
      actor_type in ('CUSTOMER', 'ADMIN', 'SYSTEM')
      or (actor_type = 'UNKNOWN' and audit_version = 1)
    ),
  constraint accessory_order_events_actor_user_check
    check (
      (actor_type = 'SYSTEM' and actor_user_id is null)
      or (
        actor_type in ('CUSTOMER', 'ADMIN')
        and (actor_user_id is not null or audit_version = 1)
      )
      or (actor_type = 'UNKNOWN' and actor_user_id is null and audit_version = 1)
    ),
  constraint accessory_order_events_reason_check
    check (reason_code in (
      'changed_mind',
      'configuration_change',
      'payment_unavailable',
      'duplicate_order',
      'payment_deadline_expired',
      'inventory_unavailable',
      'admin_decision',
      'other'
    )),
  constraint accessory_order_events_note_length_check
    check (note is null or char_length(note) <= 500),
  constraint accessory_order_events_key_check
    check (char_length(btrim(event_key)) between 8 and 200),
  constraint accessory_order_events_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint accessory_order_events_audit_version_check
    check (audit_version in (1, 2))
);

create unique index if not exists uq_accessory_order_events_event_key
  on public.accessory_order_events(event_key);
create index if not exists idx_accessory_order_events_order_occurred
  on public.accessory_order_events(order_id, occurred_at desc, id desc);

comment on table public.accessory_order_events is
  'Append-only audit trail for accessory-order lifecycle commands. Runtime callers cannot update or delete events.';
comment on column public.accessory_order_events.audit_version is
  'Version 1 marks explicitly inferred legacy history; version 2 is identity-verified by the audited command.';
comment on column public.orders.cancellation_audit_version is
  'Version 1 is a legacy projection with possible inference; version 2 is backed by an immutable accessory_order_events row.';

-- Preserve historical cancellations without fabricating an administrator ID
-- or an exact cancellation timestamp. The legacy updated_at value is retained
-- as the best available timestamp and marked as inferred in event metadata.
update public.orders
   set cancelled_at = coalesce(cancelled_at, updated_at),
       cancelled_by_type = case
         when cancellation_reason = 'ADMIN_CANCELLED' then 'ADMIN'
         when cancellation_reason = 'Khách hàng yêu cầu hủy đơn' then 'CUSTOMER'
         else 'UNKNOWN'
       end,
       cancelled_by_user_id = case
         when cancellation_reason = 'Khách hàng yêu cầu hủy đơn' then customer_id
         else null
       end,
       cancellation_reason_code = case
         when cancellation_reason = 'ADMIN_CANCELLED' then 'admin_decision'
         else 'other'
       end,
       cancellation_note = case
         when cancellation_reason = 'ADMIN_CANCELLED' then null
         else nullif(left(btrim(coalesce(cancellation_reason, '')), 500), '')
       end,
       cancellation_audit_version = 1
 where status = 'CANCELLED'
   and cancellation_audit_version is null;

insert into public.accessory_order_events (
  order_id,
  event_type,
  actor_type,
  actor_user_id,
  reason_code,
  note,
  event_key,
  metadata,
  occurred_at,
  audit_version
)
select
  order_record.id,
  'ORDER_CANCELLED',
  order_record.cancelled_by_type,
  order_record.cancelled_by_user_id,
  order_record.cancellation_reason_code,
  order_record.cancellation_note,
  'LEGACY_ORDER_CANCELLED:' || order_record.id::text,
  jsonb_build_object(
    'legacyBackfill', true,
    'legacyReason', order_record.cancellation_reason,
    'actorIdentityKnown', order_record.cancelled_by_user_id is not null,
    'occurredAtSource', 'orders.updated_at'
  ),
  order_record.cancelled_at,
  1
from public.orders order_record
where order_record.status = 'CANCELLED'
  and order_record.cancellation_audit_version = 1
on conflict (event_key) do nothing;

create or replace function public.reject_accessory_order_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'ACCESSORY_ORDER_EVENT_IMMUTABLE';
end;
$$;

drop trigger if exists trg_reject_accessory_order_event_mutation
  on public.accessory_order_events;
create trigger trg_reject_accessory_order_event_mutation
before update or delete on public.accessory_order_events
for each row execute function public.reject_accessory_order_event_mutation();

create or replace function public.guard_accessory_order_cancellation_audit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'CANCELLED' then
      raise exception using
        errcode = 'P0001',
        message = 'ACCESSORY_ORDER_MUST_NOT_START_CANCELLED';
    end if;
    return new;
  end if;

  if old.cancellation_audit_version = 2
     and (
       new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by_type is distinct from old.cancelled_by_type
       or new.cancelled_by_user_id is distinct from old.cancelled_by_user_id
       or new.cancellation_reason_code is distinct from old.cancellation_reason_code
       or new.cancellation_note is distinct from old.cancellation_note
       or new.cancellation_audit_version is distinct from old.cancellation_audit_version
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_ORDER_CANCELLATION_AUDIT_IMMUTABLE';
  end if;

  if old.status is distinct from 'CANCELLED'
     and new.status = 'CANCELLED'
     and not exists (
       select 1
         from public.accessory_order_events event
        where event.order_id = new.id
          and event.event_type = 'ORDER_CANCELLED'
          and event.audit_version = 2
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_ORDER_CANCELLATION_EVENT_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_accessory_order_cancellation_audit
  on public.orders;
create trigger trg_guard_accessory_order_cancellation_audit
before insert or update on public.orders
for each row execute function public.guard_accessory_order_cancellation_audit();

create or replace function public.cancel_accessory_order_audited(
  p_order_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_reason_code text,
  p_note text,
  p_event_key text
)
returns table(
  order_status text,
  refund_status text,
  cancelled_at timestamptz,
  cancellation_event_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_event public.accessory_order_events%rowtype;
  v_cancelled_at timestamptz := clock_timestamp();
  v_event_id uuid;
  v_note text := nullif(btrim(p_note), '');
  v_legacy_reason text;
begin
  if p_order_id is null
     or p_actor_type is null
     or p_actor_type not in ('CUSTOMER', 'ADMIN')
     or p_actor_user_id is null
     or p_reason_code is null
     or p_reason_code not in (
       'changed_mind',
       'configuration_change',
       'payment_unavailable',
       'duplicate_order',
       'inventory_unavailable',
       'admin_decision',
       'other'
     )
     or char_length(btrim(coalesce(p_event_key, ''))) not between 8 and 200
     or char_length(coalesce(v_note, '')) > 500
     or (p_reason_code = 'other' and v_note is null) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_CANCELLATION_INPUT_INVALID';
  end if;

  if (p_actor_type = 'CUSTOMER' and p_reason_code not in (
        'changed_mind',
        'configuration_change',
        'payment_unavailable',
        'duplicate_order',
        'other'
      ))
     or (p_actor_type = 'ADMIN' and p_reason_code not in (
        'inventory_unavailable',
        'admin_decision',
        'other'
      )) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_CANCELLATION_REASON_FORBIDDEN';
  end if;

  if not exists (
    select 1
      from public.users actor
     where actor.id = p_actor_user_id
       and actor.role::text = p_actor_type
       and actor.status::text = 'ACTIVE'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_CANCELLATION_ACTOR_INVALID';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_ORDER_NOT_FOUND';
  end if;

  if p_actor_type = 'CUSTOMER'
     and v_order.customer_id is distinct from p_actor_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_CANCELLATION_FORBIDDEN';
  end if;

  select *
    into v_event
    from public.accessory_order_events
   where event_key = p_event_key;
  if found then
    if v_event.order_id is distinct from p_order_id
       or v_event.event_type <> 'ORDER_CANCELLED'
       or v_event.actor_type <> p_actor_type
       or v_event.actor_user_id is distinct from p_actor_user_id
       or v_event.reason_code <> p_reason_code
       or coalesce(v_event.note, '') <> coalesce(v_note, '') then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;

    return query
      select v_order.status::text,
             coalesce(v_order.refund_status::text, 'NONE'),
             v_event.occurred_at,
             v_event.id,
             true;
    return;
  end if;

  if v_order.status::text not in ('PENDING', 'PAID', 'CONFIRMED') then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_ORDER_CANNOT_BE_CANCELLED_FROM_' || v_order.status::text;
  end if;

  insert into public.accessory_order_events (
    order_id,
    event_type,
    actor_type,
    actor_user_id,
    reason_code,
    note,
    event_key,
    metadata,
    occurred_at,
    audit_version
  ) values (
    p_order_id,
    'ORDER_CANCELLED',
    p_actor_type,
    p_actor_user_id,
    p_reason_code,
    v_note,
    p_event_key,
    jsonb_build_object(
      'previousStatus', v_order.status::text,
      'legacyCommand', 'cancel_accessory_order'
    ),
    v_cancelled_at,
    2
  )
  returning id into v_event_id;

  v_legacy_reason := case p_actor_type
    when 'ADMIN' then 'ADMIN_CANCELLED'
    else 'Khách hàng yêu cầu hủy đơn'
  end;

  -- The legacy command remains the single source of inventory, promotion and
  -- refund side effects. Calling it inside this security-definer transaction
  -- keeps those effects atomic with the new immutable audit event.
  perform public.cancel_accessory_order(
    p_order_id,
    v_order.customer_id,
    v_legacy_reason
  );

  select *
    into v_order
    from public.orders
   where id = p_order_id;
  if v_order.status::text <> 'CANCELLED' then
    raise exception using
      errcode = 'P0001',
      message = 'ACCESSORY_CANCELLATION_LEGACY_COMMAND_FAILED';
  end if;

  update public.orders
     set cancelled_at = v_cancelled_at,
         cancelled_by_type = p_actor_type,
         cancelled_by_user_id = p_actor_user_id,
         cancellation_reason_code = p_reason_code,
         cancellation_note = v_note,
         cancellation_audit_version = 2
   where id = p_order_id;

  return query
    select 'CANCELLED'::text,
           coalesce(v_order.refund_status::text, 'NONE'),
           v_cancelled_at,
           v_event_id,
           false;
end;
$$;

alter table public.accessory_order_events enable row level security;

revoke all on table public.accessory_order_events
  from public, anon, authenticated, service_role;
grant select on table public.accessory_order_events to service_role;

revoke all on function public.reject_accessory_order_event_mutation()
  from public, anon, authenticated;
revoke all on function public.guard_accessory_order_cancellation_audit()
  from public, anon, authenticated;
revoke all on function public.cancel_accessory_order_audited(uuid,text,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.cancel_accessory_order_audited(uuid,text,uuid,text,text,text)
  to service_role;

-- All runtime cancellation must pass through the audited command. The new
-- security-definer function can still invoke the legacy command as its owner.
revoke all on function public.cancel_accessory_order(uuid,uuid,text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
