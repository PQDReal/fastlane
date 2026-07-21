# FastLane

Khung ứng dụng FastLane dùng Next.js 15/BFF, Auth0 Universal Login, OpenAPI contract và Supabase managed. Repo đã có CI và production container; Compose chỉ chạy web service, không chạy database cục bộ.

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

Điền giá trị thật vào `.env.local`; file này bị Git và Docker bỏ qua. Truy cập `http://localhost:3000`. Login/logout dùng `/auth/login` và `/auth/logout` do Auth0 SDK quản lý.

Hướng dẫn tenant, role, claim, secret rotation và Supabase trust: [docs/auth0-supabase.md](docs/auth0-supabase.md).

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
docker compose config
docker compose up --build
```

Mặc định web được publish tại port `3000`. Compose bắt buộc có `.env.local`, đọc Auth0/Supabase runtime configuration từ file này, chờ `/api/v1/health`, và không chứa service PostgreSQL/Supabase.

Chỉ để kiểm tra cấu trúc Compose mà chưa tạo `.env.local`, có thể tạm đặt `FASTLANE_ENV_FILE=.env.example`; không dùng file placeholder này để chạy môi trường thật.

Để đổi host port trong PowerShell, đặt biến cho Compose và cập nhật đồng thời `APP_BASE_URL` cùng callback/logout URL trong Auth0 Dashboard:

```powershell
$env:FASTLANE_PORT = '3001'
# .env.local: APP_BASE_URL=http://localhost:3001
# Auth0 callback: http://localhost:3001/auth/callback
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
