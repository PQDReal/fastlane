# Audit luồng hủy đơn phụ kiện và đơn đặt xe

Tài liệu này mô tả trạng thái sau migration `049_accessory_order_cancellation_audit.sql`.

## Kết luận

- Đơn đặt xe đã có command hủy theo vai trò và `deposit_order_events` append-only. Điểm thiếu trước đây là trang admin không đọc lịch sử này.
- Đơn phụ kiện trước migration 049 chỉ lưu `cancellation_reason` dạng chuỗi. Luồng admin còn truyền `customer_id` vào tham số actor của RPC cũ, vì vậy không thể dùng actor cũ để xác định người thao tác.
- Sau migration 049, hai loại đơn đều có actor type, actor user ID, mã lý do, thời điểm và event bất biến. Dữ liệu phụ kiện cũ được đánh dấu audit version 1 để không nhầm với dữ liệu xác thực mới; trường hợp không thể suy ra actor được giữ là `UNKNOWN`, không gán nhầm cho hệ thống.

## Đơn phụ kiện

### Điều kiện hủy

| Trạng thái | Khách hàng | Quản trị viên | Kết quả |
|---|---:|---:|---|
| `PENDING` | Có | Có | `CANCELLED`, không hoàn tiền |
| `PAID` | Có | Có | `CANCELLED`, chờ hoàn tiền |
| `CONFIRMED` | Có | Có | `CANCELLED`, chờ hoàn tiền |
| `READY` | Không | Không | Đơn đã bắt đầu giao |
| `DELIVERED` | Không | Không | Trạng thái kết thúc |

### Command chuẩn

Mọi yêu cầu mới gọi `cancel_accessory_order_audited` với:

- `p_actor_type`: `CUSTOMER` hoặc `ADMIN`;
- `p_actor_user_id`: `users.id` của người đang đăng nhập;
- `p_reason_code` và `p_note`;
- `p_event_key`: khóa idempotency ổn định theo đơn.

Command khóa dòng đơn, kiểm tra tài khoản active, kiểm tra role/quyền sở hữu, ghi event audit version 2, rồi gọi command cũ trong cùng transaction để giữ nguyên nghiệp vụ hoàn kho, khuyến mãi và refund status. Quyền gọi trực tiếp command cũ bị thu hồi khỏi runtime role.

### Dữ liệu truy vết

Projection trên `orders` phục vụ truy vấn nhanh:

- `cancelled_at`;
- `cancelled_by_type`;
- `cancelled_by_user_id`;
- `cancellation_reason_code`;
- `cancellation_note`;
- `cancellation_audit_version`.

`accessory_order_events` là nguồn lịch sử append-only. Event không thể update/delete và giữ actor, reason, note, event key, metadata, thời điểm.

Dữ liệu cũ dùng audit version 1. Vai trò được suy ra từ chuỗi cũ; admin ID không được bịa ra, còn thời điểm lấy từ `orders.updated_at` và được đánh dấu là suy luận.

### Hoàn tiền

Hủy và hoàn tiền là hai bước khác nhau:

1. Command hủy chuyển đơn đã thanh toán sang `refund_status = PENDING`.
2. Admin gửi yêu cầu hoàn tiền VNPay từ drawer.
3. `vnpay_refund_attempts` theo dõi `PENDING/PROCESSING/COMPLETED/FAILED`.
4. UI tự đối soát các attempt đang xử lý.

Hiện tại đơn phụ kiện chưa tự gọi VNPay ngay trong request hủy, khác với đơn đặt xe. Đây là khác biệt vận hành có chủ đích cần được xác nhận với product owner.

## Đơn đặt xe

### Điều kiện hủy

Khách hàng và admin chỉ được hủy trước khi ký tài liệu, tại các trạng thái `PENDING_DEPOSIT`, `PENDING_CONFIRMATION`, `PENDING`, `CONFIRMED`, `PENDING_CONTRACT`. Sau `CONTRACT_SIGNED` hoặc khi đã vào quy trình giao xe, command từ chối hủy trực tiếp.

### Nguồn audit

- Customer command: `cancel_deposit_order_before_signature`.
- Admin command: `admin_cancel_deposit_order_before_signature`.
- System expiry command: `expire_due_deposit_order_contracts`.
- Nguồn lịch sử: `deposit_order_events` với event `DEPOSIT_CANCELLED`; hủy tự động do hết hạn ký dùng event `CONTRACT_EXPIRED`.
- Projection: `cancelled_at`, `cancellation_reason_code`, `cancellation_note` trên `deposit_orders`.

Event lưu `actor_type` (`CUSTOMER`, `ADMIN`, `SYSTEM`) và `actor_user_id` cho actor con người. Trang admin lấy event mới nhất, nối `users.email`, và hiển thị cả email lẫn user ID.

Request hủy của khách có thể replay bằng cùng event key; replay không gửi lặp notification nhưng vẫn có thể tiếp tục bước khởi tạo refund nếu request trước dừng giữa chừng.

### Hoàn tiền

Nếu đã có giao dịch cọc thành công, command hủy đặt `refund_status = PENDING`; API sau đó tự gọi VNPay. Lỗi gọi provider không rollback việc hủy và được giữ ở trạng thái chờ để admin thử lại.

## Điểm còn cần quyết định nghiệp vụ

1. Có tự động khởi tạo refund cho đơn phụ kiện giống đơn xe hay tiếp tục yêu cầu admin xác nhận thủ công.
2. Có yêu cầu khách/admin chọn mã lý do cụ thể trên UI hay tạm dùng `other`/`admin_decision` với ghi chú chuẩn.
3. Có mở rộng `accessory_order_events` cho các event refund để thay thế dần trường `requested_by` dạng chuỗi trong bảng attempt hay không.
4. Chuẩn hóa bề mặt API: OpenAPI mô tả `POST /orders/{orderId}/cancellation` với reason và `Idempotency-Key`, còn ứng dụng hiện gọi `DELETE /api/v1/orders/{orderId}` không có request body. Command DB mới đã idempotent, nhưng contract và route vẫn cần được hợp nhất.

## Thứ tự triển khai

1. Chạy migration 049 trước. Preflight sẽ dừng toàn bộ transaction nếu schema nền hoặc command `cancel_accessory_order(uuid,uuid,text)` chưa tồn tại.
2. Sau khi migration thành công và PostgREST đã reload schema, mới triển khai application code vì API đọc trực tiếp các cột audit mới.
3. Kiểm tra một lần hủy mới từ customer và một lần từ admin trên môi trường staging; đối chiếu projection `orders` với event tương ứng trong `accessory_order_events`.
