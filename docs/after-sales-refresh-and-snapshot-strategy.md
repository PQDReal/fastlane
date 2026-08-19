# Chiến lược snapshot và refresh dữ liệu hậu mãi

## Snapshot contract

Mỗi source có snapshot timestamped bất biến và một `latest.json` để kiểm tra vận hành. Snapshot bắt buộc có URL chính thức, thời gian chụp, HTTP status, capture method, extraction scope, content hash, asset scope và lịch sử provider failure.

Browserless là managed-browser chính cho source xưởng dịch vụ, kết nối bằng `playwright-core`/CDP và chỉ chấp nhận response đã qua expected-content validation. Browserbase vẫn là fallback tùy chọn; local fallback dùng Chrome/Edge có sẵn. Mọi browser đều dùng session/context cô lập, chặn Service Worker/private network, validate redirect/subrequest và đóng browser trong `finally`.

## Refresh incremental

1. Coverage checker đối chiếu đủ 6 source, SLA, HTTP 200, real capture provider và extraction scope.
2. Chỉ các source trong `recrawlSourceIds` mới được snapshot lại.
3. Sau acquisition, pipeline publish review cache, parse, xác minh asset, extract, normalize và validate.
4. PDF extraction được tái sử dụng khi `sourceId + URL + contentHash + dataType` không đổi.
5. Nếu hash thay đổi, source/asset được xử lý lại và fact vẫn chờ admin review.
6. Nếu mọi provider thất bại, attempt vẫn được lưu để audit nhưng `latest.json` giữ snapshot hợp lệ gần nhất; coverage tiếp tục trả lỗi stale.

Provider order của source xưởng là `http → browserless_playwright → browserbase_playwright → local_playwright → last-known-good`. `401/402/403` không retry; `429/5xx/timeout` chỉ retry có giới hạn. Quota `402` mở circuit mặc định 24 giờ để không lặp lại request chắc chắn thất bại.

Sau capture Browserless thành công, source có cooldown mặc định 12 giờ theo `BROWSERLESS_COOLDOWN_HOURS`. Cooldown chỉ giới hạn session Browserless của source đó; `BROWSERLESS_FORCE_RETRY=1` là bypass có chủ đích.

SLA hiện tại:

- Cứu hộ: 24 giờ.
- Xưởng dịch vụ: 12 giờ.
- Bảo hành, bảo dưỡng và sửa chữa: 168 giờ.

Owner manual ô tô/xe máy và trang đặt lịch nằm trong `scopeExclusions`, không có lịch refresh riêng.

## Publication policy

Pipeline không auto-publish. Snapshot/source lỗi không được giả thành browser capture, dữ liệu cũ không bị hard-delete, và mọi thay đổi nghiệp vụ vẫn cần admin duyệt trước khi đưa vào database/customer-facing flow.

Trạng thái ngày 2026-08-19: Browserless refresh source tra cứu xưởng thành công, coverage 6/6 và `SOURCE_FRESH=PASS`. `DATA_VALID=PASS`; Browserbase vẫn `QUOTA_EXHAUSTED` và local Chrome vẫn `ACCESS_DENIED` nhưng chỉ còn là fallback.
