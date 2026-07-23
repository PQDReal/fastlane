# FastLane

Khung ứng dụng FastLane dùng Next.js 15/BFF, Auth0 Universal Login, OpenAPI contract và Supabase managed. Repo đã có CI và production container; Compose chỉ chạy web service, không chạy database cục bộ.

## Bắt đầu từ đây

- Thành viên mới: [Thiết lập FastLane từ GitHub](docs/member-setup.md)
- Quy tắc đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md)
- Nâng cấp/làm lại giao diện: [Hướng dẫn phát triển UI](docs/ui-development.md)
- Cấu hình identity/database: [Auth0 và Supabase](docs/auth0-supabase.md)
- Thiết kế foundation: [Đặc tả Auth0, CI và Docker](docs/spec-auth0-ci-docker-compose.md)

Trạng thái hiện tại: landing page và Auth0 login/logout hoạt động với role `Customer`/`Admin`; chưa có API nghiệp vụ, Supabase data layer hoặc route `/admin`. Vì vậy dashboard Admin và nút **Về trang chủ** đang là backlog UI, không phải tính năng đã có trong source.

## Yêu cầu

- Node.js 22.12+
- npm 10+
- Docker + Docker Compose v2 (nếu chạy container)
- Auth0 Regular Web Application và Auth0 API
- Supabase project managed

## Chạy local

```powershell
Copy-Item .env.example .env.local
npm ci
npm ci --prefix api-contract
npm run dev
```

Điền các giá trị Auth0 cần cho local vào `.env.local`; file này bị Git và Docker bỏ qua. Các biến Supabase chưa được runtime sử dụng và không cần service-role key khi làm UI. Truy cập `http://localhost:3000`. Login/logout dùng `/auth/login` và `/auth/logout` do Auth0 SDK quản lý.

Hướng dẫn tenant, role, claim, secret rotation và Supabase trust: [docs/auth0-supabase.md](docs/auth0-supabase.md).

## Tài khoản và phương thức đăng nhập

Mở `http://localhost:3000/auth/login` hoặc chọn **Đăng nhập** trên header. Môi trường phát triển hiện hỗ trợ:

- **Email và mật khẩu** qua Auth0 Database Connection: dùng các tài khoản test được maintainer tạo và gán role thủ công.
- **Google** qua Auth0 Social Connection khi connection này được bật. Auth0 Development Keys chỉ phù hợp để thử local; production phải dùng Google OAuth credentials do dự án quản lý.

| Loại tài khoản test | Role Auth0 bắt buộc | Kết quả hiện tại |
|---|---|---|
| Customer | `Customer` | Login/logout thành công và quay về landing page |
| Admin | `Admin` | Login/logout thành công; hiện vẫn quay về landing page vì chưa có route `/admin` |

Nhận email/mật khẩu test từ maintainer qua password manager hoặc kênh bí mật. Không ghi credential vào README, issue hoặc source code. Nếu tự đăng ký tài khoản mới bằng **Sign up** hoặc Google, maintainer phải gán role `Customer`/`Admin` trong Auth0 trước khi Action cho phép hoàn tất đăng nhập.

Khi Auth0 hiện màn hình **Authorize App** trên localhost, chọn **Accept** để tiếp tục. Đăng xuất tại `http://localhost:3000/auth/logout`.

## Kiểm tra

```powershell
npm test
npm run typecheck
npm run check:openapi
npm run build
```

`npm run verify` chạy tuần tự toàn bộ bốn gate trên. OpenAPI dependencies có lockfile riêng trong `api-contract/`, vì vậy fresh checkout phải chạy `npm ci --prefix api-contract` trước contract check.

Health endpoint theo contract: `GET /api/v1/health` → `{ "data": { "status": "ok" } }`.

## Docker Compose

Sau khi cấu hình `.env.local`:

```powershell
docker compose config --quiet
docker compose up --build
```

Mặc định web được publish tại port `3000`.
Swagger UI chạy bằng service `swagger` riêng và đọc bản bundle tại `api-contract/dist/openapi.bundle.yaml`:

```text
http://127.0.0.1:8080
```

Đổi cổng Swagger trong PowerShell nếu cần:

```powershell
$env:SWAGGER_PORT = '8081'
docker compose up -d swagger
```

Sau khi sửa OpenAPI contract, tạo lại bundle rồi recreate service:

```powershell
npm ci --prefix api-contract
npm run bundle:openapi
docker compose up -d --force-recreate swagger
``` Compose bắt buộc có `.env.local`, đọc Auth0/Supabase runtime configuration từ file này, chờ `/api/v1/health`, và không chứa service PostgreSQL/Supabase.

Chỉ để kiểm tra cấu trúc Compose mà chưa tạo `.env.local`, có thể tạm đặt `$env:FASTLANE_ENV_FILE = '.env.example'` trong PowerShell; không dùng file placeholder này để chạy môi trường thật. Không đăng output đầy đủ của `docker compose config` lên PR/issue/chat vì lệnh đó có thể hiển thị giá trị đã resolve từ env file.

Để đổi host port trong PowerShell, đặt biến cho Compose và cập nhật đồng thời `APP_BASE_URL` cùng callback/logout URL trong Auth0 Dashboard:

```powershell
$env:FASTLANE_PORT = '3001'
# .env.local: APP_BASE_URL=http://localhost:3001
# Auth0 callback: http://localhost:3001/auth/callback
# Auth0 logout URL và Allowed Web Origins: http://localhost:3001
docker compose up --build
```

Để dừng:

```powershell
docker compose down
```

## CI

`.github/workflows/ci.yml` chạy trên Node 22 cho pull request và push vào `main`. Pipeline cài cả hai lockfile, chạy unit test, TypeScript, OpenAPI validation, Next build và Docker build. Các giá trị Auth0 trong CI chỉ là placeholder build-time; tenant secret thật phải nằm trong runtime secret store của môi trường deploy.

## Quy tắc secret

- Không commit `.env.local` hoặc token/key thật.
- Không đặt Supabase service-role key vào `NEXT_PUBLIC_*`.
- Rotate ngay key đã từng xuất hiện trong source/history hoặc log.
- Không chạy `npm audit fix --force`; nâng dependency có kiểm soát và review breaking changes.
