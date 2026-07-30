-- Migration 021: Link deposit_orders to vehicle_variants

BEGIN;

ALTER TABLE public.deposit_orders
ADD COLUMN IF NOT EXISTS vehicle_variant_id uuid REFERENCES public.vehicle_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_orders_vehicle_variant_id ON public.deposit_orders(vehicle_variant_id);

COMMIT;
