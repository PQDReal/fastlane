-- Migration 020: Add is_active column to vehicle_variants

BEGIN;

-- Thêm cột is_active với giá trị mặc định là TRUE cho tất cả các bản ghi hiện tại và tương lai
ALTER TABLE public.vehicle_variants
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- Thêm index để tăng tốc độ truy vấn khi lọc danh sách theo is_active
CREATE INDEX IF NOT EXISTS idx_vehicle_variants_is_active ON public.vehicle_variants(is_active);

COMMIT;
