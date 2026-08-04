# Tài khoản kiểm thử VNPAY Sandbox

> Chỉ sử dụng các thông tin dưới đây tại `https://sandbox.vnpayment.vn`.
> Không sử dụng trên production và không nhập thông tin thẻ ngân hàng thật vào môi trường kiểm thử.

Nguồn: [Demo Cổng thanh toán VNPAY](https://sandbox.vnpayment.vn/apis/vnpay-demo/)

## Thẻ ATM nội địa NCB

Thông tin dùng chung:

- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày phát hành: `07/15`

| Kịch bản | Số thẻ | OTP | Kết quả mong đợi |
| --- | --- | --- | --- |
| Thanh toán thành công | `9704198526191432198` | `123456` | Thành công |
| Không đủ số dư | `9704195798459170488` | Theo giao diện sandbox | Từ chối do không đủ số dư |
| Thẻ chưa kích hoạt | `9704192181368742` | Theo giao diện sandbox | Từ chối do chưa kích hoạt |
| Thẻ bị khóa | `9704193370791314` | Theo giao diện sandbox | Từ chối do thẻ bị khóa |
| Thẻ hết hạn | `9704194841945513` | Theo giao diện sandbox | Từ chối do thẻ hết hạn |

## Thẻ ATM nội địa qua NAPAS

- Số thẻ: `9704000000000018` hoặc `9704020000000016`
- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày phát hành: `03/07`
- OTP: `otp`
- Kết quả mong đợi: thành công

## EXIMBANK

- Số thẻ: `9704310005819191`
- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày hết hạn: `10/26`
- Kết quả mong đợi: thành công

## VISA

Thông tin dùng chung:

- CVC/CVV: `123`
- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày hết hạn: `12/26`
- Email: `test@gmail.com`
- Địa chỉ: `22 Lang Ha`
- Thành phố: `Ha Noi`

| Loại | Số thẻ | Kết quả mong đợi |
| --- | --- | --- |
| VISA không 3DS | `4456530000001005` | Thành công |
| VISA có 3DS | `4456530000001096` | Thành công |

## MasterCard

Thông tin dùng chung:

- CVC/CVV: `123`
- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày hết hạn: `12/26`
- Email: `test@gmail.com`
- Địa chỉ: `22 Lang Ha`
- Thành phố: `Ha Noi`

| Loại | Số thẻ | Kết quả mong đợi |
| --- | --- | --- |
| MasterCard không 3DS | `5200000000001005` | Thành công |
| MasterCard có 3DS | `5200000000001096` | Thành công |

## JCB

Thông tin dùng chung:

- CVC/CVV: `123`
- Tên chủ thẻ: `NGUYEN VAN A`
- Email: `test@gmail.com`
- Địa chỉ: `22 Lang Ha`
- Thành phố: `Ha Noi`

| Loại | Số thẻ | Ngày hết hạn | Kết quả mong đợi |
| --- | --- | --- | --- |
| JCB không 3DS | `3337000000000008` | `12/26` | Thành công |
| JCB có 3DS | `3337000000200004` | `12/24` | Theo dữ liệu sandbox VNPAY; có thể không còn phù hợp nếu sandbox kiểm tra hạn thẻ |

## Kiểm tra kết quả hệ thống

Sau giao dịch thành công:

- Return URL hiển thị thanh toán thành công.
- IPN trả `RspCode: 00` và `Message: Confirm Success`.
- `vnpay_checkout_attempts.status` chuyển thành `PAID`.
- `orders.status` chuyển từ `PENDING` sang `CONFIRMED`.

Các mã phản hồi thường dùng khi kiểm thử:

| Mã | Ý nghĩa |
| --- | --- |
| `00` | Thành công |
| `12` | Thẻ hoặc tài khoản bị khóa |
| `13` | Sai OTP |
| `24` | Người dùng hủy giao dịch |
| `51` | Không đủ số dư |
| `97` | Chữ ký không hợp lệ |
