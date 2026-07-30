-- Migration 014: Split product_type 'VEHICLE' into 'CAR' and 'BIKE'
-- Chuyển trực tiếp cột product_type của bảng products từ ENUM (public.product_type) sang TEXT + CHECK constraint

BEGIN;

-- 1. Chuyển kiểu dữ liệu cột product_type từ ENUM sang TEXT (tránh hoàn toàn lỗi transaction 55P04)
ALTER TABLE public.products ALTER COLUMN product_type TYPE text USING product_type::text;

-- 2. Chuyển các dòng xe máy điện đang là VEHICLE sang BIKE
UPDATE public.products
SET product_type = 'BIKE'
WHERE product_type = 'VEHICLE' 
  AND (
    name ILIKE '%klara%' OR name ILIKE '%feliz%' OR name ILIKE '%evo%' OR 
    name ILIKE '%vento%' OR name ILIKE '%theon%' OR name ILIKE '%impes%' OR 
    name ILIKE '%ludo%' OR name ILIKE '%tempest%' OR slug ILIKE '%bike%' OR slug ILIKE '%xe-may%'
  );

-- 3. Chuyển các dòng phương tiện còn lại đang là VEHICLE sang CAR (Ô tô điện)
UPDATE public.products
SET product_type = 'CAR'
WHERE product_type = 'VEHICLE';

-- 4. Thêm Check Constraint để đảm bảo tính toàn vẹn dữ liệu (chỉ chấp nhận các giá trị hợp lệ)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_product_type_check 
  CHECK (product_type IN ('ACCESSORY', 'CAR', 'BIKE', 'VEHICLE'));

-- (Tùy chọn) Nếu bảng order_items cũng dùng ENUM cho product_type_snapshot thì mở comment dòng dưới:
-- ALTER TABLE public.order_items ALTER COLUMN product_type_snapshot TYPE text USING product_type_snapshot::text;

COMMIT;
