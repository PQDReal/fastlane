# Đóng góp cho FastLane

Trước khi bắt đầu, đọc [hướng dẫn thiết lập cho thành viên mới](docs/member-setup.md). Nếu nhiệm vụ liên quan giao diện, đọc thêm [hướng dẫn phát triển UI](docs/ui-development.md).

## Quy trình ngắn

1. Clone repository và tạo `.env.local` từ `.env.example`.
2. Tạo branch `feature/...`, `fix/...` hoặc `design/...`; không làm trực tiếp trên `main`.
3. Chỉ thay đổi các file nằm trong phạm vi task.
4. Không commit secret, token, mật khẩu test hoặc `.env.local`.
5. Chạy `npm run verify` trước khi push.
6. Mở pull request với mô tả, cách kiểm tra và ảnh trước/sau nếu sửa UI.

Nếu thay đổi Auth0, Supabase, OpenAPI, CI hoặc Docker, ghi rõ ảnh hưởng và yêu cầu người phụ trách tương ứng review.
