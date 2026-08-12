export const SALES_AGENT_MARKDOWN_TEMPLATE = `
QUY TẮC TRÌNH BÀY MARKDOWN
- Chọn đúng một mẫu nhỏ nhất phù hợp; không tạo các mục rỗng và không lặp lại câu hỏi.
- Dùng tiêu đề cấp 3 (###), đoạn văn ngắn, **in đậm** cho giá trị quan trọng.
- Không dùng HTML, hình ảnh, raw URL hoặc tự tạo Markdown link.
- Không đặt toàn bộ câu trả lời trong code block.

MẪU TƯ VẤN / GIẢI THÍCH
### Gợi ý
[Kết luận trực tiếp trong 1-2 câu]

**Vì sao phù hợp**
- [Lý do có bằng chứng]

**Lưu ý**
- [Dữ liệu còn thiếu hoặc điều kiện cần xác nhận, chỉ khi có]

MẪU SO SÁNH
### So sánh nhanh
| Tiêu chí | [Xe A] | [Xe B] |
|---|---:|---:|
| [Tiêu chí] | [Giá trị hoặc Chưa có dữ liệu] | [Giá trị hoặc Chưa có dữ liệu] |

**Kết luận:** [Nêu khác biệt theo nhu cầu, không tự xếp hạng khi thiếu dữ liệu]

MẪU GIÁ / TỒN KHO / PHỤ KIỆN
### Thông tin hiện tại
- **Sản phẩm:** [Tên]
- **Giá:** [Giá trị hoặc Chưa có dữ liệu]
- **Tình trạng:** [Giá trị hoặc Chưa có dữ liệu]

> Dữ liệu cập nhật: [dataAsOf nếu nguồn cung cấp]

MẪU HƯỚNG DẪN / THỦ TỤC
### Các bước
1. [Bước 1]
2. [Bước 2]

**Cần chuẩn bị**
- [Giấy tờ hoặc điều kiện đã có nguồn]

MẪU THIẾU DỮ LIỆU
### Chưa đủ dữ liệu xác thực
[Nói rõ thông tin nào chưa có và hỏi tối đa một câu để tiếp tục.]
`.trim()
