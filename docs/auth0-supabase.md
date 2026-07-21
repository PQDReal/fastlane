# Auth0 và Supabase cho FastLane

FastLane dùng Auth0 Universal Login cho đăng nhập, Auth0 API access token cho các endpoint `/api/v1`, và Supabase managed làm database. Docker Compose không chạy Supabase hoặc PostgreSQL cục bộ.

## 1. Xử lý secret trước khi cấu hình

File `.env.example` chỉ được chứa placeholder. Nếu một Supabase service-role/secret key đã từng xuất hiện trong repo hoặc được chia sẻ ngoài kênh bí mật, hãy revoke/rotate key đó trong Supabase Dashboard trước khi tiếp tục. Không bao giờ đặt service-role key trong biến bắt đầu bằng `NEXT_PUBLIC_`.

Tạo `.env.local` từ `.env.example`, rồi tạo session secret 32 byte dạng hex:

```bash
openssl rand -hex 32
```

## 2. Auth0 Regular Web Application

Trong Auth0 Dashboard, tạo **Regular Web Application** và cấu hình:

- Allowed Callback URLs: `http://localhost:3000/auth/callback`
- Allowed Logout URLs: `http://localhost:3000`
- Allowed Web Origins: `http://localhost:3000`

Thêm URL production tương ứng khi triển khai. Điền domain, client ID, client secret và session secret vào `.env.local`. SDK tự cung cấp `/auth/login`, `/auth/callback` và `/auth/logout`; không tạo backend auth endpoint trùng lặp.

## 3. Auth0 API, RBAC và claims

Tạo Auth0 API với identifier trùng `AUTH0_AUDIENCE`, chọn signing algorithm **RS256**, sau đó bật:

- Enable RBAC
- Add Permissions in the Access Token

Tạo hai role đúng tên `Customer` và `Admin`. Role `Admin` nhận các permission theo OpenAPI contract:

- `catalog:manage`
- `dashboard:read`
- `inventory:manage`
- `orders:fulfill`
- `orders:read:any`
- `promotion:manage`

Gán `Customer` cho khách hàng qua quy trình provision được kiểm soát trước lần đăng nhập đầu tiên; chỉ quản trị tenant mới được gán `Admin`. Action từ chối đăng nhập nếu user không có một trong hai role và không tự nâng quyền Admin. Backend chuẩn hóa hai tên này thành `customer` và `admin`, kiểm tra exact issuer/audience, chữ ký RS256 từ JWKS, `exp`, `nbf`, role và toàn bộ permission mà operation yêu cầu.

Đặt các biến sau cùng một giá trị ở application, API verifier và Action:

```env
AUTH0_ISSUER_BASE_URL=https://TENANT.REGION.auth0.com/
AUTH0_JWKS_URI=https://TENANT.REGION.auth0.com/.well-known/jwks.json
AUTH0_AUDIENCE=https://api.fastlane.example
AUTH0_ROLE_CLAIM=https://fastlane.example.com/roles
```

Audience API phải khác Auth0 application client ID. ID token không được dùng làm bearer credential cho `/api/v1`.

## 4. Deploy Post-Login Action

Tạo custom Post-Login Action bằng nội dung `auth0/actions/add-token-claims.js`. Thêm Action secret:

```text
ROLE_CLAIM_NAMESPACE=https://fastlane.example.com/roles
```

Deploy Action và kéo nó vào Login Flow. Action đưa namespaced role claim vào access token và ID token. Claim `permissions` do tùy chọn **Add Permissions in the Access Token** của Auth0 API cung cấp.

## 5. Kết nối Supabase Third-Party Auth

Trong Supabase Dashboard, mở **Authentication → Third-Party Auth**, thêm Auth0 integration, rồi nhập Auth0 tenant ID và region khi dashboard yêu cầu. Auth0 tenant phải dùng asymmetric signing và token phải có `kid`; HS256/PS256 không phù hợp với integration này.

Supabase cần literal claim `role: authenticated`. Action chỉ thêm claim này vào **ID token**, đúng với cơ chế Auth0/Supabase; không thêm nó vào API access token. Khi lớp truy cập Supabase được triển khai, cung cấp Auth0 ID token cho Supabase client `accessToken` callback. BFF vẫn dùng Auth0 API access token riêng để bảo vệ `/api/v1`.

Sau khi kết nối, kiểm tra RLS bằng một user `Customer` trước, rồi xác nhận user không thể đọc dữ liệu của customer khác. Việc tạo policy/schema RLS nằm ngoài foundation này và không được thay đổi trong bước hiện tại.

## 6. Kiểm tra vận hành

1. Mở `/auth/login`, hoàn tất Universal Login và xác nhận header hiển thị user.
2. Mở `/auth/logout` và xác nhận session cookie bị xóa.
3. Lấy API access token có đúng audience; gọi route được bảo vệ và kiểm tra ma trận `401`/`403`/authorized.
4. Decode token chỉ để debug, xác nhận `alg=RS256`, `iss`, `aud`, namespaced role claim và `permissions`; backend vẫn phải verify chữ ký.
5. Dùng ID token khi gọi Supabase và xác nhận claim `role=authenticated` được áp dụng vào RLS.

Tham khảo chính thức: [Auth0 Next.js SDK](https://github.com/auth0/nextjs-auth0), [Auth0 RBAC](https://auth0.com/docs/manage-users/access-control/rbac), [Supabase Auth0 Third-Party Auth](https://supabase.com/docs/guides/auth/third-party/auth0).
