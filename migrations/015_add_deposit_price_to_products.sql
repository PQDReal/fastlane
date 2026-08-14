-- Migration 015: Add deposit_price to products and update data

BEGIN;

-- 1. Thêm cột deposit_price vào bảng products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deposit_price numeric;

-- 2. Thêm ràng buộc để đảm bảo tiền cọc phải là số dương hoặc 0
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_deposit_price_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_deposit_price_nonnegative 
  CHECK (deposit_price IS NULL OR deposit_price >= 0::numeric);

-- 3. Cập nhật số tiền cọc (deposit_price) cho từng dòng xe (dựa theo slug)
UPDATE public.products SET deposit_price = 10000000 WHERE slug = 'vf-2';
UPDATE public.products SET deposit_price = 15000000 WHERE slug = 'vf-3';
UPDATE public.products SET deposit_price = 15000000 WHERE slug = 'vf-5';
UPDATE public.products SET deposit_price = 30000000 WHERE slug = 'vf-6';  -- (Ghi chú: 'vf cọc 30 tr' mặc định là VF 6 theo logic)
UPDATE public.products SET deposit_price = 15000000 WHERE slug = 'vf-mpv-7';
UPDATE public.products SET deposit_price = 50000000 WHERE slug = 'vf-7';
UPDATE public.products SET deposit_price = 30000000 WHERE slug = 'vf-8';
UPDATE public.products SET deposit_price = 15000000 WHERE slug = 'vf-8-all-new';
UPDATE public.products SET deposit_price = 50000000 WHERE slug = 'vf-9';

COMMIT;
