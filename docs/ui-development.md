# Hướng dẫn phát triển và làm lại giao diện FastLane

Tài liệu này giúp thành viên thay đổi web design mà không vô tình phá login/logout, API contract, CI hoặc container production.

## 1. Bản đồ phần giao diện

| Vị trí | Trách nhiệm hiện tại |
|---|---|
| `app/page.tsx` | Landing page, đọc Auth0 session trên server và truyền user vào header |
| `app/layout.tsx` | Metadata, favicon và layout gốc |
| `app/globals.css` | Tailwind layers, CSS toàn cục và hiệu ứng chữ hero |
| `components/header.tsx` | Menu responsive, trạng thái login/logout và tên người dùng |
| `components/category-card.tsx` | Thẻ danh mục |
| `components/product-card.tsx` | Thẻ sản phẩm |
| `components/footer.tsx` | Footer |
| `components/ui/button.tsx` | Variants của button dùng lại |
| `tailwind.config.ts` | Màu và shadow dùng chung |
| `public/images/` | Logo, favicon và ảnh demo |

Hiện chỉ có trang `/`. Không có `app/admin/page.tsx`, nên chưa có dashboard Admin để thêm nút “Về trang chủ”.

## 2. Ranh giới cần giữ nguyên trong PR chỉ sửa UI

Không sửa các phần sau nếu task chỉ là redesign:

- `lib/auth0.ts`;
- `middleware.ts`;
- `lib/auth/`;
- `auth0/actions/`;
- `.github/workflows/ci.yml`;
- `Dockerfile` và `compose.yaml`;
- `app/api/v1/health/route.ts`;
- `api-contract/`;
- tên và ý nghĩa của các biến trong `.env.example`.

Nếu thiết kế mới cần thay đổi một ranh giới trên, tách thay đổi thành PR riêng hoặc giải thích rõ trong PR để người phụ trách backend/security review.

## 3. Những điểm Auth0 phải được bảo toàn

`app/page.tsx` hiện là Server Component và đọc session bằng:

```tsx
const session = await auth0.getSession()
```

Khi làm lại trang chủ:

- giữ việc đọc session ở phía server;
- không đưa token hoặc toàn bộ session vào Client Component;
- giữ `/auth/login` và `/auth/logout` là liên kết `<a href="...">`;
- không tạo form thu thập mật khẩu Auth0 bên trong FastLane;
- không quyết định quyền Admin chỉ bằng cách ẩn/hiện component ở browser;
- giữ `export const dynamic = 'force-dynamic'` khi trang phụ thuộc session theo request.

Ẩn một nút không phải là authorization. API nghiệp vụ vẫn phải kiểm tra JWT, role và permission ở backend.

## 4. Quy trình redesign đề xuất

### Bước 1: Chốt phạm vi

Liệt kê các màn hình/component sẽ thay đổi và xác định rõ task có bao gồm nghiệp vụ hay chỉ trình bày. Với landing page hiện tại, ưu tiên thay đổi trong `app/page.tsx`, `components/`, `app/globals.css` và `public/images/`.

### Bước 2: Tạo branch

```powershell
git switch -c design/ten-hang-muc
```

### Bước 3: Xây component nhỏ

- tách section có trách nhiệm rõ ràng;
- dùng `components/ui/button.tsx` hoặc bổ sung variant thay vì lặp class dài;
- đưa màu/spacing tái sử dụng vào Tailwind theme hoặc CSS variable;
- ảnh tĩnh đặt trong `public/images/`, đặt tên mô tả nội dung;
- không hard-code user, role, token hoặc dữ liệu bí mật trong component.

### Bước 4: Kiểm tra responsive và accessibility

Tối thiểu kiểm tra:

- mobile khoảng 360 px;
- tablet khoảng 768 px;
- desktop 1280–1440 px;
- điều hướng bằng bàn phím;
- focus state nhìn thấy được;
- heading theo thứ tự hợp lý;
- ảnh có `alt` phù hợp;
- nút icon có `aria-label`;
- màu chữ/nền đủ tương phản;
- animation không làm nội dung chính khó đọc.

Hiệu ứng chữ hero nằm trong `.hero-sunlight`/`.hero-light`. Nếu thay hiệu ứng, nên hỗ trợ người dùng giảm chuyển động:

```css
@media (prefers-reduced-motion: reduce) {
  .hero-light {
    animation: none;
  }
}
```

### Bước 5: Kiểm tra hai trạng thái auth

1. Chưa đăng nhập: header có **Đăng nhập**.
2. Đã đăng nhập: header hiện tên/email và **Đăng xuất**.
3. Menu desktop và mobile đều truy cập được login/logout.
4. Logout quay lại trạng thái chưa đăng nhập.

### Bước 6: Chạy quality gate

```powershell
npm run verify
```

Chụp ảnh giao diện ở mobile và desktop để đính kèm pull request.

## 5. Khi triển khai dashboard Admin

Dashboard Admin là hạng mục mới, không phải phần đã tồn tại trong repo. Khi bắt đầu, nên:

1. tạo route `app/admin/page.tsx`;
2. kiểm tra session và role Admin ở server trước khi render;
3. bảo vệ từng API Admin bằng permission tương ứng, không chỉ bảo vệ trang;
4. thêm liên kết rõ ràng `href="/"` với nhãn **Về trang chủ**;
5. cung cấp logout và định danh tài khoản nhất quán với header hiện tại;
6. xác định trạng thái loading, empty, error và forbidden;
7. thêm test cho trường hợp chưa login, Customer truy cập Admin và Admin hợp lệ.

Các permission Admin đã được thiết kế trong foundation gồm:

- `dashboard:read`;
- `catalog:manage`;
- `inventory:manage`;
- `orders:fulfill`;
- `orders:read:any`;
- `promotion:manage`.

## 6. Tiêu chí review UI

Một PR UI được coi là sẵn sàng khi:

- không chứa secret hoặc credential test;
- không phá login/logout ở desktop và mobile;
- không thay đổi route Auth0;
- không phát sinh horizontal scroll ngoài khu vực chủ ý;
- nội dung chính dùng được bằng bàn phím;
- ảnh và font không làm layout shift nghiêm trọng;
- `npm run verify` thành công;
- PR có ảnh trước/sau và ghi rõ known limitations.

## Known gaps nên đưa vào backlog

- chưa có dashboard Admin và nút quay về trang chủ;
- menu landing page đang dùng nhiều `href="#"` placeholder;
- button sản phẩm chưa điều hướng đến trang chi tiết;
- dữ liệu sản phẩm đang hard-code trong `app/page.tsx`;
- chưa có Supabase data layer/RLS trong runtime;
- chưa có service worker nhưng trình duyệt có thể request `/sw.js`;
- footer còn nội dung placeholder và năm cố định.

Các gap này nên được tách thành story/task riêng để tránh một PR redesign đồng thời thay đổi authentication, data model và nghiệp vụ.
