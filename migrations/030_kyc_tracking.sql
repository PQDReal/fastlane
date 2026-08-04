-- Migration to add KYC tracking columns to deposit_orders
ALTER TABLE deposit_orders
ADD COLUMN IF NOT EXISTS kyc_session_id text,
ADD COLUMN IF NOT EXISTS kyc_status text;

COMMENT ON COLUMN deposit_orders.kyc_session_id IS 'Session ID from Didit KYC';
COMMENT ON COLUMN deposit_orders.kyc_status IS 'Current KYC status (e.g. PENDING, REVIEW, APPROVED, DECLINED)';
