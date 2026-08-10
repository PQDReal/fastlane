-- Migration 048: align callback validation with the persisted VNPAY
-- transaction number column so oversized input fails with a domain error
-- before PostgreSQL attempts to write varchar(32).
begin;

do $preflight$
begin
  if to_regclass('public.deposit_orders') is null
     or to_regclass('public.vnpay_deposit_attempts') is null
     or to_regclass('public.deposit_order_events') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MIGRATION_048_PREREQUISITE_TABLE_MISSING';
  end if;
end;
$preflight$;

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
     or length(coalesce(p_response_code, '')) > 32
     or length(coalesce(p_transaction_no, '')) > 32
     or length(coalesce(p_bank_code, '')) > 32 then
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
    return query select v_attempt.status::text, v_order.status::text, v_order.refund_status::text,
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
      return query select v_attempt.status::text, v_order.status::text, v_order.refund_status::text,
        'PAYMENT_FAILED'::text, false;
      return;
    end if;

    return query select v_attempt.status::text, v_order.status::text, v_order.refund_status::text,
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

  return query select v_attempt.status::text, v_order.status::text, v_order.refund_status::text,
    v_outcome, (v_attempt.paid_at is not null);
end;
$$;

revoke all on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz)
  to service_role;

comment on function public.process_vnpay_deposit_callback(uuid,boolean,text,text,text,jsonb,timestamptz) is
  'Atomically records a verified VNPAY deposit callback with varchar(32)-aligned transaction number validation.';

commit;
