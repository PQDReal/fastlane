# Inventory snapshot hậu mãi

## Mục tiêu

Inventory gate bảo đảm chỉ snapshot thuộc manifest active mới được đưa qua parser, normalizer và validation. Snapshot lịch sử được giữ bất biến để audit; việc tồn tại trên đĩa không đồng nghĩa dữ liệu đủ điều kiện publish.

## Phân loại hiện tại

- 10 source active: raw-v2, có raw DOM hash, nằm trong verified dataset và tiếp tục đến trước `ADMIN_REVIEW`.
- 2 source excluded: owner manual ô tô và trang đặt lịch dịch vụ.
- 1 source superseded: `vinfast-service-centers` được thay bằng `vinfast-service-workshops`.
- 6 snapshot lịch sử mang URL cũ của `vinfast-maintenance-car`: ánh xạ sang danh tính canonical `vinfast-maintenance-car-service`, không sửa file/hash cũ.
- 14 attempt mới hơn `latest.json`: đều là acquisition attempt thất bại, không phải raw snapshot đủ điều kiện.

## Hard gates

Audit trả `REJECT` khi xảy ra một trong các trường hợp:

- Có thư mục snapshot không nằm trong manifest và không có disposition.
- Source active thiếu `latest.json`, raw-v2, raw DOM hash hoặc record tương ứng trong verified dataset.
- Snapshot excluded/superseded lọt vào verified dataset.
- Có raw-v2 hợp lệ mới hơn nhưng `latest.json` chưa chọn nó.
- Mapping URL/source lịch sử không resolve được tới source canonical đang active.

## File và lệnh

- Policy: `scripts/data/after-sales-snapshot-dispositions.json`.
- Auditor: `scripts/audit-after-sales-snapshot-inventory.mjs`.
- Report runtime: `.local/after-sales/snapshot-inventory-report.json`.
- Chạy kiểm tra: `npm run audit:after-sales-snapshots`.

Pipeline gọi audit này trước parser. Gate không approve, không ghi database và không tự publish dữ liệu nghiệp vụ.
