# Fastlane E-Commerce API Contract — Review và Verification

## 1. Trạng thái tài liệu

- Contract được kiểm tra: `openapi.yaml`.
- Phiên bản contract: `0.2.0-draft`.
- Ngày kiểm tra gần nhất: 2026-07-21.
- Nguồn yêu cầu:
  - đề bài Mini E-Commerce Platform;
  - `C:\Users\Dang\Downloads\PRD - Fastlane E-Commerce.txt`, phiên bản PRD 1.0.0;
  - Luật Tổ chức chính quyền địa phương số 72/2025/QH15.
- Phạm vi xác nhận: API contract trước khi ghép backend, Storefront, Admin, database và hạ tầng của các thành viên khác.
- Trạng thái: đủ điều kiện để mentor và các module owner review/freeze contract; chưa phải xác nhận hệ thống đã được triển khai.

Snapshot hiện tại có 28 path, 41 operation, 70 schema, 28 reusable response và 22 reusable parameter. Contract được tách nhỏ thành các module trong `components/` và `paths/`, tự động bundle thành `dist/openapi.bundle.yaml`.

## 2. Mục tiêu và ranh giới

Contract định nghĩa biên tích hợp REST `/api/v1` cho các module:

- public catalog, category, search, filter và product detail;
- customer profile và địa chỉ giao hàng mặc định;
- cart, promotion, checkout và mock payment;
- customer order history/detail;
- admin dashboard, category, product, variant, image, inventory, promotion và order;
- Auth0 JWT authentication, role và permission metadata;
- response lỗi, pagination, rate limit và quy tắc tiền VND.

Contract không triển khai:

- controller/service NestJS, DTO runtime hoặc business logic;
- PostgreSQL schema/migration/transaction;
- Redis cart session;
- Storefront/Admin UI;
- Auth0 tenant và secret/configuration thực tế;
- Docker Compose, CI/CD, monitoring hoặc deployment.

Các tính năng ngoài MVP theo PRD gồm real payment gateway, multi-currency, multi-language catalog, multi-store, mobile app, rating/review, wishlist và AI/chatbot.

## 3. Thứ tự dùng nguồn yêu cầu

| Nguồn | Vai trò | Cách sử dụng |
|---|---|---|
| Đề bài Mini E-Commerce | Xác định module bắt buộc và deliverable tuần 1 | Không mở rộng sang triển khai module khác |
| PRD Fastlane 1.0.0 | User story, functional requirement, business rule và acceptance criteria | Dùng để tạo endpoint, schema và traceability |
| Quyết định contract trong `openapi.yaml` | Làm rõ các điểm PRD mâu thuẫn hoặc chưa đủ chi tiết | Mentor/PO cần xác nhận trước khi freeze |
| `openapi.yaml` đã được duyệt | Nguồn tích hợp kỹ thuật | Backend và frontend implement theo contract này |

## 4. Các quyết định đồng bộ với PRD

| Chủ đề | Quyết định trong contract | Lý do/trạng thái |
|---|---|---|
| Authentication | Không tạo `/auth`; login, register và logout đi qua Auth0 Universal Login | Tránh nhân đôi identity flow; issuer/audience/claim URI cấu hình sau |
| Sellable unit | Variant là đơn vị bán, có SKU, attributes, giá và tồn kho | Phù hợp yêu cầu màu/phiên bản trong PRD |
| Pricebook | Một pricebook `DEFAULT_VND`; tiền là chuỗi số nguyên VND | Tránh mất chính xác floating-point |
| Sale price | `salePrice` phải nhỏ hơn `listPrice`; `effectivePrice` dùng sale nếu có | Backend phải kiểm tra invariant chéo |
| Public catalog | Chỉ trả active product và active variant | Variant active hết hàng vẫn hiển thị với `isPurchasable=false` |
| `priceRange` | Tính từ effective price của active variant, kể cả variant active đang hết hàng | Đồng nhất list, filter và sort |
| Product publication | Active product cần ít nhất một active variant và đúng một thumbnail | Tối đa một thumbnail; chọn thumbnail mới sẽ demote thumbnail cũ |
| Cart | Cart kiểm tra tồn hiện tại nhưng không reserve hàng | Checkout luôn kiểm tra lại |
| Promotion | Mỗi cart/order có tối đa một mã; hỗ trợ percentage và fixed amount | Discount không vượt subtotal; percentage làm tròn half-up đến VND |
| Checkout | Re-price, kiểm tra cart version/accepted total, giảm tồn, consume promotion, tạo order, lưu idempotency và clear cart trong một transaction | Bất kỳ lỗi nào phải rollback toàn bộ |
| Inventory timing | Giảm tồn khi commit order `Created` | PRD có mô tả mâu thuẫn giữa checkout và completed; contract chọn thời điểm chống oversell tốt hơn |
| Created stock hold | Order `Created` giữ phần tồn/promotion đã consume tới khi payment thành công hoặc Admin cancel | MVP hiện chưa có automatic expiry; đây là quyết định cần mentor/PO xác nhận |
| Mock payment | Endpoint riêng, local-only; approved chuyển `Created → Paid`, declined giữ `Created` | Không nhận card/credential thật; có idempotency replay/key-reuse rõ ràng |
| Order state | `Created → Paid → Shipped → Completed`; `Created/Paid → Cancelled` | `Completed` và `Cancelled` là terminal |
| Cancellation | Cancel `Created` hoặc `Paid` hoàn tồn và promotion usage đúng một lần | Cần transaction/concurrency test khi implement |
| Dashboard | Có contract nhưng gắn `x-prd-priority: could-have` | PRD vừa ghi Could vừa mô tả như Must |
| Delete | Product/variant/promotion dùng archive/deactivate khi cần bảo toàn lịch sử | Order snapshot không bị thay đổi |
| Shipping address | Áp dụng mô hình 2 cấp chính quyền địa phương (Luật 72/2025/QH15); `communeLevel` (COMMUNE, WARD, SPECIAL_ZONE) + `province` object, loại bỏ `district`/`ward` cũ | Đảm bảo tính pháp lý chính xác từ 01/07/2025; `BR-10` yêu cầu backend check mã vùng trả `422 ADDRESS_ADMIN_AREA_MISMATCH` khi sai |

Các quyết định trên được ghi máy đọc được ở các extension gốc như `x-business-rules`, `x-pricebook-policy`, `x-inventory-policy`, `x-order-state-machine`, `x-product-publication-policy` và `x-authorization-model`.

## 5. Độ phủ theo capability

| Capability | PRD reference chính | API group | Kết quả |
|---|---|---|---|
| Catalog/search/detail | `US-C02..C05`, `FR-PROD-*` | `/categories`, `/products` | Covered |
| Profile/address | `US-C11`, `FR-10` | `/users/me` | Covered |
| Cart | `US-C06`, `FR-CART-01` | `/cart`, `/cart/items/**` | Covered |
| Promotion customer | `US-C07`, `FR-PROM-01` | `/cart/promotion` | Covered |
| Checkout/payment | `US-C08`, `FR-ORDR-01` | `/checkout`, mock payment | Covered |
| Customer order tracking | `US-C09..C10`, `FR-ORDR-02` | `/orders`, `/orders/{orderId}` | Covered |
| Admin category/product | `US-A02..A03`, `FR-ADMN-*` | admin category/product/variant/image | Covered |
| Inventory | `US-A04`, `FR-ADMN-04` | admin variant inventory | Covered |
| Admin promotion | `US-A05`, `FR-ADMN-05` | `/admin/promotions/**` | Covered |
| Admin order | `US-A06..A08`, `FR-ADMN-06` | admin order list/detail/transition | Covered |
| Dashboard | `US-A01`, `FR-ADMN-01` | `/admin/dashboard/summary` | Contracted as Could-have |

Mỗi non-health operation còn có `x-prd-references` riêng. Bảng trên chỉ là bản tổng hợp để review nhanh.

## 6. Quy tắc kỹ thuật quan trọng

### Authentication và authorization

- API verify Auth0 JWT access token ký bằng RS256 theo issuer, audience, expiry và JWKS.
- Public health/catalog operation ghi rõ `security: []` để override global bearer security.
- Customer operation yêu cầu role `customer`.
- Admin operation khai báo bearer security, role `admin` và ít nhất một `x-required-permissions`.
- Permission semantics là AND: principal phải có mọi permission được liệt kê.
- Ownership failure trả `404` để không lộ resource của customer khác.
- Backend map `iss + sub` sang local customer; customer write request không nhận `customerId`.

### Error contract

- Envelope chuẩn là `{ "error": { "code", "message", "requestId", "fields?", "meta?" } }`.
- `error.code` là enum ổn định; client tự localize thông báo hiển thị.
- Validation field code có enum riêng.
- Reusable error response khai báo `x-error-codes` để giới hạn nhánh mà client cần xử lý.
- Mọi operation khai báo `429` và `500`; protected operation có `401/403` phù hợp.
- `429` cung cấp `Retry-After` và rate-limit headers.

### Concurrency và idempotency

- Inventory update dùng `expectedVersion`; mọi mutation tăng `inventoryVersion`.
- Checkout dùng `expectedCartVersion`, `acceptedGrandTotal` và `Idempotency-Key`.
- Mock payment cũng dùng `Idempotency-Key`; cùng fingerprint trả lại kết quả cũ, khác order/result trả `IDEMPOTENCY_KEY_REUSED`.
- Order transition nhận `expectedCurrentStatus` để chống stale update.

## 7. Quá trình review đã thực hiện

1. Đọc toàn bộ đề bài và PRD, tách Must/Should/Could và các phần ngoài phạm vi.
2. Parse YAML, kiểm tra OpenAPI 3.1, metadata, versioned server và module tags.
3. Lập gap theo user story/functional requirement và đối chiếu từng operation bằng `x-prd-references`.
4. Kiểm tra Auth0 boundary, public/protected operation, role, permission, ownership và status `401/403/404`.
5. Kiểm tra catalog DTO: product, category, specification, image, variant, price và inventory boundary.
6. Kiểm tra pricing, cart, promotion, checkout atomicity, idempotency và order state machine.
7. Tách create/patch/read schema; loại system-managed field khỏi request DTO; thêm validation và examples.
8. Kiểm tra toàn bộ local `$ref`, `operationId`, path parameter, unused component và standard error response.
9. Validate fixture hợp lệ, fixture âm và examples bằng JSON Schema draft 2020-12.
10. Lint bằng Redocly recommended rules và smoke-test sinh TypeScript bằng `openapi-typescript`.
11. Review chéo lần cuối theo PRD và các rủi ro commerce/security/codegen; sửa lại rồi chạy toàn bộ gate.

### Các vấn đề đáng chú ý đã được sửa

| Vấn đề phát hiện | Cách sửa |
|---|---|
| Auth0 nhưng contract có nguy cơ tự định nghĩa `/auth` | Xác định Universal Login là external boundary, không có backend `/auth` |
| Write/read DTO dễ trộn inventory và system field | Tách create/patch/read, dùng endpoint inventory riêng |
| Product detail dùng composition có nguy cơ xung đột `additionalProperties`/generator cũ | Flatten `ProductDetail` thành schema rõ ràng |
| Public variant visibility và `priceRange` chưa rõ | Chốt active-only, out-of-stock visibility và price basis |
| Checkout/customer workflow mâu thuẫn với quy tắc “chỉ Admin mutate” | Phân biệt direct management operation với server-owned atomic workflow |
| Mock payment có idempotency header nhưng thiếu replay/key-reuse behavior | Bổ sung semantics và `MockPaymentConflict` |
| Error enum không gắn với reusable response | Bổ sung `x-error-codes` và typed field validation code |
| Business operation thiếu `500` | Bổ sung reusable `InternalServerError` cho mọi operation |
| Admin search theo recipient/phone nhưng list item thiếu match context | Thêm `AdminOrderSummary` và `AdminOrderPageResponse` |
| Thumbnail/publication invariant chưa kín | Bổ sung policy; create payload sai bị schema từ chối bằng `400`, còn activation trên persisted product vi phạm invariant trả `422` |
| `PAYMENT_DECLINED` vừa là error vừa là kết quả `200` | Chuẩn hóa declined thành mock-payment result `200`, bỏ error code dư |

## 8. Script kiểm tra tổng thể

### Cài dependency

Yêu cầu Node.js `>=20.19.0 <21` hoặc `>=22.12.0`, cùng npm 10 trở lên. Đây là range tương thích với Redocly 2.39.0. Tại thư mục repo:

```powershell
npm ci
```

`package-lock.json` khóa phiên bản tool. `npm ci` lần đầu có thể cần mạng; các lần chạy check dùng binary local, không tự tải phiên bản mới.

### Lệnh sử dụng

Chạy tất cả gate, cũng là hành vi mặc định:

```powershell
npm run check:openapi
npm run check:openapi -- all
```

Chạy một nhóm:

```powershell
npm run check:openapi -- lint
npm run check:openapi -- refs
npm run check:openapi -- contract
npm run check:openapi -- schemas
npm run check:openapi -- codegen
```

Chạy nhiều nhóm theo thứ tự cố định:

```powershell
npm run check:openapi -- refs contract schemas
```

Xem danh sách hoặc kiểm tra file khác:

```powershell
npm run check:openapi -- --list
npm run check:openapi -- lint --spec .\openapi.yaml
```

### Ý nghĩa selector

| Selector | Nội dung |
|---|---|
| `lint` | Redocly 2.39.0 recommended lint |
| `refs` | UTF-8/YAML, duplicate key, local `$ref`, `operationId`, path parameter và unused component |
| `contract` | Required-operation coverage, định dạng PRD reference, `/api/v1`, Auth0/RBAC, request DTO boundary, typed errors, `429/500`, idempotency và policy metadata |
| `schemas` | Compile 70 component schema bằng Ajv draft 2020-12; validate examples, fixture dương và fixture âm |
| `codegen` | Sinh TypeScript bằng `openapi-typescript` 7.9.1 trong thư mục tạm rồi xóa an toàn |
| `all` | Chạy toàn bộ theo thứ tự `lint → refs → contract → schemas → codegen` |

Script chạy hết các nhóm đã chọn, tổng hợp PASS/FAIL và duration thay vì dừng ở lỗi đầu tiên.

| Exit code | Ý nghĩa |
|---|---|
| `0` | Tất cả nhóm được chọn đều pass |
| `1` | Có lỗi lint/contract/schema/codegen |
| `2` | Sai selector/option hoặc không tìm thấy spec |
| `130` | Người dùng ngắt bằng Ctrl+C |

Script không sửa `openapi.yaml`. Codegen chỉ tạo file trong OS temp và xác minh target trước khi xóa.

## 9. Kết quả kiểm tra gần nhất

Lệnh:

```powershell
npm run check:openapi -- all
```

Kết quả ngày 2026-07-21:

| Gate | Kết quả | Evidence |
|---|---|---|
| `lint` | PASS | Redocly 2.39.0, 0 error, 0 warning |
| `refs` | PASS | 28 path, 41 operation, 479 local ref được resolve; không thiếu/trùng `operationId` |
| `contract` | PASS | Required-operation coverage, định dạng PRD reference, Auth0/RBAC, DTO boundary, typed error, `429/500` và idempotency đạt cho 41 operation |
| `schemas` | PASS | 10 fixture đại diện, 12 component example, 16 response example và 13 negative fixture |
| `codegen` | PASS | `openapi-typescript` 7.9.1 sinh file TypeScript 91,961 byte trong temp |

Kết luận tự động: `PASS (5/5 groups passed)`.

## 10. Những gì kết quả PASS không chứng minh

Các gate trên xác nhận chất lượng contract tĩnh. Chúng không chứng minh:

- transaction/locking thực tế chống oversell;
- Redis cart version hoạt động đúng;
- Auth0 tenant và claims đã cấu hình đúng;
- endpoint local-only bị chặn ở production;
- search ranking/FTS cho tiếng Việt đạt chất lượng;
- backend trả đúng response trong runtime;
- mọi inline operation/parameter example trong các extension tương lai đều đúng; suite hiện tập trung vào component-level schema examples và reusable response examples;
- Storefront/Admin UX, accessibility hoặc responsive behavior;
- migration, observability, load test, security test hoặc deployment readiness.

Các mục này phải được kiểm tra ở node Backend, Frontend, QA và DevOps sau khi team tích hợp.

## 11. Rủi ro và quyết định còn mở

| Rủi ro/quyết định | Owner đề xuất | Trạng thái |
|---|---|---|
| Xác nhận dashboard là Could-have hay Must | PO/Mentor | Chờ xác nhận |
| Xác nhận `Created` không auto-expire trong MVP | PO/Mentor + Backend | Chờ xác nhận; contract đã ghi rõ behavior hiện tại |
| Auth0 issuer, audience, roles claim URI và permission assignment | Tech Lead + Backend/DevOps | Bổ sung theo môi trường |
| Bảo đảm mock-payment không bật ngoài local/demo | DevOps | Gate deployment sau |
| Transaction/idempotency persistence và restore đúng một lần | Backend + QA | Test khi implement |
| Cross-field invariant như `salePrice < listPrice`, promotion date ordering | Backend + QA | Contract mô tả; runtime phải enforce |
| Công nghệ search PostgreSQL FTS hay Elasticsearch | Tech Lead | Chưa ảnh hưởng contract hiện tại |
| Privacy/retention cho địa chỉ và số điện thoại | PO + Tech Lead | Chốt trước production |

## 12. Quy trình khi contract thay đổi

1. Cập nhật `openapi.yaml` và `x-prd-references` liên quan.
2. Nếu thêm/bỏ operation hoặc đổi public/protected boundary, cập nhật `REQUIRED_OPERATIONS` và `PUBLIC_OPERATIONS` trong checker cùng commit.
3. Chạy nhóm gần nhất với thay đổi, ví dụ `schemas` hoặc `contract`.
4. Chạy `npm run check:openapi -- all` trước khi gửi review/merge.
5. Cập nhật bảng evidence trong tài liệu này nếu snapshot thay đổi.
6. Thay đổi breaking phải được module owner review và tăng version contract phù hợp.

## 13. Handoff

- Initiative: Fastlane Mini E-Commerce.
- Node hiện tại: API contract review.
- Decision owner: Mentor/PO.
- Input: đề bài và PRD Fastlane 1.0.0.
- Output:
  - `openapi.yaml`;
  - `OPENAPI_REVIEW.md`;
  - `scripts/check-openapi.mjs`;
  - `package.json`, `package-lock.json` và `redocly.yaml`.
- Governance note: project chưa có bộ artefact `.local`; tài liệu này ghi lại decision/evidence trong phạm vi repo contract.
- Bước tiếp theo: mentor review → module-owner review → freeze baseline → backend/frontend implementation và integration QA.
