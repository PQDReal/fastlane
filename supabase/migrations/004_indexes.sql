-- Migration 004: Indexes
-- Creates B-Tree indexes for frequently queried columns to improve read performance.

-- ==========================================
-- PROFILES & CUSTOMERS
-- ==========================================

CREATE INDEX idx_profiles_role ON public.profiles(role_id);
CREATE INDEX idx_customers_profile ON public.customers(profile_id);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_phone ON public.customers(phone_number);
CREATE INDEX idx_customer_addresses_customer ON public.customer_addresses(customer_id);

-- ==========================================
-- CATEGORIES & PRODUCTS
-- ==========================================

CREATE INDEX idx_product_categories_slug ON public.product_categories(slug);
CREATE INDEX idx_accessory_categories_slug ON public.accessory_categories(slug);

CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_slug ON public.products(slug);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_type ON public.products(product_type);
CREATE INDEX idx_products_status ON public.products(status);

CREATE INDEX idx_product_images_product ON public.product_images(product_id);
CREATE INDEX idx_product_specifications_product ON public.product_specifications(product_id);

CREATE INDEX idx_vehicle_models_product ON public.vehicle_models(product_id);
CREATE INDEX idx_vehicle_variants_product ON public.vehicle_variants(product_id);
CREATE INDEX idx_vehicle_variants_sku ON public.vehicle_variants(sku);

-- ==========================================
-- INVENTORY
-- ==========================================

CREATE INDEX idx_inventory_product ON public.inventory(product_id);
CREATE INDEX idx_inventory_variant ON public.inventory(variant_id);
CREATE INDEX idx_inventory_status ON public.inventory(status);
CREATE INDEX idx_inventory_tx_inventory ON public.inventory_transactions(inventory_id);

-- ==========================================
-- ORDERS
-- ==========================================

CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id);

-- ==========================================
-- PROMOTIONS & BOOKINGS
-- ==========================================

CREATE INDEX idx_promotions_code ON public.promotions(code);
CREATE INDEX idx_promotions_dates ON public.promotions(starts_at, ends_at);

CREATE INDEX idx_test_drives_customer ON public.test_drive_bookings(customer_id);
CREATE INDEX idx_test_drives_date ON public.test_drive_bookings(preferred_date);

-- ==========================================
-- CARTS & WISHLIST
-- ==========================================

CREATE INDEX idx_carts_customer ON public.carts(customer_id);
CREATE INDEX idx_carts_session ON public.carts(session_id);
CREATE INDEX idx_wishlist_customer ON public.wishlist(customer_id);
