# Hướng dẫn Triển khai (Deployment Guide) - Dự án Fastlane

Tài liệu này hướng dẫn cách triển khai hệ thống Fastlane lên môi trường Production (như Vercel hoặc Railway) và cấu hình chi tiết các dịch vụ bên thứ ba (Auth0, Supabase, VNPay, v.v.).

---

## 1. Yêu cầu Hệ thống
- **Node.js:** v22.12.0 trở lên
- **NPM:** v10 trở lên
- Trình quản lý cơ sở dữ liệu: Supabase (PostgreSQL)

---

## 2. Các Dịch vụ cần thiết lập (SaaS)
Để hệ thống vận hành trơn tru, bạn cần có tài khoản tại các dịch vụ sau:
1. **Supabase:** Cơ sở dữ liệu và quản lý File (nhẹ).
2. **Auth0:** Quản lý đăng nhập (Authentication) cho Admin.
3. **Vercel / Railway:** Hosting ứng dụng Next.js.
4. **Upstash / Redis:** Bộ nhớ đệm (Cache).
5. **Resend / SMTP:** Gửi email.
6. **Cloudinary:** (Tùy chọn) Lưu trữ và tối ưu ảnh sản phẩm.
7. **Sentry:** (Tùy chọn) Theo dõi lỗi và hiệu suất.
8. **VNPay:** (Tùy chọn) Cổng thanh toán nội địa.

---

## 3. Cấu hình Auth0 (Xác thực Người dùng & Quản trị viên)

Auth0 được sử dụng làm hệ thống đăng nhập (Authentication) tập trung cho toàn bộ nền tảng, bao gồm cả Khách hàng (User) và Quản trị viên (Admin). Việc phân quyền (Role) thường được cấu hình thông qua Auth0 Rules/Actions để đính kèm `roles` vào token.

### 3.1. Tạo Ứng dụng (Application)
- Đăng nhập vào Auth0 Dashboard.
- Tạo một **Regular Web Application** tên là `Fastlane App` (hoặc tên dự án của bạn).
- Chuyển sang tab **Settings**:
  - Lấy `Domain`, `Client ID`, và `Client Secret`.
  - **Allowed Callback URLs:** `https://<ten-mien-cua-ban>/api/auth/callback`
  - **Allowed Logout URLs:** `https://<ten-mien-cua-ban>/`
  - Lưu cấu hình lại.

### 3.2. Cấu hình API (Audience)
- Vào mục **Applications > APIs**, tạo một API mới:
  - **Name:** Fastlane API
  - **Identifier:** `https://api.fastlane.local`
- Trở lại tab **Settings** của ứng dụng ban nãy, đảm bảo nó có quyền truy cập vào API này.

### 3.3. Cập nhật biến môi trường (.env)
```env
AUTH0_SECRET="tao-mot-chuoi-32-ky-tu-ngau-nhien-o-day"
AUTH0_DOMAIN="ten-mien-auth0-cua-ban.auth0.com"
AUTH0_CLIENT_ID="<Client ID>"
AUTH0_CLIENT_SECRET="<Client Secret>"
AUTH0_AUDIENCE="https://api.fastlane.local"
AUTH0_ISSUER_BASE_URL="https://ten-mien-auth0-cua-ban.auth0.com/"
```

---

## 4. Cấu hình Cơ sở dữ liệu (Supabase)
- Tạo một Project mới trên Supabase.
- Chạy các file SQL trong thư mục `migrations/` để tạo các bảng (`products`, `orders`, `policies`, v.v.).
- Vào phần Settings > API để lấy URL và Keys:
```env
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="ey..."
SUPABASE_SERVICE_ROLE_KEY="ey..."
```

---

## 5. Triển khai (Deploying to Railway)

Hệ thống hiện tại được cấu hình tối ưu để chạy trên Railway (có hỗ trợ biến môi trường `RAILWAY_PUBLIC_DOMAIN`).

### Các bước trên Railway
1. Truy cập **Railway Dashboard** và tạo một Project mới.
2. Chọn **Deploy from GitHub repo** và kết nối với kho lưu trữ Fastlane của bạn.
3. Railway sẽ tự động nhận diện đây là dự án Next.js (Node.js).
4. Vào phần **Variables**, dán toàn bộ các biến cấu hình từ file `.env.local` (nhớ điền đủ thông tin thật).
5. (Tuỳ chọn) Bạn có thể thêm trực tiếp database PostgreSQL và Redis ngay trong Railway Project (Add Service > Database) để không cần dùng Supabase/Upstash bên ngoài.
6. Khi có biến môi trường, quá trình build (`npm run build`) sẽ tự động chạy và cấp phát một domain cho bạn.
### Cấu hình biến môi trường cốt lõi (Core Env)
```env
# Phải trùng với tên miền thực tế
APP_BASE_URL="https://your-domain.com"
# OTP Secret
CONTRACT_OTP_SECRET="tao-chuoi-bi-mat-32-ky-tu-2"
# Redis Cache
REDIS_URL="redis://default:mat-khau-redis@endpoint.upstash.io:32456"
# Gửi Email (Khuyên dùng Resend)
RESEND_API_KEY="re_..."
```

---

## 6. Các bước Tối ưu & Dọn dẹp Code (Đã thực hiện)
- Đã chạy Type Check (`npm run typecheck`) và khắc phục mọi lỗi nghiêm ngặt của TypeScript.
- Đã khắc phục 100% các Test Case rớt khi chạy CI (`vitest`). Code hiện tại đã đạt ngưỡng ổn định cho Production.
- Đã dọn dẹp các tệp tin lưu nháp (như `scratch.ts`).
- **Khuyến nghị bổ sung:** Trước khi đưa ra công chúng (Go-Live), bạn nên tắt cờ Debug (`ENABLE_DEPOSIT_DEBUG_ACTIONS=false`) và bật chế độ `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` để loại bỏ các log nháp.

---

> Tuyệt đối không commit (đưa lên git) file `.env.local` hoặc bất kỳ khóa bí mật nào (như `AUTH0_CLIENT_SECRET` hay `SUPABASE_SERVICE_ROLE_KEY`). Nếu bị lộ, hãy tạo key mới (Roll keys) ngay lập tức.
