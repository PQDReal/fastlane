# Checklist dữ liệu hậu mãi

## Acquisition và coverage

- [x] Đủ đúng 10 source active trong manifest; verified dataset không chứa source ngoài scope.
- [x] Snapshot inventory phân loại tường minh source active, excluded, superseded và từ chối mọi thư mục chưa khai báo.
- [x] File lịch sử mới hơn `latest.json` chỉ được bỏ qua khi đó là acquisition attempt thất bại; raw-v2 mới hơn nhưng chưa được chọn sẽ chặn pipeline.
- [x] URL/final redirect thuộc domain VinFast chính thức và dùng HTTPS.
- [x] Browser capture HTTP 200, isolated context, không có private-network request.
- [x] Snapshot có timestamp, content hash và extraction scope.
- [x] SLA sinh `recrawlSourceIds`; worker chỉ crawl lại source lỗi/cũ.
- [x] Loại owner manual ô tô/xe máy/bus và trang đặt lịch.
- [x] Có local Playwright fallback bằng Chrome/Edge đã cài, không tải browser binary.
- [x] Bright Data Browser API là managed-browser mặc định cho mọi source cần browser; source-specific validation vẫn bắt buộc.
- [x] `402/403` không retry; `429/5xx/timeout` retry có giới hạn.
- [x] Provider health/circuit breaker được lưu riêng và không làm sai data-integrity gate.

## Asset và extraction

- [x] Asset được lọc theo vùng nội dung của từng source.
- [x] MIME được kiểm tra bằng header và magic bytes.
- [x] Content hash/dedup được kiểm tra.
- [x] PDF text layer được ưu tiên trước OCR.
- [x] PDF được tách theo trang để giữ page-level provenance.
- [x] Ảnh marketing/decorative chỉ lưu metadata; không OCR vô ích.
- [x] Failed/review-required asset chặn pipeline validation.

## Normalization và validation

- [x] Fact type, unit, subject, applicability, usage condition và action dùng vocabulary có kiểm soát.
- [x] Duration/distance/percentage/price có semantic unit validation.
- [x] Fact dedup giữ nhiều provenance thay vì xóa evidence.
- [x] `general`/`standard_use` alias chỉ hợp nhất khi khớp tuyệt đối.
- [x] Fact → PDF page/HTML snapshot → asset hash → official source resolve được.
- [x] Conflict detector kiểm tra nhiều giá trị cho cùng semantic key.
- [x] Không có VND/percentage false positive từ số điện thoại, địa chỉ hoặc OCR.
- [x] 13 semantic regression assertions pass.

## Publication

- [x] Không ghi Supabase trong pipeline hiện tại.
- [x] Không auto-publish.
- [x] V6 publication gate chặn mọi evidence chưa neo vào raw DOM/PDF; serialized-excerpt offsets không đủ điều kiện admin review.
- [x] Raw recapture đạt đủ 10/10 source; toàn bộ machine evidence có raw DOM/PDF anchor hợp lệ.
- [ ] Human sample QA và approve/reject.
- [ ] Thiết kế migration domain after-sales riêng.
- [ ] Ghi database bằng idempotent upsert sau khi migration được duyệt.

Lệnh kiểm tra tổng:

```powershell
npm run process:after-sales
npm run audit:after-sales-snapshots
npm run test:after-sales-providers
npm run test:after-sales-regressions
```

Kết quả vận hành ngày 20/08/2026: `DATA_VALID=PASS`, `SOURCE_FRESH=PASS`, `PROVIDER_HEALTH=PASS`, `HUMAN_APPROVAL=NOT_STARTED`. Bright Data đã recapture 10/10 source; snapshot lịch sử và attempt thất bại vẫn được giữ để audit nhưng không đi vào parser.
