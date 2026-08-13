-- Migration 051: keep accessory cancellation available to the previous
-- application release while the audited command is being rolled out.
--
-- Version 2 events remain the authoritative path. Calls from the previous
-- release are admitted only through service_role and are recorded explicitly
-- as inferred version 1 events, without inventing an administrator identity.

begin;

do $preflight$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.users') is null
     or to_regclass('public.accessory_order_events') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_051_PREREQUISITE_SCHEMA_MISSING';
  end if;

  if to_regprocedure('public.cancel_accessory_order(uuid,uuid,text)') is null
     or to_regprocedure('public.cancel_accessory_order_audited(uuid,text,uuid,text,text,text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_051_CANCELLATION_COMMAND_MISSING';
  end if;
end;
$preflight$;

create or replace function public.guard_accessory_order_cancellation_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_type text;
  v_actor_user_id uuid;
  v_reason_code text;
  v_note text;
  v_cancelled_at timestamptz;
  v_time_source text;
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
    v_actor_type := case
      when new.cancellation_reason = 'ADMIN_CANCELLED' then 'ADMIN'
      when new.cancellation_reason = 'Khách hàng yêu cầu hủy đơn' then 'CUSTOMER'
      else 'UNKNOWN'
    end;
    v_actor_user_id := case
      when new.cancellation_reason = 'Khách hàng yêu cầu hủy đơn' then new.customer_id
      else null
    end;
    v_reason_code := case
      when new.cancellation_reason = 'ADMIN_CANCELLED' then 'admin_decision'
      else 'other'
    end;
    v_note := case
      when new.cancellation_reason = 'ADMIN_CANCELLED' then null
      else nullif(left(btrim(coalesce(new.cancellation_reason, '')), 500), '')
    end;
    v_cancelled_at := coalesce(new.cancelled_at, new.updated_at, clock_timestamp());
    v_time_source := case
      when new.cancelled_at is not null then 'orders.cancelled_at'
      when new.updated_at is not null then 'orders.updated_at'
      else 'compatibility_trigger'
    end;

    new.cancelled_at := v_cancelled_at;
    new.cancelled_by_type := v_actor_type;
    new.cancelled_by_user_id := v_actor_user_id;
    new.cancellation_reason_code := v_reason_code;
    new.cancellation_note := v_note;
    new.cancellation_audit_version := 1;

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
      new.id,
      'ORDER_CANCELLED',
      v_actor_type,
      v_actor_user_id,
      v_reason_code,
      v_note,
      'ROLLOUT_LEGACY_ORDER_CANCELLED:' || new.id::text,
      jsonb_build_object(
        'rolloutCompatibility', true,
        'legacyReason', new.cancellation_reason,
        'actorIdentityKnown', v_actor_user_id is not null,
        'occurredAtSource', v_time_source
      ),
      v_cancelled_at,
      1
    )
    on conflict (event_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_accessory_order_cancellation_audit()
  from public, anon, authenticated, service_role;

-- The previous application release calls this RPC through service_role.
-- Browser roles remain unable to bypass the application authorization layer.
revoke all on function public.cancel_accessory_order(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.cancel_accessory_order(uuid,uuid,text)
  to service_role;

notify pgrst, 'reload schema';

commit;
