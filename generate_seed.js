const fs = require('fs');

const dataPath = 'C:\\\\Users\\\\HungNguyen\\\\Downloads\\\\vinfast-products-20260722T072944Z-1-001\\\\vinfast-products\\\\master_products.json';
const sqlPath = 'C:\\\\Users\\\\HungNguyen\\\\Documents\\\\VSF\\\\fastlane\\\\supabase\\\\migrations\\\\006_seed_data.sql';

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function extractPrice(priceStr) {
  if (!priceStr) return 0;
  const match = priceStr.match(/(\d{1,3}(?:\.\d{3})*)/);
  if (match) {
    return parseInt(match[1].replace(/\./g, ''), 10);
  }
  return 0;
}

function generateId(prefix, index) {
  const padded = String(index).padStart(11, '0');
  return prefix + "000-0000-0000-0000-" + padded;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

let sql = `-- Migration 006: Seed Data
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
INSERT INTO public.product_categories (id, name, slug) VALUES
('c0000000-0000-0000-0000-000000000001', 'Ô tô điện', 'o-to-dien'),
('c0000000-0000-0000-0000-000000000002', 'Xe máy điện', 'xe-may-dien');

INSERT INTO public.accessory_categories (id, name, slug) VALUES
('a0000000-0000-0000-0000-000000000001', 'Sạc pin & Nguồn', 'sac-pin-nguon'),
('a0000000-0000-0000-0000-000000000002', 'Nội thất & Tiện nghi', 'noi-that-tien-nghi'),
('a0000000-0000-0000-0000-000000000003', 'Bảo vệ & Ngoại thất', 'bao-ve-ngoai-that');

-- ==========================================
-- 3. PRODUCTS (Vehicles)
-- ==========================================
`;

let pIndex = 1;
let vIndex = 1;
let varIndex = 1;

let inventorySql = `-- ==========================================
-- 5. INVENTORY
-- ==========================================
INSERT INTO public.inventory (product_id, variant_id, available_quantity, reserved_quantity) VALUES
`;
const inventoryValues = [];

function processItem(item, catId, type) {
  const pId = generateId('p', pIndex++);
  const vId = generateId('v', vIndex++);
  
  const basePrice = extractPrice(item.price);
  const slug = slugify(item.name);
  const sku = slug.toUpperCase();
  
  const thumbUrl = 'https://storage.googleapis.com/fastlane-assets/' + slug + '.jpg';
  
  sql += '\\n-- ' + item.name + '\\n';
  sql += "INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url, is_featured) VALUES\\n";
  sql += "('" + pId + "', '" + catId + "', 'vehicle', '" + item.name + "', '" + slug + "', '" + sku + "', " + basePrice + ", true, '" + thumbUrl + "', true);\\n\\n";
  
  sql += "INSERT INTO public.vehicle_models (id, product_id, vehicle_type, range_km, seat_count, warranty_years) VALUES\\n";
  sql += "('" + vId + "', '" + pId + "', '" + (type === 'car' ? 'car' : 'scooter') + "', 0, " + (type === 'car' ? 5 : 2) + ", " + (type === 'car' ? 10 : 3) + ");\\n\\n";

  let colors = item.colors && item.colors.length > 0 ? item.colors : ['Mặc định'];
  let variantsStr = [];
  
  item.variants.forEach((vStr, i) => {
    let parts = vStr.split(':');
    let trimPart = parts[0];
    let pricePart = parts[1];
    let trim = (trimPart || ("Variant " + (i+1))).trim();
    if (trim.length > 50) trim = trim.substring(0, 50);
    
    let listPrice = pricePart ? extractPrice(pricePart) : basePrice;
    if (listPrice === 0) listPrice = basePrice;
    
    colors.forEach((color, cIdx) => {
      const varId = generateId('a', varIndex++);
      const varSku = sku + "-" + i + "-" + cIdx;
      let safeColor = color.length > 50 ? color.substring(0, 50) : color;
      
      variantsStr.push("('" + varId + "', '" + pId + "', '" + varSku + "', '" + trim + "', '" + safeColor + "', " + listPrice + ")");
      inventoryValues.push("('" + pId + "', '" + varId + "', " + (Math.floor(Math.random() * 20) + 5) + ", 0)");
    });
  });

  if (variantsStr.length > 0) {
    sql += "INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES\\n";
    sql += variantsStr.join(',\\n') + ';\\n';
  } else {
    const varId = generateId('a', varIndex++);
    variantsStr.push("('" + varId + "', '" + pId + "', '" + sku + "-DEF', 'Standard', 'Mặc định', " + basePrice + ")");
    inventoryValues.push("('" + pId + "', '" + varId + "', 10, 0)");
    sql += "INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES\\n";
    sql += variantsStr.join(',\\n') + ';\\n';
  }
}

if (data.cars) {
  data.cars.forEach(car => processItem(car, 'c0000000-0000-0000-0000-000000000001', 'car'));
}
if (data.motorbikes) {
  data.motorbikes.forEach(mb => processItem(mb, 'c0000000-0000-0000-0000-000000000002', 'scooter'));
}

sql += `
-- ==========================================
-- 4. PRODUCTS (Accessories)
-- ==========================================
`;

function processAccessory(item, catId) {
  const pId = generateId('p', pIndex++);
  const basePrice = extractPrice(item.price);
  
  // Clean up name from any quotes
  let safeName = item.name.replace(/'/g, "''");
  const slug = slugify(item.name);
  let sku = item.pid || slug.toUpperCase();
  if (sku.length > 80) sku = sku.substring(0, 80);
  
  let thumbUrl = item.images && item.images.length > 0 ? item.images[0] : 'https://storage.googleapis.com/fastlane-assets/acc.jpg';
  
  sql += '\\n-- ' + safeName + '\\n';
  sql += "INSERT INTO public.products (id, category_id, product_type, name, slug, sku, base_price, status, thumbnail_url, is_featured) VALUES\\n";
  sql += "('" + pId + "', '" + catId + "', 'accessory', '" + safeName + "', '" + slug + "', '" + sku + "', " + basePrice + ", true, '" + thumbUrl + "', false);\\n\\n";
  
  let colors = item.colors && item.colors.length > 0 ? item.colors : ['Mặc định'];
  let variantsStr = [];
  
  colors.forEach((color, cIdx) => {
      const varId = generateId('a', varIndex++);
      const varSku = sku + "-" + cIdx;
      let safeColor = color.length > 50 ? color.substring(0, 50) : color;
      
      variantsStr.push("('" + varId + "', '" + pId + "', '" + varSku + "', 'Standard', '" + safeColor + "', " + basePrice + ")");
      inventoryValues.push("('" + pId + "', '" + varId + "', " + (Math.floor(Math.random() * 50) + 10) + ", 0)");
  });

  sql += "INSERT INTO public.vehicle_variants (id, product_id, sku, trim, color, list_price) VALUES\\n";
  sql += variantsStr.join(',\\n') + ';\\n';
}

if (data.accessories) {
  // Use a generic accessory category ID
  data.accessories.forEach(acc => processAccessory(acc, 'a0000000-0000-0000-0000-000000000001'));
}

inventorySql += inventoryValues.join(',\\n') + ';\\n';
sql += '\\n' + inventorySql;

sql += `
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

    -- Insert Order for Customer 1 (First Car)
    -- We can trigger generate_order_number automatically
    INSERT INTO public.orders (id, customer_id, status, payment_status, subtotal, grand_total, shipping_address) VALUES
    ('ord00000-0000-0000-0000-000000000001', cust1_id, 'Completed', 'Paid', 1090000000, 1090000000, '{"line1": "TP.HCM"}');
    
    -- Insert an item using the first generated car product
    INSERT INTO public.order_items (order_id, product_id, variant_id, product_name, sku, quantity, unit_list_price, unit_price, line_total) VALUES
    ('ord00000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'VinFast VF 2', 'VF-2-0-0', 1, 1090000000, 1090000000, 1090000000);

END $$;
`;

fs.writeFileSync(sqlPath, sql);
console.log('Successfully generated ' + sqlPath);
