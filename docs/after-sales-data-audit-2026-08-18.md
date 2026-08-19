# Audit và sửa dữ liệu hậu mãi — 2026-08-18

## Kết luận

Đã rà soát lại từ acquisition đến fact validation và sửa các lỗi scope, extraction, normalization và provenance. Data/extraction/fact validation hiện pass; pipeline tổng đang `DEGRADED` vì một source vượt SLA, Browserbase hết quota và local browser bị HTTP 403. Dữ liệu vẫn là draft chờ human review, chưa commit/push và chưa ghi Supabase.

## Sai lệch tìm thấy

1. Snapshot ban đầu gom asset dùng chung/ẩn từ toàn DOM nên 441 occurrence chứa nhiều ảnh marketing, PDF lặp và asset ngoài vùng nội dung.
2. Validator public đọc nhầm crawler output cũ có HTTP 403, tạo kết luận reject không phản ánh snapshot Browserbase hiện tại.
3. Parser coi 27 ảnh là informational và OCR dù chúng là ảnh xe/dịch vụ; kết quả số/% có nguy cơ thành fact giả.
4. Normalizer cũ nhận số điện thoại/địa chỉ thành VND, để section heading rò sang subject khác và mất provenance khi dedup.
5. `Ắc - quy` có dấu gạch nối bị hiểu thành pin cao áp; mốc bảo dưỡng chung bị gán cho component gần đó.
6. Dấu chấm trong `15.000 km` bị coi là kết thúc câu, làm mất model/subject.
7. Một câu có cả `inspect` và `replace` gán cùng action cho mọi con số.
8. PDF extraction không có số trang; khi tách trang, heading ở trang trước có thể bị mất.
9. 74 policy trùng chỉ khác nhãn `general`/`standard_use` do PDF không lặp lại heading điều kiện.
10. Refresh thất bại từng ghi đè `latest.json` hợp lệ bằng `manual_curated` fallback.
11. Browserbase HTTP 402 từng là điểm lỗi duy nhất và chưa có phân loại retry/circuit breaker.

## Sửa chữa

- Chỉ lấy `.dvhm-revamp-page` hoặc metadata-only theo source; áp rule asset riêng cho warranty/repair/rescue.
- Coverage checker kiểm SLA và sinh danh sách source cần crawl lại; owner manual và booking là exclusion rõ ràng.
- Xác minh 52 asset bằng MIME magic bytes/hash; retry failed asset riêng.
- Chỉ extract 24 policy PDF; 28 ảnh còn lại metadata-only, không OCR.
- Extract 570 trang PDF, cache theo hash và gắn `pdfPage` vào từng provenance.
- Chuẩn hóa model, subject, action, condition, applicability, unit và controlled fact type theo context câu/heading.
- Giữ toàn bộ provenance khi semantic dedup; reconcile usage alias chỉ khi key/value khớp tuyệt đối.
- Validator kiểm structural, semantic, provenance, PDF page resolution, conflict và usage alias regression.
- Refresh failure chỉ lưu attempt để audit và giữ last-known-good Browserbase snapshot; pipeline vẫn trả degraded/stale.
- Source xưởng chạy chuỗi `http → browserless_playwright → browserbase_playwright → local_playwright → last-known-good`; Browserless candidate phải pass expected-content validation.
- Provider health được lưu riêng; pipeline tách `SOURCE_FRESH` khỏi `DATA_VALID` và chạy 13 semantic regression assertions.

## So sánh trước/sau

| Chỉ số | Trước audit | Sau audit |
|---|---:|---:|
| Source snapshot thật | Có fallback/403 trong lịch sử | 6/6 Browserbase HTTP 200 |
| Asset occurrence | 441 | 52 đúng scope |
| PDF occurrence | 40 | 24 tài liệu đúng scope |
| Ảnh đưa vào OCR | 27 | 0 |
| Asset verify | 438 pass, 3 fail, 1 MIME mismatch, 283 duplicate | 52/52 pass, 0 fail/mismatch/duplicate |
| PDF page provenance | Không có | 280/280 PDF evidence có page, 570 trang indexed |
| Normalized fact | 97 bản cũ, còn sai nghĩa | 384 fact từ 488 evidence |
| Broken provenance | Chưa kiểm sâu | 0 |
| Semantic conflict | Chưa kiểm sâu | 0 |
| Usage alias conflict | Chưa kiểm | 0 |
| Parser review-required | Có | 0 |
| Semantic regression | Chưa có | 13/13 pass |

Việc giảm 441 xuống 52 asset là loại nhiễu theo scope, không phải mất dữ liệu nghiệp vụ. Nội dung text của 4 trang hậu mãi vẫn được snapshot; PDF sổ bảo hành/tài liệu ứng phó khẩn cấp đúng scope vẫn được giữ.

## Trạng thái bàn giao

- 384 fact: 346 `pending`, 38 `pending_admin_review`.
- 328 warranty, 49 maintenance, 6 rescue, 1 repair.
- 376 fact ô tô, 8 fact xe máy nằm trong chính trang bảo dưỡng.
- 170 evidence HTML, 280 evidence PDF text layer, 38 evidence manual transcription.
- Chưa tạo migration/table, chưa ghi Supabase, chưa auto-publish.
- Không commit/push snapshot hoặc output trong lượt audit này.
- Gate hiện tại sau Browserless probe: `DATA_VALID=PASS`, `SOURCE_FRESH=PASS`, `PROVIDER_HEALTH=DEGRADED`, `HUMAN_APPROVAL=PENDING`.
- Browserless source xưởng đạt HTTP 200 và content validation; Browserbase HTTP 402/local Chrome HTTP 403 không còn block freshness nhưng vẫn làm fallback health degraded.
