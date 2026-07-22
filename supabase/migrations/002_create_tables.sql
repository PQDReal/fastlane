-- Migration 002: Create Tables
-- Defines all core tables with UUIDs, timestamps, and comments.

-- ==========================================
-- AUTHENTICATION & PROFILES
-- ==========================================

-- System roles (admin, customer)
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name public.user_role NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User profiles extending Supabase auth.users
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, -- References auth.users.id
    role_id UUID,
    full_name VARCHAR(120),
    phone_number VARCHAR(15),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- CUSTOMERS
-- ==========================================

-- Customer profiles and aggregated data
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE, -- Linked to profile if registered, null if guest
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    phone_number VARCHAR(15),
    status public.customer_status NOT NULL DEFAULT 'Active',
    total_spending DECIMAL(14, 2) NOT NULL DEFAULT 0,
    last_purchase_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Customer address book
CREATE TABLE public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    recipient_name VARCHAR(120) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    line1 VARCHAR(255) NOT NULL,
    line2 VARCHAR(255),
    commune_code VARCHAR(20),
    commune_name VARCHAR(120),
    province_code VARCHAR(20),
    province_name VARCHAR(120),
    country_code VARCHAR(2) NOT NULL DEFAULT 'VN',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- CATEGORIES
-- ==========================================

-- Master product categories (e.g., Electric Cars, E-Scooters)
CREATE TABLE public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accessory specific categories
CREATE TABLE public.accessory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_category_id UUID,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- PRODUCTS & VEHICLES
-- ==========================================

-- Core product information (Vehicles and Accessories)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID,
    product_type public.product_type NOT NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    sku VARCHAR(80) NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    brand VARCHAR(120) DEFAULT 'VinFast',
    status BOOLEAN NOT NULL DEFAULT false, -- Maps to is_active
    thumbnail_url TEXT,
    base_price DECIMAL(14, 2) NOT NULL,
    discount_price DECIMAL(14, 2),
    weight DECIMAL(10, 2),
    dimensions VARCHAR(100),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Product image gallery
CREATE TABLE public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    url TEXT NOT NULL,
    alt_text VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_thumbnail BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Key-value technical specifications
CREATE TABLE public.product_specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    value VARCHAR(500) NOT NULL,
    unit VARCHAR(40),
    spec_group VARCHAR(120),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vehicle specific attributes
CREATE TABLE public.vehicle_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    vehicle_type public.vehicle_type NOT NULL DEFAULT 'car',
    range_km INTEGER,
    top_speed_kmh INTEGER,
    acceleration_0_100 DECIMAL(4,1),
    drive_type VARCHAR(50),
    seat_count INTEGER,
    warranty_years INTEGER,
    safety_features TEXT,
    adas_features TEXT,
    infotainment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Battery and charging specs
CREATE TABLE public.battery_information (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_model_id UUID NOT NULL,
    capacity_kwh DECIMAL(6,2),
    charging_time_standard VARCHAR(100),
    fast_charging_time VARCHAR(100),
    battery_type VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SKUs representing specific Trims and Colors
CREATE TABLE public.vehicle_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    sku VARCHAR(80) NOT NULL,
    trim VARCHAR(50),
    color VARCHAR(50),
    list_price DECIMAL(14, 2) NOT NULL,
    sale_price DECIMAL(14, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==========================================
-- INVENTORY
-- ==========================================

-- Showroom single-location stock management
CREATE TABLE public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    variant_id UUID,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    version INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Out of Stock',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log for stock movements
CREATE TABLE public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL,
    transaction_type public.inventory_transaction_type NOT NULL,
    quantity_changed INTEGER NOT NULL,
    reference_id UUID,
    note VARCHAR(500),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- ORDERS
-- ==========================================

-- Customer orders
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(40) NOT NULL,
    customer_id UUID NOT NULL,
    status public.order_status NOT NULL DEFAULT 'Created',
    payment_status public.payment_status NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0,
    discount_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    shipping_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'VND',
    note VARCHAR(500),
    estimated_delivery_date TIMESTAMPTZ,
    shipping_address JSONB NOT NULL,
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Order line items
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(80) NOT NULL,
    variant_attributes JSONB,
    quantity INTEGER NOT NULL,
    unit_list_price DECIMAL(14, 2) NOT NULL,
    unit_sale_price DECIMAL(14, 2),
    unit_price DECIMAL(14, 2) NOT NULL,
    line_total DECIMAL(14, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- PROMOTIONS
-- ==========================================

-- Discount codes and vouchers
CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL,
    discount_type public.promotion_type NOT NULL,
    discount_value DECIMAL(14, 2) NOT NULL,
    minimum_order_amount DECIMAL(14, 2) DEFAULT 0,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mapping for product-specific promotions
CREATE TABLE public.promotion_products (
    promotion_id UUID NOT NULL,
    product_id UUID NOT NULL,
    PRIMARY KEY (promotion_id, product_id)
);

-- ==========================================
-- SHOPPING CART & WISHLIST
-- ==========================================

-- Temporary cart data
CREATE TABLE public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID,
    session_id VARCHAR(100),
    version INTEGER NOT NULL DEFAULT 0,
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0,
    discount_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0,
    promotion_id UUID,
    priced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved items
CREATE TABLE public.wishlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL,
    product_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- TEST DRIVE BOOKINGS
-- ==========================================

CREATE TABLE public.test_drive_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID,
    full_name VARCHAR(120) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    email VARCHAR(255),
    vehicle_model_id UUID NOT NULL,
    preferred_date DATE NOT NULL,
    preferred_time VARCHAR(50),
    status public.booking_status NOT NULL DEFAULT 'Pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ==========================================
-- COST ESTIMATOR / SYSTEM SETTINGS
-- ==========================================

-- Global configuration storage
CREATE TABLE public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- AUDIT & NOTIFICATIONS
-- ==========================================

CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    link VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
