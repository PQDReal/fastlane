# Thiết lập FastLane cho thành viên mới

Tài liệu này dành cho thành viên kỹ thuật vừa được cấp quyền vào repository. Kết quả mong đợi là chạy được landing page, đăng nhập/đăng xuất bằng các tài khoản được gán role `Customer` hoặc `Admin`, kiểm tra được health endpoint và sẵn sàng tạo pull request. UI hiện tại chỉ chứng minh session hoạt động; chưa có màn hình/API nghiệp vụ để chứng minh khác biệt authorization giữa hai role.

> Không đưa mật khẩu test, Auth0 Client Secret, `AUTH0_SECRET` hoặc Supabase service-role key vào GitHub, issue, ảnh chụp hay kênh chat công khai.

## 1. Trạng thái hệ thống hiện tại

Đã có:

- landing page responsive tại `/`;
- Auth0 Universal Login và logout;
- role Auth0 `Customer`/`Admin`, Post-Login Action và khung kiểm tra JWT/permission;
- OpenAPI contract, unit test, TypeScript check và Next.js build;
- GitHub Actions CI, Dockerfile và Docker Compose;
- health endpoint `GET /api/v1/health`;
- Supabase managed được chọn làm database.

Chưa có:

- API nghiệp vụ và kết nối dữ liệu Supabase trong ứng dụng;
- schema/RLS được thực thi từ code của repo;
- trang quản trị `/admin` và điều hướng “Về trang chủ”;
- cart, checkout và các màn hình nghiệp vụ hoàn chỉnh.

Hai tài khoản Auth0 viết tay chỉ dùng để xác minh login/logout và việc Action chấp nhận user đã được gán role. Không coi chúng là dữ liệu Customer/Admin thật và không dùng UI hiện tại để kết luận permission đã được thực thi.

## 2. Quyền truy cập cần được cấp

Trước khi cài đặt, thành viên cần:

- quyền đọc repository `https://github.com/looby239/fastlane.git`;
- các giá trị Auth0 cần cho local được maintainer chuyển qua kênh bí mật;
- một tài khoản test `Customer` và/hoặc `Admin`, với mật khẩu được chia sẻ qua password manager hoặc kênh riêng;
- quyền vào Auth0/Supabase Dashboard chỉ khi nhiệm vụ yêu cầu thay đổi cấu hình tenant hoặc database.

Thành viên làm UI không cần Client Secret hiển thị trong source và không cần Supabase service-role key. Chỉ cấp quyền tối thiểu cần cho nhiệm vụ.

## 3. Công cụ bắt buộc

- Git;
- Node.js `22.12.0` trở lên;
- npm `10` trở lên;
- Docker Desktop có Compose v2 nếu cần kiểm tra container;
- trình duyệt có cửa sổ ẩn danh để kiểm tra nhiều role.

Kiểm tra phiên bản trong PowerShell:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

Docker là tùy chọn khi chỉ phát triển UI bằng `npm run dev`.

## 4. Clone repository

```powershell
git clone https://github.com/looby239/fastlane.git
cd fastlane
git status
```

Tạo branch riêng trước khi thay đổi:

```powershell
git switch -c feature/ten-ngan-gon
```

Không phát triển trực tiếp trên `main`. Nếu repository chưa có commit Auth0/CI/Docker mới nhất, dừng lại và hỏi maintainer thay vì tự dựng lại cấu hình theo phỏng đoán.

## 5. Tạo `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Điền biến theo bảng dưới đây:

| Biến | Nguồn | Có phải secret? |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:3000` khi chạy local | Không |
| `AUTH0_SECRET` | Mỗi developer tự tạo chuỗi hex 32 byte | Có |
| `AUTH0_DOMAIN` | Auth0 Application → Settings → Domain | Không |
| `AUTH0_CLIENT_ID` | Auth0 Application → Settings → Client ID | Không |
| `AUTH0_CLIENT_SECRET` | Auth0 Application → Settings → Client Secret | Có |
| `AUTH0_AUDIENCE` | Identifier của Auth0 API FastLane | Không |
| `AUTH0_ISSUER_BASE_URL` | `https://<AUTH0_DOMAIN>/` | Không |
| `AUTH0_JWKS_URI` | `https://<AUTH0_DOMAIN>/.well-known/jwks.json` | Không |
| `AUTH0_ROLE_CLAIM` | Namespace role do nhóm thống nhất | Không |
| `NEXT_PUBLIC_SUPABASE_URL` | Chưa cần cho runtime hiện tại; chỉ lấy khi task tích hợp Supabase | Không |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chưa cần cho runtime hiện tại; chỉ lấy khi task tích hợp Supabase | Public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Không cấp cho task UI; chỉ dùng server-side khi task được phê duyệt | Secret đặc quyền cao |

Tạo `AUTH0_SECRET` trên Windows bằng Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Mỗi developer nên có `AUTH0_SECRET` riêng. Auth0 Client Secret phải lấy từ đúng Regular Web Application mà `AUTH0_CLIENT_ID` đang trỏ tới.

Repo hiện chưa tạo Supabase client và chưa gọi database từ UI. Vì vậy các biến Supabase đang là cấu hình chuẩn bị cho giai đoạn tích hợp. Thành viên chỉ làm giao diện nên giữ placeholder hoặc xóa các dòng Supabase khỏi `.env.local`; không yêu cầu và không cấp service-role key.

## 6. Cài dependency và chạy local

Tại thư mục gốc repository:

```powershell
npm ci
npm ci --prefix api-contract
npm run dev
```

`npm ci` đầu tiên thường mất khoảng 1–3 phút tùy mạng và máy. Cài OpenAPI thường mất dưới một phút. Khi terminal hiện `Ready`, mở:

```text
http://localhost:3000
```

Không chạy `npm audit fix --force`. Lệnh này có thể nâng dependency vượt major version và làm hỏng lockfile hoặc build.

## 7. Checklist xác minh local

### Landing page và health

1. Mở `http://localhost:3000` và kiểm tra hero, danh mục, sản phẩm, footer.
2. Mở `http://localhost:3000/api/v1/health`.
3. Kết quả health phải là:

```json
{
  "data": {
    "status": "ok"
  }
}
```

### Customer

1. Mở `/auth/login`.
2. Đăng nhập tài khoản được gán role `Customer`.
3. Nếu Auth0 hiện “Authorize App” trên localhost, chọn **Accept**.
4. Xác nhận quay lại `/`, header hiện tên/email và nút **Đăng xuất**.
5. Chọn **Đăng xuất**, rồi xác nhận header trở lại nút **Đăng nhập**.

### Admin

1. Dùng cửa sổ ẩn danh mới và đăng nhập tài khoản có role `Admin`.
2. Xác nhận login/logout và session hoạt động.
3. Hiện tại Admin vẫn quay về landing page giống Customer vì repo chưa có `/admin` hoặc protected business API. Đây là known gap và bài test này chưa chứng minh permission Admin.

Terminal thành công thường có:

```text
GET /auth/login 307
GET /auth/callback?... 307
GET / 200
```

Không chia sẻ nguyên URL callback vì URL chứa authorization code/state dùng một lần.

## 8. Các cảnh báo local đã biết

- `Critical dependency ... dpopUtils.js`: cảnh báo bundler từ Auth0 SDK; không chặn login hoặc build hiện tại.
- `GET /sw.js 404`: trình duyệt đang tìm service worker nhưng repo chưa phải PWA.
- Auth0 “Dev Keys”: dùng được cho thử nghiệm social login local, không dùng cho production.
- Auth0 “Authorize App”: localhost không phải callback có thể xác minh, nên consent là hành vi bình thường.

Khi login thất bại, gửi cho maintainer `type` và `description` của Auth0 log mới nhất. Không gửi Client Secret, token, authorization code, `state` hoặc `nonce`.

## 9. Chạy bộ kiểm tra trước khi mở pull request

```powershell
npm test
npm run typecheck
npm run check:openapi
npm run build
```

Hoặc chạy tuần tự toàn bộ:

```powershell
npm run verify
```

Pull request chỉ sẵn sàng review khi các lệnh trên thành công. GitHub Actions sẽ chạy lại cùng các gate và thêm Docker build/smoke test.

## 10. Chạy bằng Docker Compose

Sau khi `.env.local` hợp lệ:

```powershell
docker compose config --quiet
docker compose up --build
```

Dùng `--quiet` để chỉ kiểm tra cấu hình. Không đăng output đầy đủ của `docker compose config` lên PR, issue hoặc chat vì output có thể chứa Auth0/Supabase secret đã được resolve.

Mở `http://localhost:3000`. Compose chỉ chạy web; Supabase vẫn là dịch vụ managed bên ngoài.

Dừng container:

```powershell
docker compose down
```

Nếu port 3000 đang bận, cần đổi đồng thời port, `APP_BASE_URL`, Allowed Callback URLs, Allowed Logout URLs và Allowed Web Origins trong Auth0. Xem ví dụ tại [README](../README.md#docker-compose).

## 11. Quy trình đóng góp

```powershell
git status
git add -- README.md docs/member-setup.md
git commit -m "feat: mo-ta-ngan-gon"
git push -u origin feature/ten-ngan-gon
```

Sau đó mở pull request vào branch do nhóm quy định. Trong mô tả PR, ghi:

- mục tiêu thay đổi;
- ảnh trước/sau nếu sửa UI;
- kích thước màn hình đã kiểm tra;
- kết quả `npm run verify`;
- ảnh hưởng đến Auth0, API contract hoặc biến môi trường nếu có.

## 12. Checklist cho maintainer trước khi mời thành viên

- merge foundation Auth0/CI/Docker và bộ tài liệu này vào branch mà thành viên sẽ clone;
- đặt đúng default branch trên GitHub và bảo vệ branch chính;
- yêu cầu GitHub Actions CI thành công trước khi merge pull request;
- kiểm tra `.env.local`, token, mật khẩu và key thật không nằm trong Git history;
- xác nhận Auth0 Application Access, Post-Login Action và hai role đã được cấu hình;
- xác nhận hai tài khoản test đã được gán đúng role và không dùng chung mật khẩu production;
- mời thành viên vào repository, Auth0 hoặc Supabase theo nguyên tắc quyền tối thiểu;
- chuyển secret/test credential qua password manager hoặc kênh bí mật;
- nhờ ít nhất một thành viên kiểm tra quy trình bằng fresh clone.

Nếu commit chỉ tồn tại ở máy maintainer mà chưa được push/merge, thành viên clone GitHub sẽ không nhận được thay đổi đó.

## Tài liệu liên quan

- [Hướng dẫn phát triển và làm lại UI](ui-development.md)
- [Thiết lập Auth0 và Supabase](auth0-supabase.md)
- [Đặc tả foundation Auth0/CI/Docker](spec-auth0-ci-docker-compose.md)
- [OpenAPI review](../api-contract/OPENAPI_REVIEW.md)
