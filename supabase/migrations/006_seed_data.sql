-- Migration 006: Seed Data
-- Pre-populates the database with essential configuration and sample data.

-- ==========================================
-- 1. SYSTEM SETTINGS
-- ==========================================
INSERT INTO public.system_settings (key, value, description) VALUES
('cost_estimator_ev_registration_fee_pct', '0', 'Lệ phí trước bạ ô tô điện (%)'),
('cost_estimator_ice_registration_fee_pct', '10', 'Lệ phí trước bạ xe xăng (%)'),
('cost_estimator_interest_rate', '8.5', 'Lãi suất trả góp mặc định (%/năm)'),
('cost_estimator_license_plate_fee', '20000000', 'Phí cấp biển số tại HN/HCM (VND)'),
('cost_estimator_road_maintenance_fee', '1560000', 'Phí bảo trì đường bộ 1 năm (VND)'),
('cost_estimator_ev_charging_cost_avg', '3858', 'Đơn giá sạc điện trung bình (VND/kWh)');

-- ==========================================
-- 2. CATEGORIES
-- ==========================================
-- We will use hardcoded UUIDs to make relationships predictable in this seed script.

-- Product Categories (Vehicles)
INSERT INTO public.product_categories (id, name, slug) VALUES
('c0000000-0000-0000-0000-000000000001', 'Ô tô điện', 'o-to-dien'),
('c0000000-0000-0000-0000-000000000002', 'Xe máy điện', 'xe-may-dien');

-- Accessory Categories
INSERT INTO public.accessory_categories (id, name, slug) VALUES
('a0000000-0000-0000-0000-000000000001', 'Sạc pin & Nguồn', 'sac-pin-nguon'),
('a0000000-0000-0000-0000-000000000002', 'Nội thất & Tiện nghi', 'noi-that-tien-nghi'),
('a0000000-0000-0000-0000-000000000003', 'Bảo vệ & Ngoại thất', 'bao-ve-ngoai-that');

-- ==========================================
-- 3. PRODUCTS (Vehicles)
-- ==========================================

-- VF 8
INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url, is_featured) VALUES
('p0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'vehicle', 'VinFast VF 8', 'vinfast-vf-8', 'VF8', 1090000000, true, 'https://storage.googleapis.com/fastlane-assets/vf8.jpg', true);

INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, top_speed_kmh, acceleration_0_100, drive_type, seat_count, warranty_years) VALUES
('v0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'car', 400, 200, 5.5, 'AWD', 5, 10);

INSERT INTO public.battery_information (vehicle_model_id, capacity_kwh, fast_charging_time) VALUES
('v0000000-0000-0000-0000-000000000001', 82.0, '24 phút (10-70%)');

INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES
('var00000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'VF8-ECO-BLK', 'Eco', 'Đen', 1090000000),
('var00000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000001', 'VF8-PLUS-WHT', 'Plus', 'Trắng', 1270000000);

-- VF 9
INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url, is_featured) VALUES
('p0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'vehicle', 'VinFast VF 9', 'vinfast-vf-9', 'VF9', 1490000000, true, 'https://storage.googleapis.com/fastlane-assets/vf9.jpg', true);

INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, seat_count, warranty_years) VALUES
('v0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000002', 'car', 423, 7, 10);

INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES
('var00000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000002', 'VF9-PLUS-SLV', 'Plus', 'Bạc', 1676000000);

-- VF 7
INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url, is_featured) VALUES
('p0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'vehicle', 'VinFast VF 7', 'vinfast-vf-7', 'VF7', 850000000, true, 'https://storage.googleapis.com/fastlane-assets/vf7.jpg', true);

INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, seat_count) VALUES
('v0000000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000003', 'car', 431, 5);

INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES
('var00000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000003', 'VF7-BASE-BLU', 'Base', 'Xanh', 850000000);

-- VF 6
INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url) VALUES
('p0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'vehicle', 'VinFast VF 6', 'vinfast-vf-6', 'VF6', 675000000, true, 'https://storage.googleapis.com/fastlane-assets/vf6.jpg');

INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, seat_count) VALUES
('v0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000004', 'car', 399, 5);

INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES
('var00000-0000-0000-0000-000000000005', 'p0000000-0000-0000-0000-000000000004', 'VF6-PLUS-RED', 'Plus', 'Đỏ', 765000000);

-- VF 5
INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url) VALUES
('p0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'vehicle', 'VinFast VF 5 Plus', 'vinfast-vf-5', 'VF5', 468000000, true, 'https://storage.googleapis.com/fastlane-assets/vf5.jpg');

INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, seat_count) VALUES
('v0000000-0000-0000-0000-000000000005', 'p0000000-0000-0000-0000-000000000005', 'car', 326, 5);

INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES
('var00000-0000-0000-0000-000000000006', 'p0000000-0000-0000-0000-000000000005', 'VF5-PLUS-ORG', 'Plus', 'Cam', 468000000);

-- ==========================================
-- 4. PRODUCTS (Accessories - using DO block to generate 15 accessories)
-- ==========================================
DO $$
DECLARE
    i INTEGER;
    acc_id UUID;
    acc_sku VARCHAR;
BEGIN
    FOR i IN 1..15 LOOP
        acc_id := gen_random_uuid();
        acc_sku := 'ACC-' || lpad(i::text, 4, '0');
        
        INSERT INTO public.products (id, product_type, name, slug, sku, base_price, status, thumbnail_url)
        VALUES (
            acc_id, 
            'accessory', 
            'Phụ kiện Fastlane ' || i, 
            'phu-kien-fastlane-' || i, 
            acc_sku, 
            (i * 150000), 
            true, 
            'https://storage.googleapis.com/fastlane-assets/acc.jpg'
        );
        
        -- Default variant for accessory
        INSERT INTO public.vehicle_variants (product_id, sku, trim, list_price)
        VALUES (acc_id, acc_sku || '-DEF', 'Standard', (i * 150000));
        
        -- Inventory for accessory
        INSERT INTO public.inventory (product_id, available_quantity)
        VALUES (acc_id, 100);
    END LOOP;
END $$;

-- ==========================================
-- 5. INVENTORY FOR VEHICLES
-- ==========================================
INSERT INTO public.inventory (product_id, variant_id, available_quantity, reserved_quantity) VALUES
('p0000000-0000-0000-0000-000000000001', 'var00000-0000-0000-0000-000000000001', 10, 2),
('p0000000-0000-0000-0000-000000000001', 'var00000-0000-0000-0000-000000000002', 5, 1),
('p0000000-0000-0000-0000-000000000002', 'var00000-0000-0000-0000-000000000003', 2, 0),
('p0000000-0000-0000-0000-000000000003', 'var00000-0000-0000-0000-000000000004', 15, 3),
('p0000000-0000-0000-0000-000000000004', 'var00000-0000-0000-0000-000000000005', 0, 0), -- Out of stock
('p0000000-0000-0000-0000-000000000005', 'var00000-0000-0000-0000-000000000006', 20, 5);

-- ==========================================
-- 6. PROMOTIONS
-- ==========================================
INSERT INTO public.promotions (id, code, discount_type, discount_value, starts_at, usage_limit) VALUES
('pro00000-0000-0000-0000-000000000001', 'WELCOME2026', 'percentage', 5.00, '2026-01-01', 1000),
('pro00000-0000-0000-0000-000000000002', 'TET2026', 'fixed_amount', 10000000, '2026-01-01', 500);

-- ==========================================
-- 7. CUSTOMERS & ORDERS (Mock Data via DO block)
-- ==========================================
DO $$
DECLARE
    cust1_id UUID := gen_random_uuid();
    cust2_id UUID := gen_random_uuid();
BEGIN
    -- Insert 2 customers
    INSERT INTO public.customers (id, email, full_name, phone_number) VALUES
    (cust1_id, 'nguyen.van.a@example.com', 'Nguyễn Văn A', '0901234567'),
    (cust2_id, 'tran.thi.b@example.com', 'Trần Thị B', '0912345678');
    
    -- Insert Address
    INSERT INTO public.customer_addresses (customer_id, recipient_name, phone_number, line1) VALUES
    (cust1_id, 'Nguyễn Văn A', '0901234567', 'Số 1 Đường Vườn Lài, Tân Phú, TP.HCM');

    -- Insert Order for Customer 1 (VF 8)
    -- We can trigger generate_order_number automatically
    INSERT INTO public.orders (id, customer_id, status, payment_status, subtotal, grand_total, shipping_address) VALUES
    ('ord00000-0000-0000-0000-000000000001', cust1_id, 'Completed', 'Paid', 1090000000, 1090000000, '{"line1": "TP.HCM"}');
    
    INSERT INTO public.order_items (order_id, product_id, variant_id, product_name, sku, quantity, unit_list_price, unit_price, line_total) VALUES
    ('ord00000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'var00000-0000-0000-0000-000000000001', 'VinFast VF 8', 'VF8-ECO-BLK', 1, 1090000000, 1090000000, 1090000000);

END $$;
