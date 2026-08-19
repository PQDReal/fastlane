# After-sales human approval và persistence

## Baseline đóng băng

Acquisition, extraction, normalization và validation hiện được coi là frozen:

- Pipeline: `PASS`.
- `SOURCE_FRESH`: `PASS`, 6/6 source.
- `DATA_VALID`: `PASS`.
- 52/52 asset hợp lệ.
- 384 normalized business facts.
- 488 evidence/provenance records.
- 13/13 semantic regressions và provider tests pass.

Thay đổi parser, normalizer hoặc provider chỉ được mở lại khi có regression tái hiện được.

## Approval model

Approval nằm trên normalized business fact, không nằm độc lập trên từng evidence. Mỗi fact có projection:

```text
approval_status: pending | approved | rejected
reviewer_id
reviewed_at
approved_by
approved_at
approval_note
```

Mỗi evidence vẫn giữ toàn bộ provenance: `sourceId`, source URL, snapshot hash, captured time, asset URL/hash, PDF page, extraction method, confidence và excerpt. Một fact có thể có nhiều evidence; một evidence có thể hỗ trợ nhiều fact.

Các quyết định thay đổi được lưu append-only trong `after_sales_fact_approvals`. Rerun pipeline không được chuyển `approved` hoặc `rejected` về `pending`.

## Review dataset

Tạo dataset local:

```powershell
npm run build:after-sales-review
```

Output:

```text
.local/after-sales/review-dataset.json
```

Dataset hiện có 6 source, 52 asset, 384 facts và 488 evidence. Reviewer chỉ cần xem fact, giá trị/điều kiện, confidence và danh sách evidence; không cần mở lại 570 trang PDF. Evidence PDF có `pdfPage` và liên kết đến asset đã verify.

Approval action sau này phải gọi `applyApprovalCommand` với reviewer identity và note; không sửa trực tiếp normalized JSON.

Evidence excerpt được tạo bởi `after-sales-evidence-context-v1`: excerpt dừng tại sentence/block hiện tại, có conditional boundary ở blank line/list/section và ở line break của HTML snapshot. Có thể vượt nhẹ giới hạn ký tự trong cùng sentence, nhưng không được vượt sang block tiếp theo; `contextIndex` lưu source/excerpt/match offsets và cờ `crossedFutureBoundary=false` để reviewer kiểm tra.

## Supabase schema

Migration thiết kế nằm tại [060_after_sales_persistence.sql](../migrations/060_after_sales_persistence.sql). Migration chưa được apply.

| Table | Vai trò | Identity |
|---|---|---|
| `after_sales_sources` | 6 official source/snapshot metadata | `source_id` PK, `source_url` unique |
| `after_sales_assets` | 52 verified PDF/image asset | deterministic `asset_id`, unique source/url/hash |
| `after_sales_facts` | 384 normalized facts + current approval projection | existing stable `fact_id`, `canonical_key` unique |
| `after_sales_fact_evidence` | 488 fact-to-provenance links | `(fact_id, evidence_id)` PK |
| `after_sales_fact_approvals` | approval/rejection transition history | UUID event PK, FK `fact_id` |

`after_sales_fact_review_queue` là view dành cho reviewer, gom fact hiện tại cùng evidence JSON. RLS được bật và chỉ `service_role` được cấp quyền trong migration draft; chưa có customer-facing read policy.

## Importer và idempotency

Dry-run:

```powershell
npm run import:after-sales -- --dry-run
```

Kết quả baseline:

```text
sources:    6 inserts
assets:    52 inserts
facts:    384 inserts
evidence: 488 inserts
approvals: 0 inserts
conflicts: 0
rejectedWrites: 0
writes: 0
decision: READY
```

Identity được tính deterministic từ pipeline facts/provenance:

- Fact: giữ `factId` hiện có, được normalizer tạo từ `canonicalKey`.
- Asset: hash của `sourceId + asset URL + content hash`.
- Evidence: hash của provenance source/snapshot/asset/page/excerpt.
- Fact/evidence relationship: `(factId, evidenceId)`.

Importer bảo toàn approval đã có trong database khi pipeline output mới vẫn để `pending`. Import lại cùng output phân loại tất cả row là `unchanged`, không duplicate và không xóa provenance.

Actual Supabase write hiện bị khóa có chủ ý. Trước lần import đầu tiên cần đạt:

```text
SOURCE_FRESH     PASS
DATA_VALID       PASS
HUMAN_APPROVAL   PASS
IMPORT_DRY_RUN   PASS
MIGRATION_APPLIED AND REVIEWED
```
