# After-sales admin approval và Supabase publication

## Trạng thái baseline hiện tại

Release local mới nhất đã qua admin review nhưng **chưa được publish lên Supabase**:

```text
Hard gates:          12/12 PASS (100%)
Official sources:    10/10 PASS
Verified assets:     71/71 PASS
Normalized facts:   392/392 approved
Evidence records:   535/535 retained
Approval events:    392 pending -> approved
Service locations:  163/163 approved
Semantic conflicts: 0
Validation errors:  0
Supabase writes:     0
```

`100%` ở đây có nghĩa là toàn bộ tiêu chí kiểm chứng được của release hiện tại đều đạt. Đây không phải tuyên bố dữ liệu sẽ đúng vĩnh viễn: khi VinFast thay đổi nội dung, snapshot mới phải đi lại toàn bộ pipeline và tạo release/hash mới.

Cảnh báo duy nhất được chấp nhận có chủ ý:

```text
Nguồn locator không công bố capability bảo hành/bảo dưỡng/sửa chữa chi tiết
cho từng địa điểm. Dataset chỉ publish general_after_sales và
capabilityGranularity=location_category_only; hệ thống không được suy diễn thêm.
```

## Luồng và ranh giới quyền hạn

```text
Crawler / worker
  -> Raw snapshot
  -> Parser
  -> Normalizer
  -> Validation
  -> Read-only delegated admin review
  -> Explicit release approval
  -> Atomic Supabase publisher
  -> Admin-only read model
```

Worker acquisition chỉ tạo artifact và status. Worker không có Supabase service-role key, không được approve, publish, sửa nội dung nội bộ hay gọi RPC publication.

Approval được ghi rõ là `delegated_admin_agent` theo ủy quyền trực tiếp của admin; không giả danh human reviewer. Mỗi fact có projection hiện tại và một event append-only:

```text
approval_status: approved
reviewer_id
reviewed_at
approved_by
approved_at
approval_note

event: pending -> approved
```

## Hard gates của release

Release chỉ được tạo khi tất cả gate sau đều `PASS`:

1. Review dataset đủ số lượng và identity không trùng.
2. Normalized v6 và review dataset parity tuyệt đối ở mọi semantic field/evidence.
3. Staging ở trạng thái sạch: mọi fact còn `pending`, chưa có approval lẫn lộn.
4. Pipeline, source freshness và provider health đều `PASS`.
5. Raw evidence validation không có unverified evidence, warning hoặc conflict.
6. Asset verification không có fetch failure hoặc MIME mismatch.
7. Snapshot inventory không có source thiếu, snapshot lạ hoặc bản hợp lệ mới hơn bị bỏ qua.
8. Toàn bộ regression assertion đạt.
9. Delegated admin review bao phủ mọi fact, không còn human queue/blocker/conflict.
10. Mọi evidence dùng URL VinFast chính thức và còn excerpt/source value.
11. Service locations đạt policy no-inference và không chứa field nội bộ/Salesforce.
12. Persistence audit đạt idempotency, lifecycle, FK và contradiction checks.

Các hash SHA-256 trong manifest khóa chính xác normalized input, review input, report, approved facts, evidence và service locations. Sửa một byte sau approval làm publisher trả `REJECT`.

## Artifact local

```text
.local/after-sales/release-readiness-report.json
.local/after-sales/approved-release.json
.local/after-sales/releases/<release-id>/release-manifest.json
.local/after-sales/releases/<release-id>/inputs/*.json
.local/after-sales/releases/<release-id>/review-dataset.json
.local/after-sales/releases/<release-id>/service-locations.json
.local/after-sales/releases/<release-id>/release-verification-report.json
.local/after-sales/supabase-publish-report.json
```

`approved-release.json` chỉ là pointer tới release bất biến mới nhất. Các release cũ và toàn bộ input report đúng tại thời điểm approval được giữ lại để audit; publisher luôn xác minh pointer hash trước khi dùng.

## Supabase schema

Hai migration cần được review/apply theo thứ tự:

```text
migrations/060_after_sales_persistence.sql
migrations/061_after_sales_release_publication.sql
```

Schema gồm:

| Object | Vai trò |
|---|---|
| `after_sales_sources` | Metadata của 10 nguồn chính thức và snapshot |
| `after_sales_assets` | 71 asset đã verify |
| `after_sales_facts` | Current approved fact projection, gồm battery chemistry và release ID |
| `after_sales_fact_evidence` | 535 fact-evidence relationships cùng raw provenance |
| `after_sales_fact_approvals` | 392 approval event append-only |
| `after_sales_service_locations` | 163 địa điểm dịch vụ ở scope category-only |
| `after_sales_publication_releases` | Manifest/hash/trạng thái mỗi publication release |
| `publish_after_sales_release(jsonb)` | RPC service-role-only, atomic và idempotent |

RLS được bật. `anon` và `authenticated` không có quyền trực tiếp trên bảng, view hay RPC. Quyền `INSERT/UPDATE/DELETE/TRUNCATE` trực tiếp của `service_role` trên các bảng after-sales cũng bị revoke; mutation chỉ đi qua RPC atomic. Các view published hiện chỉ cấp `SELECT` cho `service_role`; public API phải đi qua backend/read model được thiết kế riêng sau này.

RPC thực hiện toàn bộ source -> asset -> fact -> evidence -> approval -> location trong một PostgreSQL transaction. Nếu một row lỗi, toàn bộ lần publish rollback. Gọi lại đúng release/hash là idempotent; dùng cùng release ID với payload khác bị chặn.

## Lệnh vận hành

Kiểm tra read-only:

```powershell
npm.cmd run check:after-sales-release
```

Tạo approval release mới (chỉ khi admin thực sự ủy quyền):

```powershell
npm.cmd run approve:after-sales-release -- `
  --reviewer-id=<admin-or-delegated-agent-id> `
  --note="Lý do và phạm vi duyệt"
```

Dry-run publisher, không kết nối Supabase và luôn ghi `writes: 0`:

```powershell
npm.cmd run publish:after-sales-supabase
```

Sau khi cả migration `060` và `061` đã được apply/review, publish thật yêu cầu đồng thời `--apply`, service-role key và release ID chính xác:

```powershell
npm.cmd run publish:after-sales-supabase:apply -- `
  --release-id=<release-id-trong-approved-release.json>
```

Có thể đặt `AFTER_SALES_PUBLISH_RELEASE_ID` ở server environment thay cho CLI argument. Biến này chỉ là confirmation token; `SUPABASE_SERVICE_ROLE_KEY` vẫn phải giữ server-side và không bao giờ dùng prefix `NEXT_PUBLIC_`.

`npm run import:after-sales -- --dry-run` giờ mặc định từ chối dataset còn `pending`. Chỉ dùng `--allow-pending-review-plan` khi cần audit kiến trúc import trước approval; chế độ đó không cấp quyền publish.
