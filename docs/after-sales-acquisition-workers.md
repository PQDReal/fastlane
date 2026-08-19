# After-sales acquisition workers

## Provider order

Worker thử theo thứ tự:

1. `http`.
2. `browserless_playwright` cho source `vinfast-service-workshops` khi direct fetch bị chặn.
3. `browserbase_playwright` khi Browserless không hợp lệ/không khả dụng và quota circuit cho phép.
4. `local_playwright` khi managed browser không khả dụng.
5. Giữ last-known-good; `manual_curated` attempt chỉ phục vụ audit provenance.

Với các source khác, Browserless không tham gia và thứ tự vẫn là `http → browserbase_playwright → local_playwright → last-known-good`.

Nếu refresh thất bại nhưng đã có snapshot hợp lệ, attempt lỗi chỉ được lưu theo timestamp để audit. `latest.json` giữ last-known-good snapshot và coverage báo stale. Browserless candidate chỉ hợp lệ khi HTTP 200 và `service-workshop-v1` xác nhận đủ heading showroom/trạm sạc, khu vực tìm kiếm và tỉnh thành.

Lỗi provider được phân loại trước khi retry:

- `401` → `AUTH_FAILED`, không retry.
- `402` → `QUOTA_EXHAUSTED`, không retry; mở circuit mặc định 24 giờ.
- `403` → `ACCESS_DENIED`, không retry.
- `429` → `RATE_LIMITED`, retry có giới hạn/backoff.
- `5xx`, timeout/network tạm thời → retry có giới hạn.

Có thể buộc thử lại sau khi quota được bổ sung bằng `BROWSERLESS_FORCE_RETRY=1` hoặc `BROWSERBASE_FORCE_RETRY=1`. Thời gian circuit cấu hình bằng `BROWSERLESS_QUOTA_RETRY_HOURS`/`BROWSERBASE_QUOTA_RETRY_HOURS`.

Browserless có cooldown theo từng source, mặc định `12` giờ (`BROWSERLESS_COOLDOWN_HOURS`). Sau một capture thành công, các lần chạy thủ công trong khoảng này không mở thêm managed-browser session; last-known-good vẫn được giữ. Mức 12 giờ khớp SLA 12 giờ của source xưởng và giới hạn tối đa khoảng hai phiên/ngày cho source này. Dùng `BROWSERLESS_FORCE_RETRY=1` chỉ cho refresh khẩn cấp/diagnostic.

## Browserless runtime

```powershell
$env:BROWSERLESS_API_TOKEN = '<api-token>'
npm run acquire:after-sales -- --source=vinfast-service-workshops
```

Worker dùng `playwright-core` và `chromium.connectOverCDP()`. Endpoint không chứa credential có thể cấu hình qua `BROWSERLESS_CDP_ENDPOINT`; mặc định dùng Browserless Chromium stealth endpoint. Token chỉ được gắn ở runtime và connection URL bị redaction khỏi lỗi/log.

Probe ngày 2026-08-19 đạt HTTP 200, `contentValidation=passed`, 941 ký tự title+text được kiểm tra. Snapshot mới trở thành `latest.json`; Browserbase và local fallback không bị gọi.

## Browserbase runtime

```powershell
$env:BROWSERBASE_API_KEY = '<api-key>'
$env:BROWSERBASE_PROJECT_ID = '<project-id>'
npm run acquire:after-sales
```

Worker gọi Browserbase SDK để tạo session tại runtime rồi dùng `session.connectUrl` với `playwright-core`. Không lưu `BROWSERBASE_CDP_URL` cố định.

Security baseline:

- HTTPS và official-domain allowlist.
- DNS/private-IP blocking.
- Validate navigation, redirect và subrequest.
- Browser context mới cho từng acquisition, không reuse cookie/session.
- Chặn Service Worker.
- Đóng page/context/browser/session trong `finally`.
- Không log API key hoặc connection URL.

## Local Playwright fallback

Worker dùng `playwright-core` hiện có và browser đã cài trên máy, theo thứ tự: `LOCAL_PLAYWRIGHT_EXECUTABLE_PATH`, Google Chrome, Microsoft Edge. Không tải thêm browser binary và không thêm stealth/anti-detection plugin.

```powershell
$env:LOCAL_PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe' # optional
npm run acquire:after-sales -- --source=vinfast-service-workshops
```

Local browser dùng context mới, chặn Service Worker, áp cùng official-domain/private-network guard và chỉ nhận navigation HTTP 2xx. Smoke test ngày 2026-08-19 đã launch Chrome thành công nhưng VinFast trả HTTP 403, nên provider được ghi `blocked/ACCESS_DENIED`; last-known-good vẫn được giữ.

## Output và orchestration

```text
.local/after-sales/snapshots/<source-id>/<snapshot-id>.json
.local/after-sales/snapshots/<source-id>/latest.json
.local/after-sales/acquisition-report.json
.local/after-sales/provider-health.json
.local/after-sales/coverage-report.json
.local/after-sales/pipeline-report.json
.local/after-sales/source-diagnostics/<source-id>/<provider>.json
```

Chạy một source:

```powershell
npm run acquire:after-sales -- --source=vinfast-warranty-car
```

Test từng provider độc lập, không tạo snapshot candidate:

```powershell
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=http
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=browserless
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=browserbase
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=local
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=last-known-good
```

Chạy coverage-aware end-to-end:

```powershell
npm run process:after-sales
```

Pipeline report tách riêng bốn gate: `SOURCE_FRESH`, `DATA_VALID`, `PROVIDER_HEALTH` và `HUMAN_APPROVAL`. Provider/freshness lỗi không được đổi thành lỗi integrity nếu snapshot giữ lại vẫn hợp lệ.
