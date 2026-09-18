-- Migration 018: Update vehicle_variants schema
BEGIN;

DROP TABLE IF EXISTS public.vehicle_variants CASCADE;

-- Add unique constraint to products to allow composite foreign key
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_id_type_key CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_id_type_key UNIQUE (id, product_type);

CREATE TABLE public.vehicle_variants (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  product_type text not null check (product_type IN ('CAR', 'BIKE')),
  product_name text null,
  deposit_amount numeric null,
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp(),
  specs jsonb null default '{}'::jsonb,
  variant_name text null,
  sku text null,
  price numeric null,
  color text null,
  image_car_url text null,
  image_color_url text null,
  version text null,
  
  CONSTRAINT vehicle_variants_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_variants_product_id_fkey FOREIGN KEY (product_id, product_type) REFERENCES public.products (id, product_type) ON DELETE CASCADE,
  CONSTRAINT vehicle_variants_deposit_amount_check CHECK (deposit_amount IS NULL OR deposit_amount >= 0::numeric),
  CONSTRAINT vehicle_variants_image_car_url_check CHECK (image_car_url IS NULL OR image_car_url ~ '^https?://'::text),
  CONSTRAINT vehicle_variants_image_color_url_check CHECK (image_color_url IS NULL OR image_color_url ~ '^https?://'::text)
) TABLESPACE pg_default;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS vehicle_variants_touch_updated_at ON public.vehicle_variants;
CREATE TRIGGER vehicle_variants_touch_updated_at 
  BEFORE UPDATE ON public.vehicle_variants 
  FOR EACH ROW
  EXECUTE FUNCTION app_private.touch_catalog_updated_at();

-- Enable RLS and setup policies
ALTER TABLE public.vehicle_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_variants_public_read ON public.vehicle_variants;
CREATE POLICY vehicle_variants_public_read
  ON public.vehicle_variants
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS vehicle_variants_admin_all ON public.vehicle_variants;
CREATE POLICY vehicle_variants_admin_all
  ON public.vehicle_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

COMMIT;
