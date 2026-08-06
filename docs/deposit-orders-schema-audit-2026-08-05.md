# Deposit orders schema audit — 2026-08-05

## Phạm vi và nguyên tắc

Audit được thực hiện ở chế độ chỉ đọc trên Supabase trước khi viết migration 035.
Migration không được xóa hàng, xóa cột hoặc sửa bất kỳ giá trị lịch sử nào trong
`deposit_orders`.

## Hiện trạng

- Tổng số đơn: **13**.
- Loại xe: **6 ô tô**, **7 xe máy điện**.
- `vehicle_variant_id`: 12/13 đơn đã có giá trị.
- `variant_id`: 7/13 đơn còn UUID lịch sử trỏ về `product_variants`.
- `product_id`: 13/13 đơn đã có giá trị.
- `idempotency_key`: 13/13 đơn đã có giá trị.
- `request_hash`: 12/13 đơn đã có giá trị.
- `contract_signed_at`: 4/13 đơn đã có giá trị.
- Mã khuyến mãi: 1/13 đơn có `promotion_code` và `promotion_id`.

Các trạng thái hiện có: `CONTRACT_SIGNED`, `PENDING_PAYMENT`, `CANCELLED`,
`COMPLETED`, `CONFIRMED`.

## Vấn đề cần sửa

1. `variant_id` là quan hệ cũ tới `product_variants`, trong khi bảng này hiện dành
   cho biến thể phụ kiện. Quan hệ xe chuẩn là `vehicle_variant_id` tới
   `vehicle_variants`.
2. Đơn chưa có snapshot có cấu trúc cho phương án pin, phí thuê, tiền bảo đảm và
   phí đổi pin tại thời điểm đặt hàng.
3. Một `contract_signed_at` trên đơn không đủ biểu diễn trường hợp xe máy thuê pin
   cần hợp đồng mua xe và hợp đồng thuê pin riêng.
4. Chưa có bản lưu nội dung/version/hash của tài liệu đã ký; nếu catalog hoặc mẫu
   hợp đồng thay đổi thì không thể tái dựng chính xác tài liệu lịch sử.

## Bất thường dữ liệu được giữ nguyên

- Một đơn **Feliz II** có thể đối chiếu duy nhất sang một hàng `vehicle_variants`
  phù hợp, nhưng migration cấu trúc không tự backfill để bảo toàn tuyệt đối dữ liệu
  ban đầu.
- Một đơn ghi **Amio S2** nhưng `vehicle_variant_id` hiện trỏ tới biến thể **Amio**.
  Không có ứng viên Amio S2 khớp tuyệt đối với toàn bộ snapshot chữ hiện có, vì vậy
  không được tự động sửa.

Hai trường hợp trên cần một migration reconciliation riêng, có xác nhận nghiệp vụ
và bản sao lưu trước khi cập nhật.

## Thay đổi của migration 035

- Chỉ tháo FK `deposit_orders_variant_id_fkey`; giữ nguyên cột và mọi UUID cũ.
- Đánh dấu `variant_id` là deprecated/read-only.
- Thêm các cột snapshot chính sách pin, tất cả nullable để không bịa dữ liệu cũ.
- Thêm `deposit_order_documents` để lưu độc lập hợp đồng mua xe, hợp đồng thuê pin
  và biên bản bàn giao pin.
- Snapshot toàn bộ bảng trước DDL và so sánh JSON từng hàng sau DDL. Có một ký tự
  hoặc giá trị cũ thay đổi thì transaction tự rollback.

## Việc chưa làm trong migration này

- Không backfill dữ liệu pin cho đơn cũ.
- Không sửa con trỏ Amio S2/Feliz II.
- Không tạo tài liệu giả cho các đơn đã ký trước đây vì không có content snapshot
  gốc để chứng minh nội dung.
- Không xóa `variant_id`; chỉ có thể xóa ở một migration tương lai sau khi hết thời
  gian tương thích và đã lưu trữ dữ liệu lịch sử.
