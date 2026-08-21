# Báo cáo crawl dữ liệu hậu mãi — 2026-08-18

## Phạm vi đã chốt

Pipeline quản lý đúng 6 source chính thức:

1. Hub Dịch vụ hậu mãi.
2. Chính sách bảo hành ô tô.
3. Dịch vụ bảo dưỡng.
4. Dịch vụ sửa chữa ô tô.
5. Thông tin cứu hộ ô tô.
6. Tra cứu xưởng dịch vụ.

Trang đặt lịch dịch vụ và mọi trang hướng dẫn sử dụng ô tô/xe máy bị loại khỏi scope. PDF sổ bảo hành và tài liệu ứng phó khẩn cấp vẫn được giữ khi chúng được liên kết trực tiếp từ trang hậu mãi tương ứng.

## Kết quả acquisition

- 6/6 source được chụp bằng session Browserbase/Playwright cô lập.
- 6/6 trả HTTP 200, có timestamp và SHA-256 content hash.
- Không source nào dùng `manual_curated` fallback trong snapshot hiện tại.
- Lượt kiểm tra ngày 2026-08-19 phát hiện source tra cứu xưởng vượt SLA 12 giờ. Refresh tự động đã chạy đúng một source: Browserbase trả HTTP 402 do hết free-plan minutes, sau đó local Chrome fallback nhận HTTP 403. Worker giữ snapshot Browserbase hợp lệ gần nhất và pipeline trả `DEGRADED` thay vì ghi đè bằng fallback.

## Kết quả asset và extraction

- 52 asset đúng scope: 24 PDF, 25 ảnh xe/dịch vụ, 3 ảnh trang trí.
- 52/52 asset xác minh thành công; 0 fetch failure, 0 MIME mismatch, 0 duplicate content.
- 24/24 PDF có text layer, tổng cộng 570 trang được lập chỉ mục.
- 0 ảnh cần OCR; ảnh còn lại chỉ lưu metadata vì không chứa bảng/chữ nghiệp vụ độc nhất.

## Kết quả chuẩn hóa

- 488 evidence thô tạo 384 business fact.
- 104 candidate trùng được hợp nhất; trong đó 74 alias `general`/`standard_use` được reconcile bằng bằng chứng khớp tuyệt đối.
- 280/280 evidence từ PDF có `pdfPage` hợp lệ.
- 0 fact cần review do parser, 0 provenance hỏng, 0 semantic conflict.
- 13/13 semantic regression assertions pass.
- Tất cả fact vẫn ở `pending` hoặc `pending_admin_review`; pipeline chưa ghi Supabase và không auto-publish.

Data/extraction validation đang pass. Sau Browserless probe ngày 2026-08-19, gate là `DATA_VALID=PASS`, `SOURCE_FRESH=PASS`, `PROVIDER_HEALTH=DEGRADED`, `HUMAN_APPROVAL=PENDING`; provider fallback vẫn degraded vì Browserbase hết quota và local Chrome bị 403. Chạy lại toàn bộ pipeline bằng:

```powershell
npm run process:after-sales
```
