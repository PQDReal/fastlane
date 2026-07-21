# AGENT_RULES.md

# Quy tắc phát triển dự án FASTLANE

## Mục tiêu

AI Agent đóng vai trò là Senior Full Stack Developer.

Mọi quyết định phải ưu tiên:

- Kiến trúc rõ ràng
- Dễ mở rộng
- Dễ bảo trì
- Đồng bộ giữa Backend và Frontend
- Không tạo mã nguồn dư thừa
- Không sinh code trùng lặp

Không được ưu tiên viết nhanh mà bỏ qua kiến trúc.

---

# Nguyên tắc quan trọng nhất

## Backend và Frontend luôn được phát triển cùng nhau.

Không được tạo API mà không tạo giao diện sử dụng API đó.

Không được tạo giao diện nhưng chưa có API.

Một tính năng chỉ được xem là hoàn thành khi có đầy đủ:

- Database
- Migration
- API
- Swagger
- DTO
- Validation
- Phân quyền
- Service Frontend
- Giao diện
- Loading
- Empty State
- Error State
- Success State

---

# Quy trình phát triển bắt buộc

Mỗi tính năng phải được thực hiện theo đúng thứ tự sau:

## Bước 1

Thiết kế Database

- Prisma Schema
- Migration
- Seed Data

↓

## Bước 2

Backend

- Module
- Controller
- Service
- DTO
- Validation
- Exception Handling

↓

## Bước 3

Swagger

Sinh đầy đủ tài liệu API

Bao gồm:

- Request
- Response
- Error
- Example

↓

## Bước 4

Frontend Service

Tạo API Service

Không được gọi API trực tiếp trong Component.

↓

## Bước 5

Frontend

Tạo:

- Trang
- Component
- Form
- Dialog
- Table
- Card

↓

## Bước 6

Kiểm tra

Đảm bảo Frontend hoạt động đúng với API.

---

# API First

Backend luôn là nguồn dữ liệu chuẩn.

Frontend bắt buộc sử dụng đúng API.

Không tự tạo thêm field.

Không tự đổi tên field.

Không đoán dữ liệu.

Nếu API chưa tồn tại thì phải tạo API trước.

---

# Quy tắc Database

Mọi thay đổi Database phải thông qua Prisma.

Không sửa Database thủ công.

Mỗi thay đổi phải có:

- Schema
- Migration
- Seed (nếu cần)

---

# Quy tắc Module

Mỗi Module phải độc lập.

Ví dụ:

Products

Orders

Customers

Inventory

Promotions

Cart

Wishlist

Reviews

Không để logic của module này nằm trong module khác.

---

# Quy tắc Controller

Controller chỉ có nhiệm vụ:

- Nhận Request
- Validate
- Gọi Service
- Trả Response

Không xử lý nghiệp vụ.

---

# Quy tắc Service

Toàn bộ nghiệp vụ phải nằm trong Service.

Không viết logic trong Controller.

Không viết logic trong Component.

---

# Quy tắc DTO

Mỗi API đều phải có DTO.

Ví dụ:

CreateProductDto

UpdateProductDto

CreateOrderDto

UpdateOrderDto

Không dùng any.

---

# Validation

Mọi dữ liệu đầu vào đều phải Validate.

Ví dụ:

Email

Số điện thoại

Giá tiền

Số lượng

Ngày tháng

Không tin tưởng dữ liệu từ Client.

---

# Chuẩn Response

API luôn trả về theo format:

```json
{
  "success": true,
  "message": "Thành công",
  "data": {},
  "meta": {}
}
```

Nếu lỗi

```json
{
  "success": false,
  "message": "Có lỗi xảy ra",
  "errors": []
}
```

Không trả về dữ liệu không có cấu trúc.

---

# Quy tắc Authentication

Sử dụng Auth0.

Không tự xây hệ thống Login.

Sử dụng JWT Bearer Token.

Backend luôn Verify JWT.

---

# Quy tắc Authorization

Có 2 quyền.

Customer

Admin

Customer chỉ được:

- Xem sản phẩm
- Mua hàng
- Giỏ hàng
- Đơn hàng
- Hồ sơ

Admin được:

- Dashboard
- Quản lý sản phẩm
- Quản lý khách hàng
- Quản lý đơn hàng
- Quản lý tồn kho
- Quản lý khuyến mãi

Không cho phép Customer truy cập API Admin.

---

# Quy tắc Frontend

Sử dụng:

Next.js App Router

TypeScript

TailwindCSS

shadcn/ui

Không dùng CSS thuần nếu Tailwind có thể giải quyết.

---

# Quy tắc API Service

Không gọi fetch() hoặc axios trực tiếp trong Component.

Tất cả API phải nằm trong:

services/

Ví dụ:

ProductService

OrderService

CustomerService

PromotionService

InventoryService

---

# Quy tắc Component

Ưu tiên tái sử dụng.

Không tạo nhiều Component giống nhau.

Các Component dùng chung đặt trong:

components/

Ví dụ:

Button

Card

Modal

Dialog

Table

SearchBar

Pagination

Badge

Loading

---

# Quy tắc Form

Mọi Form đều phải có:

Validate

Loading

Disable Button khi Submit

Thông báo lỗi

Thông báo thành công

---

# Quy tắc Table

Mọi bảng dữ liệu đều phải có:

Phân trang

Tìm kiếm

Lọc

Sắp xếp

Loading

Empty State

---

# Quy tắc Responsive

Toàn bộ giao diện phải Responsive.

Ưu tiên Desktop.

Hỗ trợ Tablet.

Hỗ trợ Mobile.

---

# Quy tắc UI

Thiết kế đồng bộ.

Không thay đổi màu sắc tùy ý.

Không tự ý thay đổi Typography.

Sử dụng Component thống nhất.

---

# Quy tắc Error

Frontend luôn có:

Loading

Skeleton

404

403

500

Empty State

Retry

Backend luôn có:

Global Exception Filter

Validation Pipe

Logging

---

# Quy tắc Search

Các Module sau bắt buộc có:

Sản phẩm

Đơn hàng

Khách hàng

Khuyến mãi

Tồn kho

Có:

Search

Filter

Sort

Pagination

---

# Quy tắc Dashboard

Dashboard phải có:

Doanh thu

Đơn hàng

Khách hàng

Sản phẩm

Biểu đồ

Top sản phẩm

Đơn gần đây

Cảnh báo tồn kho

---

# Quy tắc AI Chatbot

Chatbot xuất hiện ở toàn bộ Storefront.

Có thể:

- Gợi ý xe phù hợp
- Gợi ý xe máy phù hợp
- Gợi ý phụ kiện
- So sánh sản phẩm
- Tìm kiếm bằng ngôn ngữ tự nhiên
- Theo dõi đơn hàng
- Trả lời FAQ

Không được ảnh hưởng tới luồng mua hàng chính.

---

# Quy tắc Code

Áp dụng:

SOLID

DRY

KISS

Clean Code

Clean Architecture

Dependency Injection

Không Hardcode.

Không lặp code.

Không dùng any.

Không bỏ qua TypeScript Error.

---

# Quy tắc Git

Mỗi tính năng tương ứng một nhánh (feature branch).

Commit rõ ràng theo chuẩn Conventional Commits.

Ví dụ:

feat(products): thêm API CRUD sản phẩm

fix(cart): sửa lỗi tính tổng tiền

refactor(order): tách OrderService

docs(api): cập nhật Swagger

---

# Tiêu chí hoàn thành một tính năng

Một tính năng chỉ được đánh dấu hoàn thành khi:

✓ Database đã cập nhật

✓ Migration thành công

✓ Seed dữ liệu (nếu cần)

✓ API hoạt động

✓ Swagger đầy đủ

✓ DTO đầy đủ

✓ Validation đầy đủ

✓ Phân quyền hoạt động

✓ Frontend Service hoàn thành

✓ Giao diện hoàn thành

✓ Responsive

✓ Loading State

✓ Empty State

✓ Error State

✓ Success State

✓ Không có lỗi TypeScript

✓ Không có lỗi ESLint

✓ Build thành công

Nếu còn thiếu bất kỳ mục nào ở trên thì tính năng chưa được xem là hoàn thành.

---

# Quy tắc cuối cùng

AI Agent không được tự ý thay đổi kiến trúc hệ thống.

Nếu phát hiện yêu cầu mới có thể ảnh hưởng đến Database, API hoặc Frontend, AI phải:

1. Phân tích tác động.
2. Đề xuất phương án.
3. Cập nhật đồng bộ Database, Backend, Frontend và tài liệu liên quan.
4. Chỉ kết thúc khi toàn bộ hệ thống vẫn hoạt động thống nhất.