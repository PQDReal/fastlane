# Đánh giá chất lượng snapshot hậu mãi — 2026-08-18

| Chỉ số | Kết quả | Đánh giá |
|---|---:|---|
| Source coverage | 6/6 | PASS |
| Browserbase HTTP 200 | 6/6 | PASS |
| Official host / redirect / private-network guard | 6/6 | PASS |
| Snapshot trong SLA | 6/6 | PASS |
| Browserless service-workshop | HTTP 200, content markers 3/3 | PASS — primary managed provider |
| Local Playwright fallback | Chrome launch được, VinFast HTTP 403 | BLOCKED — `ACCESS_DENIED`, không retry |
| Browserbase provider | HTTP 402 | DEGRADED — `QUOTA_EXHAUSTED`, circuit 24 giờ |
| Asset đúng source scope | 52 | PASS |
| Asset integrity | 52/52 | PASS |
| PDF text extraction | 24/24, 570 trang | PASS |
| Ảnh cần OCR | 0 | PASS — không có ảnh bảng/chữ nghiệp vụ |
| Normalized facts | 384 từ 488 evidence | PASS |
| PDF evidence có số trang | 280/280 | PASS |
| Broken provenance | 0 | PASS |
| Semantic conflict | 0 | PASS |
| Usage alias conflict | 0 | PASS |
| Semantic regression | 13/13 | PASS |
| Auto-publish | Tắt | Đúng policy |

Snapshot last-known-good hiện tại đủ chất lượng để làm review cache và đầu vào thiết kế migration. Chúng chưa phải dữ liệu đã được admin phê duyệt: 346 fact ở `pending`, 38 fact có manual-transcription provenance ở `pending_admin_review`.

Lượt refresh source xưởng ngày 2026-08-19 bằng Browserless đạt HTTP 200. Validator riêng xác nhận đủ nội dung showroom/trạm sạc, khu vực tìm kiếm và tỉnh thành trước khi candidate thay `latest.json`. Snapshot Browserbase cũ vẫn được giữ trong lịch sử.

Các gate hiện tại: `DATA_VALID=PASS`, `SOURCE_FRESH=PASS`, `PROVIDER_HEALTH=DEGRADED` vì các fallback Browserbase/local vẫn không khả dụng, `HUMAN_APPROVAL=PENDING`. Owner manual và trang đặt lịch được loại có chủ đích, không phải lỗ hổng coverage.
