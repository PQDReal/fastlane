-- Migration 025: Add promotion fields to deposit_orders
BEGIN;

ALTER TABLE public.deposit_orders 
ADD COLUMN IF NOT EXISTS promotion_code text null,
ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 2) not null default 0;

COMMIT;
