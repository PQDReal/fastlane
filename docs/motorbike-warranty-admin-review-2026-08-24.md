# Admin review: bảo hành xe máy điện VinFast

Ngày đối chiếu: 24/08/2026.

Nguồn gốc: [Chính sách bảo hành xe máy VinFast](https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-xe-may).

## Kết quả đã xác minh

| Ngữ cảnh | Bảo hành xe | Bảo hành pin nguyên bản | Cách chọn |
| --- | --- | --- | --- |
| Pin LFP, hóa đơn trước 15/08/2025 | 5 năm, không giới hạn quãng đường | 5 năm, không giới hạn quãng đường | Dùng sổ LFP 5 năm được cấp theo xe |
| Pin LFP, chính sách 6 năm từ mốc 15/08/2025 | 6 năm, không giới hạn quãng đường | 8 năm, không giới hạn quãng đường | Dùng sổ chính sách 6 năm được cấp theo xe |
| Pin không phải LFP | 3 năm, không giới hạn quãng đường | 3 năm, không giới hạn quãng đường | Xác nhận công nghệ pin/ắc quy |
| Pin LFP theo mô hình đổi pin | Không suy ra từ thời hạn pin | 8 năm, không giới hạn quãng đường | Chỉ áp dụng cho pin thuộc mô hình đổi pin |

Trang chính thức gọi sổ mới là tài liệu cho xe xuất hóa đơn “sau 15/08/2025”, trong khi tên tệp chính thức ghi “từ 15/08/2025”. Vì vậy hóa đơn đúng ngày 15/08/2025 phải dùng sổ được cấp trong hồ sơ xe; hệ thống không tự chọn một nhánh.

Pin LFP khách hàng mua và lắp tại hệ thống VinFast có thời hạn 5 hoặc 8 năm tùy sổ/chính sách áp dụng. Pin không phải LFP là 3 năm, ắc quy 12V là 1 năm và phụ tùng khác là 1 năm; các mốc này không giới hạn quãng đường. Chai pin tự nhiên hoặc dung lượng tối đa giảm dần theo thời gian không thuộc bảo hành thông thường.

## Tài liệu đang liên kết

- [Sổ xe máy điện pin LFP trước 15/08/2025](https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-5-nam.pdf)
- [Sổ xe máy điện pin LFP chính sách từ/sau 15/08/2025](https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-6-nam-tu-15-8-2025_0.pdf)
- [Sổ xe máy điện pin khác](https://static-cms-prod.vinfastauto.com/250528-xmd-pin-khac.pdf)
- 40 PDF hướng dẫn sử dụng theo mẫu xe được giữ trong `lib/after-sales/motorbike-warranty-policy.ts` đúng theo danh mục hiện hành trên trang chính thức.

Hiện tại ứng dụng chỉ mở trực tiếp các PDF chính thức. Nội dung PDF chưa được crawl, chunk hoặc đưa vào knowledge của Sales Agent.

## Quy tắc Sales Agent

- Không dùng một thời hạn mặc định theo tên mẫu xe.
- Mọi câu hỏi về bảo hành, pin, ắc quy, pin thay thế hoặc đổi pin phải tra knowledge đã xác minh.
- Nếu thiếu công nghệ pin, ngày xuất hóa đơn hoặc sổ được cấp, phải trình bày các nhánh và yêu cầu đối chiếu context còn thiếu.
- Link tham chiếu nội bộ là `/after-sales?vehicle=motorbike&tab=warranty#warranty-term`; không tạo `/knowledge/...`.
- Trường bảo hành trong catalog xe máy không được đưa vào evidence cho tới khi được duyệt theo cùng context.

Migration `066_verified_motorbike_warranty_knowledge.sql` lưu trữ tài liệu legacy sai và xuất bản tài liệu đã xác minh. Migration này phải được triển khai theo quy trình database riêng; commit code không tự thay đổi Supabase.
