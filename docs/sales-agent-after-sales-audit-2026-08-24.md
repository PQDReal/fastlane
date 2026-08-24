# Audit khả năng truy cập after-sales của Sales Agent

Ngày kiểm tra: 24/08/2026. Branch/commit nền: `dung5@74c4d51`.

## Kết luận

Sales Agent **chưa fetch được toàn bộ dữ liệu after-sales**. Trang `/after-sales` đã đọc published read model đầy đủ, nhưng agent không dùng repository đó. Trong tám live test có dữ liệu cần trả lời:

- 1 case pass: bảo hành pin xe máy điện.
- 1 case partial: bảo hành VF 8 trả đúng con số nhưng không được ground từ published after-sales và gắn thêm link chính sách xe máy không liên quan.
- 6 case fail: bảo dưỡng ô tô, bảo dưỡng xe máy, sửa chữa, cứu hộ, xưởng dịch vụ và hướng dẫn sử dụng.

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

Như vậy các câu trả lời “FASTLANE chưa có dữ liệu” ở phần lớn case là do agent không có đường truy cập, không phải do Supabase thiếu dữ liệu.

## Ma trận live test

| Case | Agent đã làm | Đối chiếu | Kết quả |
| --- | --- | --- | --- |
| Bảo hành pin Evo | Bắt buộc gọi `search_knowledge`; trả đủ nhánh 5/8/3 năm và route thật | Khớp policy đã review | PASS |
| Bảo hành VF 8 | Gọi knowledge nhưng con số đến từ summary hard-code; thêm link policy xe máy | Con số đúng, provenance/link chưa đúng | PARTIAL |
| VF 8 2024 bảo dưỡng bao lâu/km | Manual `not_found`, knowledge không có lịch; trả “chưa tìm thấy” | Published fact có 12.000 km hoặc hàng năm | FAIL |
| Xe máy điện bảo dưỡng phanh | Trả hướng dẫn chung và nói không nên dùng mốc cố định | Published facts có 1.000 km/6 tháng và 5.000 km/6 tháng cho hai thao tác khác nhau | FAIL |
| Khoảng đến lịch sửa chữa | Knowledge trả kết quả không liên quan; agent nói thiếu dữ liệu | Published repair fact có 30 phút | FAIL |
| Thời gian phản hồi cứu hộ | Agent chỉ nói 24/7, nói không có thời gian cụ thể | Published facts có điều phối 10 phút, gọi lại và xuất phát 15 phút | FAIL |
| Xưởng xe máy tại Hồ Chí Minh | Không gọi data tool; nói chưa có địa chỉ/giờ mở cửa | Có 5 xưởng đã publish, giờ 08h00–21h00 | FAIL |
| Cổng sạc VF 8 2024 | Gọi manual rồi `not_found`; vẫn phỏng đoán “gần hông xe” | Tool không có evidence | FAIL, có hallucination sau NO_EVIDENCE |

Các case machine-readable nằm tại `lib/sales-agent/evals/fixtures/after-sales-access.json`.

## Nguyên nhân kỹ thuật

### 1. Published after-sales read model không được nối vào agent

`lib/api/after-sales-server.ts` đọc `after_sales_published_facts` và `after_sales_published_service_locations`, nhưng không có Sales Agent tool/repository nào gọi module này. Danh sách tool chỉ có catalog, promotion, accessory, knowledge và manual.

Hậu quả: maintenance, repair, rescue và workshop có dữ liệu nhưng không thể tạo evidence trong lượt agent.

### 2. Manual semantic search đang lỗi kích thước vector

RPC hiện dùng `vector(512)`, trong khi `searchUserManualRepository` tạo embedding `text-embedding-3-small` mặc định 1.536 chiều. Probe thật trả lỗi:

```text
different vector dimensions 512 and 1536
```

Agent chuyển kết quả thành `NO_MATCH`; với case cổng sạc, câu trả lời vẫn thêm một phỏng đoán vị trí dù completeness là `NO_EVIDENCE`.

### 3. Knowledge cache chỉ lấy 200/13.647 chunks

Cache dùng `.limit(200)` không có thứ tự ổn định. Mẫu live 200 chunks chỉ chứa 11 tài liệu manual, không chứa policy/after-sales documents. Bảo hành xe máy vẫn hoạt động vì có verified built-in document được ưu tiên riêng; các flow khác không có lớp bảo vệ tương tự.

### 4. Completeness đang đánh giá quá lạc quan

Maintenance, repair, rescue và workshop đều được trả về với `completeness: COMPLETE` dù agent vừa nói không có dữ liệu. Chỉ case manual được đánh dấu `NO_EVIDENCE`. Một số câu trả lời cũng để lộ JSON suggestion thô vì format model sinh ra không khớp parser.

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

Audit này chỉ đọc dữ liệu. Nó không sửa policy, không publish release và không ingest PDF.

Kết quả xác minh tại thời điểm audit: toàn bộ `lib/sales-agent` có **23 test files / 131 tests pass**; `npm run typecheck` pass. Test contract cũ cũng được cập nhật từ 7 lên đúng 8 data tools hiện có, bao gồm `search_user_manuals`.

## Thứ tự sửa đề xuất

1. Thêm một after-sales repository/tool typed đọc đúng published release và trả filter theo service type, vehicle type, model, subject và địa điểm.
2. Ground maintenance, repair, rescue và workshop từ tool mới; không copy toàn bộ read model vào prompt.
3. Đồng bộ manual query embedding về 512 chiều hoặc migration/index/RPC về 1.536 chiều, sau đó re-run semantic eval.
4. Khi tool trả `NO_MATCH`/`UNAVAILABLE`, cấm model khẳng định chi tiết và bắt composer phản ánh `NO_EVIDENCE`/`PARTIAL` đúng thực tế.
5. Tách document collections hoặc truy vấn DB theo query; không dùng một mẫu 200 chunks không thứ tự cho toàn bộ knowledge base.
6. Chỉ sau các bước trên mới thêm ingestion riêng cho PDF sổ bảo hành/HDSD nếu muốn agent đọc trực tiếp nội dung tài liệu.
