# Kiến trúc Database FASTLANE

> Phần schema nền phản ánh Supabase Data API ngày 21/07/2026. Các thay đổi catalog mới hơn được định nghĩa tuần tự trong `migrations/003`–`011`; migration `010` xóa hai cột variant legacy và `011` bổ sung taxonomy normalized.

## 1. Tổng quan

- Database: PostgreSQL trên Supabase.
- ORM theo kiến trúc dự án: Prisma ORM.
- Mục đích: lưu catalog sản phẩm, biến thể, tồn kho, người dùng, giỏ hàng, khuyến mãi, đơn hàng và snapshot dòng hàng.
- Phạm vi hiện tại: 10 bảng trong schema `public`.

Chưa phát hiện `schema.prisma`, migration hoặc seed script trong workspace. Vì vậy metadata trực tiếp từ Supabase là nguồn sự thật. Cần xác nhận với Developer vị trí Prisma schema.

## 2. Quy tắc thiết kế

- **Tên bảng:** phần lớn là danh từ số nhiều dạng `snake_case`. Bảng `user` là ngoại lệ số ít; cần xác nhận với Developer.
- **Tên cột:** dùng `snake_case`; cột tham chiếu thường kết thúc bằng `_id`; dữ liệu chụp tại thời điểm đặt hàng dùng `_snapshot`.
- **UUID:** PK và FK dùng `uuid`. Các PK `id` thông thường mặc định `gen_random_uuid()`.
- **Foreign Key:** liên kết user, catalog, cart, promotion và order. `orders.source_cart_id` là UUID nhưng metadata không xác nhận FK.
- **Soft Delete:** không phát hiện `deleted_at` hoặc cờ soft-delete chuyên biệt. `is_active` chỉ chứng minh trạng thái kích hoạt.
- **Timestamp:** chủ yếu dùng `timestamptz`; `created_at` và `updated_at` thường mặc định `clock_timestamp()`.
- **Index:** chỉ xác nhận được index do Primary Key tạo. PostgREST không công bố đầy đủ index phụ.

## 3. ERD

Chỉ biểu diễn FK được metadata Supabase xác nhận.

~~~mermaid
erDiagram
    user ||--o{ carts : customer_id
    user ||--o{ orders : customer_id
    categories ||--o{ products : category_id
    products ||--o{ product_variants : product_id
    product_variants ||--o| inventory_items : variant_id
    carts ||--o{ cart_items : cart_id
    product_variants ||--o{ cart_items : variant_id
    promotions ||--o{ orders : promotion_id
    orders ||--o{ order_items : order_id
    product_variants ||--o{ order_items : variant_id
~~~

`orders.source_cart_id` chưa được vẽ vì metadata không xác nhận FK tới `carts.id`.

## 4. Danh sách bảng

“Null: Không” tương ứng `NOT NULL`. PK = Primary Key; FK = Foreign Key.

### user

**Mục đích:** Hồ sơ người dùng ứng dụng, ánh xạ Auth0 và vai trò nội bộ.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| auth0_subject | text | Không | — | Định danh Auth0 |
| email | text | Không | — | — |
| full_name | text | Không | — | — |
| role | app_role | Không | CUSTOMER | Enum |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`. FK: không có.
- Unique/index phụ: Cần xác nhận với Developer.
- Quan hệ: được nhiều carts và orders tham chiếu.

### categories

**Mục đích:** Danh mục phân loại sản phẩm.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| name | text | Không | — | — |
| slug | text | Không | — | — |
| description | text | Có | — | — |
| is_active | boolean | Không | true | Trạng thái kích hoạt |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`. FK: không có.
- Unique/index phụ: chưa xác nhận `slug` unique.
- Quan hệ: một category có nhiều products.

### products

**Mục đích:** Thông tin chung, mô tả, thông số, ảnh và dữ liệu tìm kiếm của sản phẩm.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| category_id | uuid | Không | — | FK → categories.id |
| name | text | Không | — | — |
| slug | text | Không | — | — |
| description | text | Có | — | — |
| specifications | jsonb | Không | — | Thông số linh hoạt |
| image_urls | jsonb | Không | — | Dữ liệu ảnh |
| search_vector | tsvector | Có | — | Tìm kiếm toàn văn |
| is_active | boolean | Không | true | Trạng thái kích hoạt |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`.
- FK: `category_id → categories.id`.
- Unique/index phụ: chưa xác nhận unique trên `slug` hoặc GIN/GiST trên `search_vector`.
- Quan hệ: thuộc một category; có nhiều product variants.

### product_variants

**Mục đích:** SKU, tùy chọn và giá của biến thể sản phẩm.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| product_id | uuid | Không | — | FK → products.id |
| sku | text | Không | — | — |
| name | text | Không | — | — |
| original_price | numeric | Không | — | — |
| sale_price | numeric | Có | — | — |
| option_signature | text | Có | — | Unique theo product trên active row khi khác null |
| deposit_amount | numeric | Có | — | Không âm |
| metadata | jsonb | Không | `{}` | Canonical published attributes/provenance |
| is_active | boolean | Không | true | Trạng thái kích hoạt |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`.
- FK: `product_id → products.id`.
- Unique/index phụ: chưa xác nhận `sku` unique.
- Quan hệ: thuộc product; được inventory, cart items và order items tham chiếu.
- `color` và `battery_option` là cột tương thích đã trống trên toàn bộ live data và được xóa bởi migration `010`; lựa chọn hiện nằm trong `product_option_*`.

### Catalog options, media và taxonomy normalized

- `product_option_groups`, `product_option_values` và `product_variant_option_values` là nguồn chuẩn cho lựa chọn variant; các composite FK bảo đảm variant/group/value cùng product.
- `product_media` lưu media theo product, variant hoặc option value; `products.image_urls` vẫn là cache tương thích trong rollout hiện tại.
- `vehicle_models` giữ định danh model xe độc lập product đang bán.
- `catalog_collections` giữ hierarchy taxonomy theo identity ổn định `(source_system, source_key)`, có `CATEGORY | MODEL | CAMPAIGN` và semantics `NONE | COLLECTION_MEMBERSHIP | VERIFIED_FITMENT`.
- `product_collection_memberships` nối nhiều-nhiều product/collection với provenance, primary flag, active state và `first_seen_at`/`last_seen_at`.
- Ba root row trong `categories` và `products.category_id` không đổi. Membership model từ Demandware không phải cam kết fitment kỹ thuật.
- Các bảng catalog normalized bật RLS; `anon`/`authenticated` chỉ SELECT active rows, mutation dành cho `service_role`.

### inventory_items

**Mục đích:** Số lượng tồn kho hiện tại của từng variant.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| variant_id | uuid | Không | — | PK, FK → product_variants.id |
| on_hand_quantity | integer | Không | 0 | Số lượng tồn |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `variant_id`.
- FK: `variant_id → product_variants.id`.
- Index phụ: chưa xác nhận.
- Quan hệ: tối đa một inventory item cho mỗi variant.

### promotions

**Mục đích:** Chương trình khuyến mãi và thời gian hiệu lực.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| code | text | Không | — | Mã khuyến mãi |
| name | text | Không | — | — |
| type | promotion_type | Không | — | PERCENT hoặc FIXED |
| value | numeric | Không | — | Giá trị giảm |
| starts_at | timestamptz | Không | — | — |
| ends_at | timestamptz | Không | — | — |
| is_active | boolean | Không | true | Trạng thái kích hoạt |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`. FK: không có.
- Unique/index phụ: chưa xác nhận `code` unique.
- Quan hệ: được nhiều orders tham chiếu.

### carts

**Mục đích:** Giỏ hàng của user và trạng thái vòng đời.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| customer_id | uuid | Không | — | FK → user.id |
| status | cart_status | Không | ACTIVE | Enum |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`.
- FK: `customer_id → user.id`.
- Unique/index phụ: Cần xác nhận với Developer.
- Quan hệ: thuộc user; chứa nhiều cart items.

### cart_items

**Mục đích:** Variant và số lượng trong một cart.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| cart_id | uuid | Không | — | PK ghép, FK → carts.id |
| variant_id | uuid | Không | — | PK ghép, FK → product_variants.id |
| quantity | integer | Không | 1 | — |

- PK ghép: `(cart_id, variant_id)`.
- FK: `cart_id → carts.id`; `variant_id → product_variants.id`.
- Index phụ: chưa xác nhận.
- Quan hệ: bảng nối cart–variant có thuộc tính quantity.

### orders

**Mục đích:** Đơn hàng, tổng tiền, giao hàng, idempotency, trạng thái và các mốc xử lý.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| order_number | text | Không | app_private.generate_order_number() | Mã đơn do DB sinh |
| customer_id | uuid | Không | — | FK → user.id |
| source_cart_id | uuid | Không | — | Chưa xác nhận FK |
| promotion_id | uuid | Có | — | FK → promotions.id |
| status | order_status | Không | PENDING | Enum |
| idempotency_key | text | Không | — | — |
| request_hash | text | Không | — | — |
| mock_payment_reference | text | Có | — | — |
| subtotal | numeric | Không | — | — |
| tax_amount | numeric | Không | 0 | — |
| battery_rental_fee | numeric | Không | 0 | — |
| discount_amount | numeric | Không | 0 | — |
| total_amount | numeric | Không | — | — |
| promotion_code_snapshot | text | Có | — | Snapshot promotion |
| recipient_name | text | Không | — | — |
| recipient_phone | text | Không | — | — |
| address_line1 | text | Không | — | — |
| ward | text | Có | — | — |
| district | text | Có | — | — |
| province | text | Không | — | — |
| cancellation_reason | text | Có | — | — |
| snapshot_finalized_at | timestamptz | Có | — | — |
| inventory_restored_at | timestamptz | Có | — | — |
| confirmed_at | timestamptz | Có | — | — |
| ready_at | timestamptz | Có | — | — |
| delivered_at | timestamptz | Có | — | — |
| cancelled_at | timestamptz | Có | — | — |
| created_at | timestamptz | Không | clock_timestamp() | — |
| updated_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`.
- FK: `customer_id → user.id`; `promotion_id → promotions.id`.
- `source_cart_id`: Cần xác nhận với Developer.
- Unique/index phụ: chưa xác nhận unique của `order_number` hoặc phạm vi unique của `idempotency_key`.
- Quan hệ: thuộc user; promotion tùy chọn; chứa nhiều order items.

### order_items

**Mục đích:** Dòng hàng và snapshot catalog tại thời điểm đặt hàng.

| Cột | Kiểu | Null | Mặc định | Constraint/Ghi chú |
|---|---|---|---|---|
| id | uuid | Không | gen_random_uuid() | PK |
| order_id | uuid | Không | — | FK → orders.id |
| variant_id | uuid | Không | — | FK → product_variants.id |
| sku_snapshot | text | Không | — | — |
| product_name_snapshot | text | Không | — | — |
| variant_name_snapshot | text | Không | — | — |
| unit_price | numeric | Không | — | — |
| quantity | integer | Không | 1 | — |
| line_subtotal | numeric | Không | — | — |
| assigned_vin | text | Có | — | — |
| created_at | timestamptz | Không | clock_timestamp() | — |

- PK: `id`.
- FK: `order_id → orders.id`; `variant_id → product_variants.id`.
- Unique/index phụ: Cần xác nhận với Developer.
- Quan hệ: thuộc order, tham chiếu variant và giữ snapshot tên/SKU.

## 5. Enum

### app_role

- `CUSTOMER`
- `ADMIN`

Dùng tại `user.role`; mặc định `CUSTOMER`.

### cart_status

- `ACTIVE`
- `CONVERTED`
- `ABANDONED`

Dùng tại `carts.status`; mặc định `ACTIVE`.

### order_status

- `PENDING`
- `CONFIRMED`
- `READY`
- `DELIVERED`
- `CANCELLED`

Dùng tại `orders.status`; mặc định `PENDING`.

### promotion_type

- `PERCENT`
- `FIXED`

Dùng tại `promotions.type`.

## 6. Business Rule suy ra từ Database

- Một product bắt buộc thuộc một category.
- Một variant bắt buộc thuộc một product.
- Mỗi variant có tối đa một inventory item vì `variant_id` là PK.
- Một cart bắt buộc thuộc một user.
- Một cặp cart–variant chỉ xuất hiện tối đa một lần do PK ghép.
- Một cart có thể chứa nhiều variant và ngược lại.
- Một order bắt buộc thuộc một user.
- Một order có thể không có promotion vì `promotion_id` nullable.
- Một order có nhiều order item; mỗi item bắt buộc thuộc order và tham chiếu variant.
- Order item giữ snapshot SKU, tên product và tên variant.
- Role, cart status, order status và promotion type bị giới hạn bởi enum.

Không thể khẳng định từ metadata hiện có rằng giá/số lượng không âm, sale price nhỏ hơn giá gốc, ngày kết thúc promotion sau ngày bắt đầu, hoặc chuyển trạng thái order bị giới hạn. Chỉ xem là constraint DB khi xác nhận được Check Constraint/trigger.

## 7. Index

### Index xác nhận được

| Bảng | Cột | Mục đích |
|---|---|---|
| user | id | PK; định danh user |
| categories | id | PK; định danh category |
| products | id | PK; định danh product |
| product_variants | id | PK; định danh variant |
| inventory_items | variant_id | PK; lookup inventory, bảo đảm tối đa một-một |
| promotions | id | PK; định danh promotion |
| carts | id | PK; định danh cart |
| cart_items | cart_id, variant_id | PK ghép; chống trùng variant trong cart |
| orders | id | PK; định danh order |
| order_items | id | PK; định danh order item |

### Index chưa xác nhận

Cần Developer cung cấp quyền đọc `pg_catalog.pg_indexes`, Prisma schema hoặc migration để xác nhận index phụ, đặc biệt trên FK, slug, SKU, promotion code, order number, idempotency key, `products.search_vector`, trạng thái và `created_at`.

## 8. Constraint

### Primary Key

- `user(id)`
- `categories(id)`
- `products(id)`
- `product_variants(id)`
- `inventory_items(variant_id)`
- `promotions(id)`
- `carts(id)`
- `cart_items(cart_id, variant_id)`
- `orders(id)`
- `order_items(id)`

### Foreign Key

- `products.category_id → categories.id`
- `product_variants.product_id → products.id`
- `inventory_items.variant_id → product_variants.id`
- `carts.customer_id → user.id`
- `cart_items.cart_id → carts.id`
- `cart_items.variant_id → product_variants.id`
- `orders.customer_id → user.id`
- `orders.promotion_id → promotions.id`
- `order_items.order_id → orders.id`
- `order_items.variant_id → product_variants.id`

### Unique Constraint

Chỉ tính duy nhất của PK được xác nhận. Không tự suy luận email, Auth0 subject, slug, SKU, promotion code, order number hoặc idempotency key là unique. Cần xác nhận với Developer.

### Check Constraint

Enum giới hạn role, cart status, order status và promotion type. Không có biểu thức Check Constraint khác được metadata công bố. Cần xác nhận với Developer.

### NOT NULL

Các cột ghi “Null: Không” ở mục 4 là `NOT NULL`; “Có” cho phép `NULL`.

### Cascade

Metadata không công bố `ON DELETE`/`ON UPDATE` như CASCADE, RESTRICT, SET NULL hoặc NO ACTION. Toàn bộ hành vi cascade cần xác nhận với Developer.

## 9. Seed Data

- Không phát hiện seed script, Prisma seed, migration chứa dữ liệu mặc định hoặc fixture.
- Không đủ bằng chứng để phân loại dữ liệu hiện có trên Supabase là seed hay dữ liệu vận hành.
- Chưa có seed mặc định nào được liệt kê. Cần xác nhận với Developer nếu seed nằm ở repository/pipeline khác.

## 10. Checklist

- [x] Bảng: đủ 10 bảng của schema `public`.
- [x] Quan hệ: FK đã xác nhận và Mermaid ERD.
- [x] Index: index PK đã xác nhận; index phụ đánh dấu cần xác nhận.
- [x] Constraint: PK, FK, NOT NULL, enum; Unique/Check/Cascade chưa công bố đã ghi rõ.
- [x] Enum: đủ app_role, cart_status, order_status, promotion_type.
- [x] Timestamp: kiểu, nullable và default đã ghi.
- [x] Soft Delete: không phát hiện cơ chế chuyên biệt; đã phân biệt với `is_active`.

## Đề xuất cải thiện

Chỉ là đề xuất; không có thay đổi database nào được thực hiện.

1. Đưa Prisma schema, migration và seed vào nguồn quản lý phiên bản.
2. Xác nhận hoặc bổ sung FK cho `orders.source_cart_id` nếu tham chiếu `carts.id`.
3. Rà soát tên bảng `user` để nhất quán và tránh tên dễ xung đột.
4. Xác nhận Unique Constraint cho Auth0 subject, email, slug, SKU, promotion code, order number và idempotency key.
5. Xác nhận Check Constraint cho tiền, tồn kho, quantity, thời hạn promotion và quan hệ giá.
6. Xác nhận index cho FK, trường lọc/sắp xếp và `products.search_vector`.
7. Ghi rõ chính sách ON DELETE/ON UPDATE của từng FK.
8. Nếu cần soft delete, chuẩn hóa cơ chế thay vì suy diễn từ `is_active`.
9. Đồng bộ enum/trạng thái giữa database và API contract vì tên trạng thái hiện chưa hoàn toàn trùng nhau.
