# After-sales acquisition workers

## Provider order

Worker thử theo thứ tự:

1. `http`.
2. `brightdata_browser_api` cho tất cả source cần managed browser khi direct fetch bị chặn.
3. `browserless_playwright` khi Bright Data không hợp lệ/không khả dụng và quota circuit cho phép.
4. `browserbase_playwright` khi các managed browser trước đó không khả dụng.
5. `local_playwright` khi managed browser không khả dụng.
6. Giữ last-known-good; `manual_curated` attempt chỉ phục vụ audit provenance.

Thứ tự mặc định là `http → brightdata_browser_api → browserless_playwright → browserbase_playwright → local_playwright → last-known-good` cho mọi source. Bright Data là managed-browser mặc định mới; Browserless/Browserbase vẫn được giữ làm fallback độc lập.

Nếu refresh thất bại nhưng đã có snapshot hợp lệ, attempt lỗi chỉ được lưu theo timestamp để audit. `latest.json` giữ last-known-good snapshot và coverage báo stale. Managed-browser candidate chỉ hợp lệ khi HTTP 200 và validator tương ứng xác nhận đủ nội dung; riêng source xưởng cần đủ heading showroom/trạm sạc, khu vực tìm kiếm và tỉnh thành.

Lỗi provider được phân loại trước khi retry:

- `401` → `AUTH_FAILED`, không retry.
- `402` → `QUOTA_EXHAUSTED`, không retry; mở circuit mặc định 24 giờ.
- `403` → `ACCESS_DENIED`, không retry.
- `429` → `RATE_LIMITED`, retry có giới hạn/backoff.
- `5xx`, timeout/network tạm thời → retry có giới hạn.

Có thể buộc thử lại sau khi quota được bổ sung bằng `BROWSERLESS_FORCE_RETRY=1` hoặc `BROWSERBASE_FORCE_RETRY=1`. Thời gian circuit cấu hình bằng `BROWSERLESS_QUOTA_RETRY_HOURS`/`BROWSERBASE_QUOTA_RETRY_HOURS`.

Browserless có cooldown theo từng source, mặc định `12` giờ (`BROWSERLESS_COOLDOWN_HOURS`). Sau một capture thành công, các lần chạy thủ công trong khoảng này không mở thêm managed-browser session; last-known-good vẫn được giữ. Với source có SLA dài hơn, coverage checker vẫn quyết định có cần recrawl hay không; cooldown chỉ là lớp bảo vệ chi phí ở provider. Dùng `BROWSERLESS_FORCE_RETRY=1` chỉ cho refresh khẩn cấp/diagnostic.

## Bright Data Browser API runtime

Bright Data Browser API là provider managed-browser mặc định mới. Worker dùng `playwright-core` và `chromium.connectOverCDP()`, mở một session riêng cho từng acquisition, mở vehicle tabs/accordion/FAQ, rồi lưu raw DOM, raw text, hash và interactive-state metadata. Endpoint chỉ được chấp nhận nếu là `wss://` trên `brd.superproxy.io:9222`.

```dotenv
BRIGHTDATA_BROWSER_WS_ENDPOINT="wss://brd-customer-...:PASSWORD@brd.superproxy.io:9222"
BRIGHTDATA_FORCE_RETRY=false
BRIGHTDATA_QUOTA_RETRY_HOURS=24
```

Có thể dùng credential tách riêng thay cho endpoint đầy đủ:

```dotenv
BRIGHTDATA_BROWSER_WS_ENDPOINT=
BRIGHTDATA_BROWSER_USERNAME=brd-customer-...
BRIGHTDATA_BROWSER_PASSWORD=...
```

Worker không log endpoint/credential, validate official VinFast navigation và subrequest, không cho phép request ghi dữ liệu tới website nguồn, và chỉ chấp nhận candidate sau `brightdata-content-v1` hoặc `brightdata-service-workshop-v1`. Bright Data quota/auth failures mở circuit và không ghi đè `latest.json` hợp lệ.

Diagnostic riêng:

```powershell
npm run diagnose:after-sales-source -- --source=vinfast-service-workshops --provider=brightdata
```

## Browserless runtime

```powershell
$env:BROWSERLESS_API_TOKEN = '<api-token>'
npm run acquire:after-sales -- --source=vinfast-service-workshops
```

Worker dùng `playwright-core` và `chromium.connectOverCDP()`. Endpoint không chứa credential có thể cấu hình qua `BROWSERLESS_CDP_ENDPOINT`; mặc định dùng Browserless Chromium stealth endpoint. Token chỉ được gắn ở runtime và connection URL bị redaction khỏi lỗi/log.

Khi shared datacenter egress bị source trả `403`, có thể bật Browserless residential proxy theo cấu hình chính thức:

```dotenv
BROWSERLESS_CDP_ENDPOINT=wss://production-sfo.browserless.io/stealth
BROWSERLESS_PROXY=residential
BROWSERLESS_PROXY_COUNTRY=VN
BROWSERLESS_PROXY_STICKY=true
BROWSERLESS_PROXY_LOCALE_MATCH=true
BROWSERLESS_SESSION_TIMEOUT_MS=180000
```

`BROWSERLESS_PROXY` chỉ chấp nhận `residential` hoặc `datacenter`; country phải là ISO code hai ký tự. Worker validate các giá trị trước khi gắn vào CDP URL. Residential proxy tiêu thụ nhiều Browserless units hơn datacenter, vì vậy cấu hình này chỉ bật theo environment và không phải default trong source code.

`BROWSERLESS_SESSION_TIMEOUT_MS` giới hạn trong khoảng `30000`–`300000`. Giá trị mặc định `180000` dành cho các trang có tab/accordion; session Browserless dùng default context của kết nối đơn nhiệm để giữ launch/proxy settings.

Khi toàn bộ browser provider hết quota hoặc bị 403, lệnh `process:after-sales:pre-review` có thể dùng Jina Reader để lưu bản text đã biến đổi tại `.local/after-sales/transformed-snapshots`. Đây chỉ là fallback phục vụ extract và admin kiểm tra: không được coi là raw DOM, không được neo evidence publication, không được đưa vào public API. Validator bắt buộc giữ `publicationEligible=false` và loại các khối/link hướng dẫn sử dụng ngoài scope.

Browserless capture dùng `domcontentloaded` với một hydration wait ngắn thay cho `networkidle`. Các trang VinFast duy trì nhiều request nền, nên chờ `networkidle` có thể chiếm hết session ngắn trước khi worker kịp mở tab/accordion và lưu raw DOM. Browserbase/local vẫn giữ navigation strategy mặc định độc lập.

Source có `scope.modelScope=navigation_hub_only` chỉ capture một trạng thái body đầy đủ và các link chính thức; worker không click các `data-vehicle`/accordion toàn cục của header hoặc catalog. Các source chính sách chuyên biệt vẫn mở vehicle tabs và controls theo cấu hình manifest.

Interactive selectors loại trừ `header`, `nav` và `.dvhm-mega-menu`. Vì vậy các nút chuyển dòng xe của mega-menu không bị nhầm thành vehicle tab của nội dung hậu mãi; accordion/FAQ trong phần nội dung vẫn được mở và lưu metadata.

Crawler discovery legacy (`crawl:after-sales-discovered`) cũng khởi tạo Bright Data trước; chỉ fallback sang Browserless/Browserbase khi provider trước đó chưa cấu hình hoặc không thể mở CDP session.

Để buộc recapture raw interactive content cho toàn bộ 6 source, dùng `npm run process:after-sales:raw-recapture`. Chế độ này bỏ qua HTTP shortcut, mở Bright Data trước, lần lượt mở vehicle tab/accordion, lưu `rawDomHtml`, `rawDomText`, `rawDomTextHash` và metadata state; Browserless/Browserbase/local chỉ là fallback.

## Remote runner cho raw recapture

Nếu môi trường local chặn outbound WebSocket/HTTP, không nên tiếp tục retry tại local. Repository có workflow thủ công `.github/workflows/after-sales-raw-recapture.yml` để chạy trên GitHub-hosted runner có outbound network.

Thiết lập repository secret `BROWSERLESS_API_TOKEN` trong GitHub:

```text
Settings → Secrets and variables → Actions → New repository secret
Name: BROWSERLESS_API_TOKEN
Value: <api-token>
```

`BROWSERLESS_CDP_ENDPOINT` là secret tùy chọn; nếu bỏ trống, worker dùng endpoint Browserless mặc định. Chạy workflow `After-sales raw recapture` bằng `workflow_dispatch`. Workflow chỉ upload artifact chứa snapshot/report và các intermediate data; không publish, không approve và không ghi database.

Sau khi tải artifact về workspace, chạy lại hard gate:

```powershell
npm run validate:after-sales-normalized-v6
npm run build:after-sales-review -- --normalized=.local/after-sales/after-sales-normalized-v6.json
```

Review dataset chỉ được tạo khi raw DOM/PDF evidence đã neo đầy đủ (`unverifiedEvidence = 0`) và publication status chuyển sang `pending_admin_approval`. Nếu workflow vẫn thất bại do provider, artifact failure report được giữ lại để điều tra; snapshot cũ không bị thay thế bằng dữ liệu giả.

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

## Remote snapshot worker

Khi local egress không mở được `brd.superproxy.io:9222`, worker có thể chạy trên Railway với filesystem volume mount tại `/app/.local/after-sales`. Worker mặc định chạy `--raw-recapture --reuse-verified-assets --stop-before-admin-review` và không publish/approve/ghi database.

Với Railway Free/serverless, cấu hình service thành Cron Job thay vì để process ngủ trong container: đặt `AFTER_SALES_REMOTE_WORKER_SINGLE_RUN=true`, `AFTER_SALES_ACQUISITION_FORCE_EXIT=true` và cron schedule `0 */12 * * *` (UTC). Force-exit chỉ diễn ra sau khi các snapshot/report đã được ghi đồng bộ; mục đích là đóng các handle WebSocket còn sót của remote CDP để lần cron sau không bị bỏ qua.

```dotenv
AFTER_SALES_REMOTE_WORKER_INTERVAL_HOURS=12
AFTER_SALES_REMOTE_WORKER_SINGLE_RUN=false
AFTER_SALES_REMOTE_WORKER_RAW_RECAPTURE=true
AFTER_SALES_ACQUISITION_FORCE_EXIT=false
```

Khi cần chạy lại parser/normalizer/validation từ volume mà không recapture toàn bộ source, tạm đặt `AFTER_SALES_REMOTE_WORKER_RAW_RECAPTURE=false`. Coverage gate vẫn tự recrawl source bị thiếu, stale hoặc sai URL; các source hợp lệ còn lại được tái sử dụng. Sau normalization, worker luôn lưu `.local/after-sales/normalized-checkpoint.json` để chẩn đoán được cả khi regression gate dừng pipeline.

Log worker chỉ ghi lifecycle/stage summary; raw snapshot và pipeline reports nằm trong volume để admin tải về kiểm tra.

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
