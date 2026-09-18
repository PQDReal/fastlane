# Audit khả năng truy cập after-sales của Sales Agent

Ngày kiểm tra: 24/08/2026. Baseline: `dung5@7752791`. Cập nhật sau khi triển khai bước 1–2: 24/08/2026.

## Kết luận

Sales Agent hiện **đã fetch được các luồng structured after-sales thuộc bước 1–2**: bảo hành ô tô, bảo dưỡng, sửa chữa, cứu hộ và xưởng dịch vụ. Trong tám live test có câu hỏi:

- 7 case pass: bảo hành pin xe máy điện, bảo hành VF 8, bảo dưỡng ô tô, bảo dưỡng xe máy, sửa chữa, cứu hộ và xưởng dịch vụ.
- 1 case còn fail: semantic search HDSD. Đây là bước 3, không thuộc phạm vi triển khai hiện tại.

Ba nhóm PDF chính thức hiện chỉ là link mở tài liệu. Đây là ranh giới có chủ đích, không được tính là agent đã đọc PDF.

## Dữ liệu đã có trong Supabase

Published release `after_sales_b3d5baa7e6ca3fc0b91e1b90` ngày 20/08/2026 có:

| Nhóm | Dữ liệu đã publish |
| --- | ---: |
| Warranty ô tô | 320 facts |
| Warranty xe máy điện | 6 facts legacy, hiện bị agent chặn và thay bằng policy đã review |
| Maintenance ô tô | 46 facts |
| Maintenance xe máy điện | 10 facts |
| Repair ô tô | 1 fact |
| Rescue ô tô | 9 facts |
| Xưởng dịch vụ | 163 địa điểm hoạt động |
| Xưởng xe máy điện | 8 địa điểm; 5 tại Hồ Chí Minh |
| Manual models | 25 |
| Manual articles | 1.661 |
| Manual chunks | 28.608 |

Hai tool mới chỉ đọc current published release; không đọc bảng staging hoặc facts chưa được duyệt. Sáu facts bảo hành xe máy legacy vẫn không được dùng cho câu hỏi bảo hành pin xe máy; luồng đó tiếp tục dùng policy đã review trong knowledge.

## Ma trận live test

| Case | Agent đã làm | Đối chiếu | Kết quả |
| --- | --- | --- | --- |
| Bảo hành pin Evo | Bắt buộc gọi `search_knowledge`; trả đủ nhánh 5/8/3 năm và route thật | Khớp policy đã review | PASS |
| Bảo hành VF 8 | Gọi `search_after_sales`; giữ context xe/pin nguyên bản và sử dụng tiêu chuẩn; dùng route ô tô | 10 năm hoặc 200.000 km cho cả xe và pin theo release hiện hành | PASS |
| VF 8 2024 bảo dưỡng bao lâu/km | Gọi `search_after_sales`; chọn lịch xe điện generic thay vì lịch xe xăng | 12.000 km hoặc hàng năm | PASS |
| Xe máy điện bảo dưỡng phanh | Gọi `search_after_sales`; tách dầu phanh và hệ thống phanh | 1.000 km/6 tháng và 5.000 km/6 tháng cho hai thao tác khác nhau | PASS |
| Khoảng đến lịch sửa chữa | Gọi `search_after_sales` và dùng route `repair#repair-process` | 30 phút | PASS |
| Thời gian phản hồi cứu hộ | Gọi `search_after_sales`; giữ ba hành động riêng | Điều phối 10 phút, gọi lại và xuất phát 15 phút | PASS |
| Xưởng xe máy tại Hồ Chí Minh | Gọi `find_service_locations`; báo `totalMatches=5`, liệt kê đủ 5 xưởng và giờ | 5 xưởng, 08h00–21h00 | PASS |
| Cổng sạc VF 8 2024 | Gọi manual rồi `not_found`; vẫn phỏng đoán “gần hông xe” | Tool không có evidence | FAIL, có hallucination sau NO_EVIDENCE |

Các case machine-readable nằm tại `lib/sales-agent/evals/fixtures/after-sales-access.json`.

## Nguyên nhân kỹ thuật

### 1. Published after-sales read model đã được nối vào agent

`search_after_sales` query hai pha: lần đầu chỉ lấy index fields theo service/vehicle để xếp hạng deterministic; lần hai chỉ lấy provenance của các fact IDs đã chọn. Kết quả được nhóm bằng `interval_group_id`, nên cặp thời gian/quãng đường không bị tách hoặc trộn context.

`find_service_locations` lọc release hiện hành theo loại xe, loại xưởng, tỉnh/thành, quận/huyện và trạng thái hoạt động. Mỗi fact/location có entity evidence riêng (`AFTER_SALES_FACT`, `SERVICE_LOCATION`) cùng route `/after-sales` thật.

### 2. Manual semantic search đang lỗi kích thước vector

RPC hiện dùng `vector(512)`, trong khi `searchUserManualRepository` tạo embedding `text-embedding-3-small` mặc định 1.536 chiều. Probe thật trả lỗi:

```text
different vector dimensions 512 and 1536
```

Agent chuyển kết quả thành `NO_MATCH`; với case cổng sạc, câu trả lời vẫn thêm một phỏng đoán vị trí dù completeness là `NO_EVIDENCE`.

### 3. Knowledge cache chỉ lấy 200/13.647 chunks

Cache dùng `.limit(200)` không có thứ tự ổn định. Mẫu live 200 chunks chỉ chứa 11 tài liệu manual, không chứa policy/after-sales documents. Bảo hành xe máy vẫn hoạt động vì có verified built-in document được ưu tiên riêng; các flow khác không có lớp bảo vệ tương tự.

### 4. Completeness của các luồng structured đã phản ánh evidence

Warranty ô tô, maintenance, repair, rescue và workshop hiện trả `COMPLETE` sau khi tool có evidence. Case manual vẫn trả `NO_EVIDENCE` nhưng model còn phỏng đoán vị trí cổng sạc; việc cấm suy đoán sau `NO_MATCH` thuộc bước 4.

## Test và cách tái chạy

```powershell
npm test -- --run lib/sales-agent/evals/after-sales-access.test.ts
npm run audit:sales-agent-after-sales
npm run audit:sales-agent-after-sales -- --probe-manual
```

Để chạy live cases, khởi động ứng dụng có Sales Agent rồi truyền URL:

```powershell
npm run audit:sales-agent-after-sales -- --base-url=http://127.0.0.1:3100
```

Có thể chạy riêng một case live:

```powershell
npm run audit:sales-agent-after-sales -- --base-url=http://127.0.0.1:3100 --case=motorbike-workshops-hcm
```

Audit này chỉ đọc dữ liệu. Nó không sửa policy, không publish release và không ingest PDF.

Kết quả sau bước 1–2: toàn bộ `lib/sales-agent` có **25 test files / 149 tests pass**; `npm run typecheck` pass. Contract hiện có đúng 10 data tools.

## Thứ tự sửa đề xuất

1. **Hoàn tất:** thêm repository/tool typed đọc current published facts.
2. **Hoàn tất:** ground maintenance, repair, rescue và workshop; không copy toàn bộ read model vào prompt.
3. Đồng bộ manual query embedding về 512 chiều hoặc migration/index/RPC về 1.536 chiều, sau đó re-run semantic eval.
4. Khi tool trả `NO_MATCH`/`UNAVAILABLE`, cấm model khẳng định chi tiết và bắt composer phản ánh `NO_EVIDENCE`/`PARTIAL` đúng thực tế.
5. Tách document collections hoặc truy vấn DB theo query; không dùng một mẫu 200 chunks không thứ tự cho toàn bộ knowledge base.
6. Chỉ sau các bước trên mới thêm ingestion riêng cho PDF sổ bảo hành/HDSD nếu muốn agent đọc trực tiếp nội dung tài liệu.
