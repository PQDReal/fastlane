# FastLane

FastLane là ứng dụng thương mại điện tử và đặt lịch lái thử xe điện, xây dựng bằng Next.js 15 theo mô hình Backend for Frontend (BFF). Hệ thống sử dụng Auth0 để xác thực, Supabase làm cơ sở dữ liệu và OpenAPI để quản lý API contract.

## Chức năng hiện có

- Trang chủ và danh mục ô tô điện, xe máy điện, phụ kiện.
- So sánh các mẫu xe lấy trực tiếp từ Supabase.
- Đặt lịch lái thử theo mẫu xe và tự điền thông tin người dùng đã đăng nhập.
- Không cho phép đặt lịch trong ngày hiện tại hoặc ngày đã qua.
- Trang hồ sơ cho phép cập nhật họ tên và số điện thoại.
- Đồng bộ người dùng Auth0 vào bảng `users` của Supabase sau khi đăng nhập.
- Tự động chuyển tài khoản có role `ADMIN` đến `/admin`.
- Dashboard quản trị, danh sách sản phẩm và quản lý yêu cầu lái thử.
- Quản trị viên có thể lọc và chuyển trạng thái yêu cầu lái thử.
- Swagger UI chạy bằng Docker service riêng.

## Công nghệ

- Node.js 22.12+
- Next.js 15, React 19 và TypeScript
- Tailwind CSS
- Auth0 Universal Login
- Supabase PostgreSQL
- OpenAPI 3 và Redocly CLI
- Docker Compose
- Vitest

## Cấu trúc chính

```text
app/                  Trang và API routes của Next.js
app/api/v1/           API BFF đang được triển khai
app/admin/            Giao diện quản trị
api-contract/         OpenAPI contract và bản bundle cho Swagger
auth0/actions/        Auth0 Actions thêm claims vào token
components/           Component giao diện dùng chung
docs/                 Tài liệu thiết lập và kiến trúc
lib/auth/             Xác thực và phân quyền
lib/services/         Truy cập dữ liệu và nghiệp vụ
```

## Yêu cầu

- Node.js 22.12 trở lên
- npm 10 trở lên
- Docker Desktop và Docker Compose v2 nếu chạy bằng container
- Một Auth0 Regular Web Application và Auth0 API
- Một Supabase project đã có schema của FastLane

## Biến môi trường

Tạo file cấu hình local:

```powershell
Copy-Item .env.example .env.local
```

| Biến | Mục đích |
|---|---|
| `APP_BASE_URL` | URL ứng dụng, mặc định `http://localhost:3000` |
| `AUTH0_SECRET` | Khóa mã hóa session của Auth0 SDK |
| `AUTH0_DOMAIN` | Domain của Auth0 tenant |
| `AUTH0_CLIENT_ID` | Client ID của Auth0 application |
| `AUTH0_CLIENT_SECRET` | Client secret của Auth0 application |
| `AUTH0_AUDIENCE` | Identifier của Auth0 API |
| `AUTH0_ISSUER_BASE_URL` | Issuer URL của Auth0 tenant |
| `AUTH0_JWKS_URI` | Endpoint public keys dùng để xác minh JWT |
| `AUTH0_ROLE_CLAIM` | Namespace claim chứa role |
| `NEXT_PUBLIC_SUPABASE_URL` | URL của Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, chỉ dùng phía server |

Không commit `.env`, `.env.local`, client secret, service-role key hoặc access token.

## Chạy local

```powershell
npm ci
npm ci --prefix api-contract
npm run dev
```

Các địa chỉ chính:

- Web: `http://localhost:3000`
- Đăng nhập: `http://localhost:3000/auth/login`
- Đăng xuất: `http://localhost:3000/auth/logout`
- Quản trị: `http://localhost:3000/admin`
- Đặt lịch lái thử: `http://localhost:3000/test-drive`
- So sánh xe: `http://localhost:3000/compare`
- Hồ sơ: `http://localhost:3000/profile`

## Auth0 và phân quyền

Auth0 xử lý đăng nhập và session. Trong callback, ứng dụng dùng `sub` của Auth0 để tạo hoặc cập nhật bản ghi tương ứng trong bảng `users` của Supabase.

Auth0 API phải có Identifier trùng `AUTH0_AUDIENCE`. Để quản trị yêu cầu lái thử:

1. Bật **Enable RBAC** và **Add Permissions in the Access Token**.
2. Tạo permission `prepurchase:manage`.
3. Gán permission cho role quản trị và gán role cho tài khoản Admin.
4. Đăng xuất rồi đăng nhập lại để nhận access token mới.

Route `/admin` yêu cầu người dùng đã đăng nhập và có role `ADMIN` trong dữ liệu đã đồng bộ. Admin API tiếp tục xác minh bearer token, role `admin` và permission tương ứng. Người dùng không đủ quyền được chuyển đến `/403` hoặc nhận phản hồi `401/403`.

Xem [docs/auth0-supabase.md](docs/auth0-supabase.md) để cấu hình chi tiết.

## Supabase

Docker Compose không khởi tạo PostgreSQL hoặc Supabase local. Ứng dụng kết nối đến Supabase project khai báo trong `.env.local`.

Các bảng chính đang được sử dụng:

- `users`: hồ sơ người dùng và liên kết `auth0_subject`.
- `products`, `product_variants`, `categories`: dữ liệu sản phẩm và mẫu xe.
- `reservations`: yêu cầu lái thử, thông tin liên hệ, mẫu xe, lịch hẹn và trạng thái.

`SUPABASE_SERVICE_ROLE_KEY` có quyền cao và chỉ được đọc trong server code. Không đặt key này trong biến có tiền tố `NEXT_PUBLIC_`.

## API đang triển khai

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/api/v1/health` | Kiểm tra trạng thái ứng dụng |
| `GET` | `/api/v1/categories` | Lấy danh mục |
| `GET` | `/api/v1/products` | Lấy sản phẩm |
| `GET`, `PATCH` | `/api/v1/users/me` | Xem và cập nhật hồ sơ |
| `POST` | `/api/v1/test-drive/requests` | Tạo yêu cầu lái thử |
| `GET` | `/api/v1/admin/products` | Lấy sản phẩm cho Admin |
| `GET` | `/api/v1/admin/test-drive/requests` | Lấy danh sách lịch lái thử |
| `POST` | `/api/v1/admin/test-drive/requests/{requestId}/transitions` | Chuyển trạng thái yêu cầu |

OpenAPI contract có thể chứa thêm endpoint đang ở giai đoạn thiết kế; không nên xem mọi operation trong contract là đã triển khai.

## Swagger UI

Swagger chạy bằng Docker service riêng tại `http://127.0.0.1:8080` và gọi API web tại `http://127.0.0.1:3000`.

Sau khi sửa OpenAPI contract:

```powershell
npm run bundle:openapi
docker compose up -d --force-recreate swagger
```

Đổi cổng Swagger:

```powershell
$env:SWAGGER_PORT = '8081'
docker compose up -d swagger
```

## Docker Compose

Build và chạy web cùng Swagger:

```powershell
docker compose up --build
```

Chạy nền:

```powershell
docker compose up -d --build
```

Nếu Docker vẫn dùng code cũ:

```powershell
docker compose build --no-cache web
docker compose up -d --force-recreate web
```

Dừng hệ thống:

```powershell
docker compose down
```

Compose mặc định dùng `.env.local`. Có thể chọn file khác bằng `FASTLANE_ENV_FILE`, đổi cổng web bằng `FASTLANE_PORT` và đổi cổng Swagger bằng `SWAGGER_PORT`.

## Kiểm tra chất lượng

```powershell
npm test
npm run typecheck
npm run check:openapi
npm run build
```

Hoặc chạy toàn bộ bằng `npm run verify`.

## Tài liệu

- [Thiết lập cho thành viên mới](docs/member-setup.md)
- [Cấu hình Auth0 và Supabase](docs/auth0-supabase.md)
- [Hướng dẫn phát triển UI](docs/ui-development.md)
- [Kiến trúc hệ thống](docs/agent/ARCHITECTURE.md)
- [Quy tắc nghiệp vụ pre-purchase](docs/agent/PREPURCHASE_BUSINESS_RULES.md)
- [Quy tắc đóng góp](CONTRIBUTING.md)

## Bảo mật

- Không ghi tài khoản thử nghiệm hoặc secret vào source và README.
- Không chia sẻ access token hay output đầy đủ của `docker compose config`.
- Đăng xuất và đăng nhập lại sau khi thay đổi role hoặc permission trong Auth0.
- Rotate ngay secret đã từng xuất hiện trong source, Git history hoặc log.
- Không chỉnh role quản trị dựa trên dữ liệu do trình duyệt gửi lên.
