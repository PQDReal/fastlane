-- Migration 050: add covering indexes for cancellation actor foreign keys.
-- These keep actor-centric audit queries and FK maintenance efficient as the
-- cancellation history grows.

begin;

create index if not exists idx_orders_cancelled_by_user_id
on public.orders(cancelled_by_user_id)
where cancelled_by_user_id is not null;

create index if not exists idx_accessory_order_events_actor_user_id
on public.accessory_order_events(actor_user_id, occurred_at desc)
where actor_user_id is not null;

commit;
