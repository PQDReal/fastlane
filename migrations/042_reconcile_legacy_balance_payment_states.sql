-- Migration 042: safely move legacy balance-payment rows into the vehicle-ready handoff.
-- Only rows with a signed document and a paid deposit are eligible for automatic repair.

begin;

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
    'BALANCE_PAYMENT_WORKFLOW_MIGRATED'
  ));

with eligible as (
  select d.id
  from public.deposit_orders d
  where d.status = 'PENDING_PAYMENT'
    and d.balance_payment_due_at is null
    and d.contract_signed_at is not null
    and exists (
      select 1 from public.deposit_order_documents doc
      where doc.deposit_order_id = d.id and doc.status = 'SIGNED'
    )
    and exists (
      select 1 from public.vnpay_deposit_attempts attempt
      where attempt.deposit_order_id = d.id and attempt.status = 'PAID'
    )
), updated as (
  update public.deposit_orders d
  set status = 'WAITING_VEHICLE',
      balance_payment_mode = 'DIRECT',
      updated_at = clock_timestamp()
  from eligible e
  where d.id = e.id
  returning d.id, d.order_number
)
insert into public.deposit_order_events (
  deposit_order_id, event_type, actor_type, event_key, metadata, occurred_at
)
select u.id,
  'BALANCE_PAYMENT_WORKFLOW_MIGRATED',
  'SYSTEM',
  'BALANCE_PAYMENT_WORKFLOW_MIGRATED:' || u.id || ':V1',
  jsonb_build_object(
    'reason', 'Legacy PENDING_PAYMENT row moved behind vehicle-ready notification',
    'payment_mode', 'DIRECT',
    'requires_vehicle_ready_command', true
  ),
  clock_timestamp()
from updated u
on conflict (event_key) do nothing;

commit;
