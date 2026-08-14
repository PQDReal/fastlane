-- Replace a global idempotency-key constraint with request-owner scopes.
-- Authenticated customers are scoped by customer_id. Until a dedicated guest
-- session column exists, guest deposits are scoped by normalized email.
alter table public.deposit_orders
  drop constraint if exists deposit_orders_idempotency_key_key;

drop index if exists public.deposit_orders_idempotency_key_key;
drop index if exists public.idx_deposit_orders_idempotency_key;

create unique index if not exists uq_deposit_orders_customer_idempotency
  on public.deposit_orders (customer_id, idempotency_key)
  where customer_id is not null;

create unique index if not exists uq_deposit_orders_guest_idempotency
  on public.deposit_orders (lower(email), idempotency_key)
  where customer_id is null;

