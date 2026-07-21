# ARCHITECTURE.md

# Kiến trúc hệ thống FASTLANE

## 1. Tổng quan

FASTLANE là nền tảng thương mại điện tử B2C chuyên bán các sản phẩm VinFast.

Sản phẩm bao gồm:

- Ô tô điện
- Xe máy điện
- Phụ kiện chính hãng

Hệ thống gồm 3 thành phần chính:

1. Customer Storefront
2. Admin Dashboard
3. REST API Backend

Ngoài ra còn tích hợp:

- Auth0 Authentication
- PostgreSQL
- Redis
- AI Chatbot
- Docker Compose

---

# 2. Tech Stack

## Frontend

- Next.js 15 (App Router)
- React 19
- TypeScript
- TailwindCSS
- shadcn/ui
- Axios
- React Hook Form
- Zod

---

## Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- Swagger
- Auth0 JWT

---

## Infrastructure

Docker Compose

Bao gồm:

- Frontend
- Backend
- PostgreSQL
- Redis

---

# 3. Kiến trúc tổng thể

```
Khách hàng
        │
        ▼
Frontend (Next.js)
        │
 REST API
        │
        ▼
Backend (NestJS)
        │
 ┌──────┴────────┐
 ▼               ▼
PostgreSQL     Redis
        │
        ▼
Auth0
```

Frontend chỉ giao tiếp với Backend.

Frontend tuyệt đối không truy cập trực tiếp Database.

---

# 4. Kiến trúc Backend

Backend chia theo Module.

```
src/

auth/

products/

categories/

orders/

cart/

customers/

inventory/

promotions/

dashboard/

chatbot/

common/

config/

database/
```

Mỗi module gồm:

```
controller

service

dto

entities

repository (nếu cần)

interfaces
```

Không viết toàn bộ logic trong Controller.

Controller chỉ nhận request và gọi Service.

---

# 5. Kiến trúc Frontend

Sử dụng App Router.

```
app/

(auth)

(store)

(admin)

components/

features/

hooks/

services/

types/

lib/

```

Không gọi API trực tiếp trong page.tsx.

Mọi API phải thông qua thư mục services.

Ví dụ:

```
ProductService

OrderService

CustomerService

PromotionService
```

---

# 6. Database

Database chính là PostgreSQL.

Các bảng chính:

Users

Categories

Products

ProductImages

Inventory

Promotions

Cart

CartItems

Orders

OrderItems

Addresses

Wishlist

Reviews

---

# Quan hệ

Category

↓

Product

↓

Inventory

↓

OrderItem

↓

Order

Customer

↓

Cart

↓

CartItem

Customer

↓

Order

Customer

↓

Address

---

# 7. Redis

Redis chỉ dùng cho dữ liệu tạm.

Bao gồm:

Giỏ hàng

Session

Cache sản phẩm

Rate Limiting

Không lưu dữ liệu nghiệp vụ quan trọng.

---

# 8. Authentication

Sử dụng Auth0.

Không tự xây Authentication.

Flow

```
User

↓

Auth0 Universal Login

↓

JWT

↓

Frontend

↓

Backend Verify

↓

Cho phép truy cập
```

---

# 9. Authorization

Có 2 Role

Customer

Admin

Customer chỉ được:

- Xem sản phẩm
- Giỏ hàng
- Thanh toán
- Đơn hàng
- Hồ sơ

Admin được:

- Dashboard
- Quản lý sản phẩm
- Quản lý đơn hàng
- Quản lý khách hàng
- Quản lý khuyến mãi
- Quản lý tồn kho

---

# 10. API Design

API theo chuẩn REST.

Version

```
/api/v1/
```

Ví dụ

```
GET

/api/v1/products

POST

/api/v1/products

GET

/api/v1/orders

POST

/api/v1/cart

DELETE

/api/v1/cart/items/:id
```

---

# 11. Chuẩn Response

Thành công

```json
{
    "success": true,
    "message": "Thành công",
    "data": {},
    "meta": {}
}
```

Lỗi

```json
{
    "success": false,
    "message": "Có lỗi xảy ra",
    "errors": []
}
```

---

# 12. Module Sản phẩm

Bao gồm

Danh mục

Sản phẩm

Thông số

Hình ảnh

Màu sắc

Tồn kho

CRUD đầy đủ.

Có:

Search

Pagination

Filter

Sort

---

# 13. Module Giỏ hàng

Chức năng

Thêm sản phẩm

Xóa

Cập nhật số lượng

Áp mã giảm giá

Tính tổng tiền

Redis được ưu tiên lưu Cart.

---

# 14. Module Khuyến mãi

Hỗ trợ

Giảm %

Giảm tiền

Ngày bắt đầu

Ngày kết thúc

Điều kiện áp dụng

Promotion Engine hoạt động độc lập.

---

# 15. Module Đơn hàng

State Machine

```
Created

↓

Paid

↓

Preparing

↓

Shipping

↓

Completed

↓

Cancelled
```

Không cho phép chuyển trạng thái sai.

Ví dụ

Completed

↓

Paid

là không hợp lệ.

---

# 16. Module Dashboard

Dashboard Admin gồm

Doanh thu

Số đơn

Khách hàng

Sản phẩm

Top sản phẩm

Top doanh thu

Đơn gần đây

Cảnh báo tồn kho

---

# 17. AI Chatbot

Chatbot xuất hiện ở toàn bộ Storefront.

Chức năng

Tìm kiếm bằng ngôn ngữ tự nhiên.

Gợi ý xe phù hợp.

Gợi ý xe máy phù hợp.

So sánh xe.

Giải thích thông số.

Tư vấn phụ kiện.

Theo dõi đơn hàng.

FAQ.

Thiết kế theo dạng Floating Chat.

---

# 18. Quy trình phát triển

Mỗi tính năng phải theo thứ tự.

1. Prisma Schema

↓

2. Migration

↓

3. Seed

↓

4. DTO

↓

5. Service

↓

6. Controller

↓

7. Swagger

↓

8. Frontend Service

↓

9. Frontend UI

↓

10. Testing

Không được làm UI trước API.

---

# 19. Nguyên tắc Coding

Áp dụng SOLID.

Không viết code trùng lặp.

Tách Component nhỏ.

Tách Service rõ ràng.

Không Hardcode.

Không gọi API trực tiếp trong Component.

Tất cả kiểu dữ liệu dùng TypeScript.

---

# 20. Quy tắc hoàn thành tính năng

Một tính năng chỉ được xem là hoàn thành khi đáp ứng:

- Database đã cập nhật
- Migration thành công
- API hoàn chỉnh
- Swagger đầy đủ
- Validation đầy đủ
- Phân quyền hoạt động
- Frontend hoàn chỉnh
- Responsive
- Loading
- Empty State
- Error State
- Success State
- Build thành công
- Không có lỗi TypeScript
- Không có lỗi ESLint

Nếu chưa đáp ứng đầy đủ các điều kiện trên thì không được xem là hoàn thành.