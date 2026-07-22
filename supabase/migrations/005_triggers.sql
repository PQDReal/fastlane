-- Migration 005: Triggers
-- Automates updated_at timestamps, order number generation, and inventory synchronization.

-- ==========================================
-- 1. AUTOMATIC UPDATED_AT TIMESTAMP
-- ==========================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_customer_addresses_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_accessory_categories_updated_at BEFORE UPDATE ON public.accessory_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_product_specifications_updated_at BEFORE UPDATE ON public.product_specifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_vehicle_models_updated_at BEFORE UPDATE ON public.vehicle_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_battery_information_updated_at BEFORE UPDATE ON public.battery_information FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_vehicle_variants_updated_at BEFORE UPDATE ON public.vehicle_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_promotions_updated_at BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_carts_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_test_drive_bookings_updated_at BEFORE UPDATE ON public.test_drive_bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- 2. ORDER NUMBER GENERATION
-- ==========================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    date_prefix VARCHAR;
    seq_val INTEGER;
BEGIN
    -- Format: FLE-YYYYMMDD-XXXXX
    date_prefix := 'FLE-' || to_char(NOW(), 'YYYYMMDD') || '-';
    
    -- Create sequence if it doesn't exist for today (Note: using a global sequence for simplicity in Postgres)
    -- A true daily sequence would require a separate table, but for Supabase/Postgres we can rely on a simpler approach:
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 14) AS INTEGER)), 0) + 1 
    INTO seq_val
    FROM public.orders 
    WHERE order_number LIKE date_prefix || '%';
    
    NEW.order_number := date_prefix || lpad(seq_val::text, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_orders_generate_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION public.generate_order_number();

-- ==========================================
-- 3. INVENTORY SYNC ON ORDER CREATION
-- ==========================================
-- When an order item is added, reserve the inventory quantity.

CREATE OR REPLACE FUNCTION public.reserve_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.inventory
    SET reserved_quantity = reserved_quantity + NEW.quantity
    WHERE product_id = NEW.product_id 
      AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL));
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for product_id % and variant_id %', NEW.product_id, NEW.variant_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_order_items_reserve_inventory
    AFTER INSERT ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.reserve_inventory_on_order();

-- ==========================================
-- 4. INVENTORY STATUS COMPUTATION
-- ==========================================
-- Automatically compute status based on available_quantity.

CREATE OR REPLACE FUNCTION public.compute_inventory_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.available_quantity <= 0 THEN
        NEW.status := 'Out of Stock';
    ELSIF NEW.available_quantity <= NEW.min_stock THEN
        NEW.status := 'Low Stock';
    ELSE
        NEW.status := 'In Stock';
    END IF;
    
    -- Increment version for optimistic locking
    IF OLD.available_quantity IS DISTINCT FROM NEW.available_quantity OR 
       OLD.reserved_quantity IS DISTINCT FROM NEW.reserved_quantity THEN
        NEW.version := OLD.version + 1;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_compute_status
    BEFORE INSERT OR UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.compute_inventory_status();
