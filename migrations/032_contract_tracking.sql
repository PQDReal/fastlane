-- Migration to add contract_signed_at to deposit_orders
ALTER TABLE deposit_orders
ADD COLUMN IF NOT EXISTS contract_signed_at timestamp with time zone;

COMMENT ON COLUMN deposit_orders.contract_signed_at IS 'Timestamp when the user digitally signed the purchase contract';
