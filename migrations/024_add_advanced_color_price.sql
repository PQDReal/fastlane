-- Migration 023: Add advanced_color_price to products
BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS advanced_color_price numeric null;

-- VF 2, VF 3, VF 5, VF 6 (Màu nâng cao: 8 triệu)
UPDATE public.products SET advanced_color_price = 8000000 WHERE name = 'VinFast VF 2';
UPDATE public.products SET advanced_color_price = 8000000 WHERE name = 'VinFast VF 3';
UPDATE public.products SET advanced_color_price = 8000000 WHERE name = 'VinFast VF 5';
UPDATE public.products SET advanced_color_price = 8000000 WHERE name = 'VinFast VF 6';

-- VF 7, VF 8, VF 9 (Màu nâng cao: 12 triệu)
UPDATE public.products SET advanced_color_price = 12000000 WHERE name = 'VinFast VF 7';
UPDATE public.products SET advanced_color_price = 12000000 WHERE name = 'VinFast VF 8';
UPDATE public.products SET advanced_color_price = 12000000 WHERE name = 'VinFast VF 8 The All-New 2026';
UPDATE public.products SET advanced_color_price = 12000000 WHERE name = 'VinFast VF 9';

-- VF MPV 7 (Màu nâng cao: 10 triệu)
UPDATE public.products SET advanced_color_price = 10000000 WHERE name = 'VinFast VF MPV 7';

COMMIT;
