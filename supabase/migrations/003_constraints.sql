-- Migration 003: Constraints
-- Adds Foreign Keys, Unique constraints, and Check constraints.

-- ==========================================
-- PROFILES & AUTHENTICATION
-- ==========================================

-- Supabase auth.users relationship
-- Note: Assuming auth.users table exists in Supabase
-- ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_auth_users FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles 
    ADD CONSTRAINT fk_profiles_roles FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL;

-- ==========================================
-- CUSTOMERS
-- ==========================================

ALTER TABLE public.customers 
    ADD CONSTRAINT fk_customers_profiles FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT uq_customers_email UNIQUE (email),
    ADD CONSTRAINT chk_customers_spending CHECK (total_spending >= 0);

ALTER TABLE public.customer_addresses 
    ADD CONSTRAINT fk_customer_addresses_customers FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- ==========================================
-- CATEGORIES
-- ==========================================

ALTER TABLE public.product_categories 
    ADD CONSTRAINT uq_product_categories_slug UNIQUE (slug);

ALTER TABLE public.accessory_categories 
    ADD CONSTRAINT fk_accessory_categories_parent FOREIGN KEY (parent_category_id) REFERENCES public.accessory_categories(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_accessory_categories_slug UNIQUE (slug);

-- ==========================================
-- PRODUCTS & VEHICLES
-- ==========================================

ALTER TABLE public.products 
    ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL,
    ADD CONSTRAINT uq_products_slug UNIQUE (slug),
    ADD CONSTRAINT uq_products_sku UNIQUE (sku),
    ADD CONSTRAINT chk_products_base_price CHECK (base_price >= 0),
    ADD CONSTRAINT chk_products_discount_price CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price < base_price));

ALTER TABLE public.product_images 
    ADD CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.product_specifications 
    ADD CONSTRAINT fk_product_specifications_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.vehicle_models 
    ADD CONSTRAINT fk_vehicle_models_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_vehicle_models_product UNIQUE (product_id);

ALTER TABLE public.battery_information 
    ADD CONSTRAINT fk_battery_information_vehicle FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_battery_info_vehicle UNIQUE (vehicle_model_id);

ALTER TABLE public.vehicle_variants 
    ADD CONSTRAINT fk_vehicle_variants_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_vehicle_variants_sku UNIQUE (sku),
    ADD CONSTRAINT chk_variants_list_price CHECK (list_price >= 0),
    ADD CONSTRAINT chk_variants_sale_price CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price < list_price));

-- ==========================================
-- INVENTORY
-- ==========================================

ALTER TABLE public.inventory 
    ADD CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_inventory_variant FOREIGN KEY (variant_id) REFERENCES public.vehicle_variants(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_inventory_product_variant UNIQUE NULLS NOT DISTINCT (product_id, variant_id),
    ADD CONSTRAINT chk_inventory_qty CHECK (available_quantity >= 0),
    ADD CONSTRAINT chk_inventory_reserved CHECK (reserved_quantity >= 0);

ALTER TABLE public.inventory_transactions 
    ADD CONSTRAINT fk_inventory_transactions_inventory FOREIGN KEY (inventory_id) REFERENCES public.inventory(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_inventory_transactions_user FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ==========================================
-- ORDERS
-- ==========================================

ALTER TABLE public.orders 
    ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
    ADD CONSTRAINT uq_orders_number UNIQUE (order_number),
    ADD CONSTRAINT chk_orders_subtotal CHECK (subtotal >= 0),
    ADD CONSTRAINT chk_orders_grand_total CHECK (grand_total >= 0);

ALTER TABLE public.order_items 
    ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES public.vehicle_variants(id) ON DELETE RESTRICT,
    ADD CONSTRAINT chk_order_items_qty CHECK (quantity > 0),
    ADD CONSTRAINT chk_order_items_price CHECK (unit_price >= 0);

-- ==========================================
-- PROMOTIONS
-- ==========================================

ALTER TABLE public.promotions 
    ADD CONSTRAINT uq_promotions_code UNIQUE (code),
    ADD CONSTRAINT chk_promotions_discount CHECK (discount_value > 0),
    ADD CONSTRAINT chk_promotions_dates CHECK (ends_at IS NULL OR ends_at > starts_at);

ALTER TABLE public.promotion_products 
    ADD CONSTRAINT fk_promotion_products_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_promotion_products_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- ==========================================
-- SHOPPING CART & WISHLIST
-- ==========================================

ALTER TABLE public.carts 
    ADD CONSTRAINT fk_carts_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_carts_promotion FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL,
    ADD CONSTRAINT uq_carts_customer UNIQUE (customer_id);

ALTER TABLE public.cart_items 
    ADD CONSTRAINT fk_cart_items_cart FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_cart_items_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_cart_items_variant FOREIGN KEY (variant_id) REFERENCES public.vehicle_variants(id) ON DELETE CASCADE,
    ADD CONSTRAINT chk_cart_items_qty CHECK (quantity > 0);

ALTER TABLE public.wishlist 
    ADD CONSTRAINT fk_wishlist_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.wishlist_items 
    ADD CONSTRAINT fk_wishlist_items_wishlist FOREIGN KEY (wishlist_id) REFERENCES public.wishlist(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_wishlist_items_product FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_wishlist_product UNIQUE (wishlist_id, product_id);

-- ==========================================
-- TEST DRIVE BOOKINGS
-- ==========================================

ALTER TABLE public.test_drive_bookings 
    ADD CONSTRAINT fk_test_drives_customer FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_test_drives_vehicle FOREIGN KEY (vehicle_model_id) REFERENCES public.vehicle_models(id) ON DELETE CASCADE;

-- ==========================================
-- AUDIT & NOTIFICATIONS
-- ==========================================

ALTER TABLE public.activity_logs 
    ADD CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications 
    ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
