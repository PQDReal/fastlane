-- Migration 013: Create vehicle_variants and migrate data

BEGIN;

-- 1. Create the new vehicle_variants table
CREATE TABLE IF NOT EXISTS public.vehicle_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE,
  vehicle_model_id uuid,
  variant_name text, -- Tên biến thể (VD: VF 8 Eco, VF 9 Plus...)
  sku text, -- Mã SKU (VD: VF8-ECO)
  price numeric, -- Giá bán
  edition_code text, -- Mã phiên bản (VD: ND31V, ND32V...)
  deposit_amount numeric CHECK (deposit_amount IS NULL OR deposit_amount >= 0::numeric),
  image_url text CHECK (image_url IS NULL OR image_url ~ '^https?://'::text),
  battery_capacity text, -- Dung lượng pin (VD: 87.7 kWh)
  range_km integer, -- Tầm hoạt động (VD: 471 km)
  max_power text, -- Công suất tối đa (VD: 300 kW / 402 hp)
  max_torque text, -- Mô-men xoắn cực đại (VD: 620 Nm)
  seats integer, -- Số chỗ ngồi
  specs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specs) = 'object'::text), -- Lưu các thông số kỹ thuật chi tiết khác
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  
  CONSTRAINT vehicle_variants_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_variants_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  CONSTRAINT vehicle_variants_vehicle_model_id_fkey FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id)
);

-- Bổ sung các cột nếu bảng đã được tạo ở bản migration cũ trước đó
ALTER TABLE public.vehicle_variants
  ADD COLUMN IF NOT EXISTS variant_name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS edition_code text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS battery_capacity text,
  ADD COLUMN IF NOT EXISTS range_km integer,
  ADD COLUMN IF NOT EXISTS max_power text,
  ADD COLUMN IF NOT EXISTS max_torque text,
  ADD COLUMN IF NOT EXISTS seats integer,
  ADD COLUMN IF NOT EXISTS specs jsonb DEFAULT '{}'::jsonb;

-- Enable RLS and setup policies
ALTER TABLE public.vehicle_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_variants_public_read ON public.vehicle_variants;
CREATE POLICY vehicle_variants_public_read
ON public.vehicle_variants
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
    WHERE v.id = variant_id AND v.is_active AND p.is_active
  )
);

GRANT SELECT ON public.vehicle_variants TO anon, authenticated;
GRANT ALL ON public.vehicle_variants TO service_role;

-- Setup trigger for updated_at
DROP TRIGGER IF EXISTS vehicle_variants_touch_updated_at ON public.vehicle_variants;
CREATE TRIGGER vehicle_variants_touch_updated_at
BEFORE UPDATE ON public.vehicle_variants
FOR EACH ROW EXECUTE FUNCTION app_private.touch_catalog_updated_at();

-- 2. Migrate existing deposit_amount from product_variants to vehicle_variants
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'product_variants' 
      AND column_name = 'deposit_amount'
  ) THEN
    -- Di chuyển dữ liệu deposit_amount hiện có
    INSERT INTO public.vehicle_variants (variant_id, deposit_amount)
    SELECT id, deposit_amount 
    FROM public.product_variants 
    WHERE deposit_amount IS NOT NULL
    ON CONFLICT (variant_id) DO NOTHING;
    
    -- Xóa cột khỏi product_variants sau khi đã chuyển thành công
    ALTER TABLE public.product_variants DROP COLUMN deposit_amount;
  END IF;
END $$;

-- 3. Đồng bộ Tên, SKU, Giá từ product_variants sang vehicle_variants để nhìn vào bảng là biết ngay xe nào
UPDATE public.vehicle_variants vv
SET 
  variant_name = pv.name,
  sku = pv.sku,
  price = COALESCE(pv.sale_price, pv.original_price)
FROM public.product_variants pv
WHERE vv.variant_id = pv.id;

-- 4. Tạo VIEW giúp xem toàn bộ thông tin biến thể xe một cách dễ dàng
CREATE OR REPLACE VIEW public.vw_vehicle_variants_details AS
SELECT 
    vv.id as vehicle_variant_id,
    vv.variant_id,
    p.name AS product_name,          -- Tên dòng xe (VD: VF 8)
    vv.variant_name,                 -- Tên biến thể (VD: VF 8 Eco)
    vv.sku AS variant_sku,           -- Mã SKU
    vv.edition_code,                 -- Mã phiên bản
    vv.price,                        -- Giá bán
    vv.deposit_amount,               -- Số tiền đặt cọc
    vv.image_url,                    -- Hình ảnh xe
    vv.battery_capacity,             -- Dung lượng pin
    vv.range_km,                     -- Tầm hoạt động
    vv.max_power,                    -- Công suất
    vv.max_torque,                   -- Mô men xoắn
    vv.seats,                        -- Số chỗ ngồi
    vv.specs,                        -- Các thông số khác (jsonb)
    pv.is_active                     -- Trạng thái bán
FROM public.vehicle_variants vv
JOIN public.product_variants pv ON vv.variant_id = pv.id
JOIN public.products p ON pv.product_id = p.id;

GRANT SELECT ON public.vw_vehicle_variants_details TO anon, authenticated, service_role;

COMMIT;
