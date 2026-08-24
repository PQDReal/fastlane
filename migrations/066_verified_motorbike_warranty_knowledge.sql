-- Migration 066: replace the unverified mixed-vehicle warranty seed with the
-- admin-reviewed motorbike warranty policy published by VinFast on 2026-08-24.
-- This migration stores text already verified on the official policy page.
-- It intentionally does not crawl or ingest the linked PDF documents.

begin;

update public.sales_agent_knowledge_documents
set
  status = 'ARCHIVED',
  summary = 'Không sử dụng: tài liệu legacy trộn chính sách ô tô và xe máy điện, làm mất context loại pin/ngày hóa đơn.',
  updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';

update public.sales_agent_knowledge_chunks
set is_active = false
where document_id = '00000000-0000-4000-8000-000000000001';

insert into public.sales_agent_knowledge_documents (
  id,
  slug,
  title,
  category,
  status,
  published_version,
  summary,
  content_markdown,
  published_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000005',
  'chinh-sach-bao-hanh-pin-xe-may-dien-vinfast',
  'Chính sách bảo hành pin xe máy điện VinFast đã xác minh',
  'WARRANTY_BATTERY',
  'PUBLISHED',
  1,
  'Tra theo công nghệ pin, ngày xuất hóa đơn và sổ bảo hành; không dùng một mốc chung theo tên mẫu xe.',
  $markdown$# Chính sách bảo hành xe máy điện và pin VinFast

Nguồn được admin xác minh ngày 2026-08-24: https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-xe-may

## Pin LFP theo xe mới — chọn đúng sổ theo ngày xuất hóa đơn
- Xe có hóa đơn trước 15/08/2025: xe 5 năm và pin nguyên bản 5 năm, đều không giới hạn quãng đường.
- Chính sách 6 năm từ mốc 15/08/2025: xe 6 năm và pin nguyên bản 8 năm, đều không giới hạn quãng đường.
- Website gọi sổ mới là tài liệu cho xe xuất hóa đơn sau 15/08/2025, còn tên tệp chính thức ghi từ 15/08/2025. Nếu hóa đơn đúng ngày mốc, phải đối chiếu sổ được cấp cho xe.

## Pin khác và mô hình đổi pin
- Xe dùng pin không phải LFP: xe 3 năm và pin nguyên bản 3 năm, không giới hạn quãng đường.
- Pin LFP theo mô hình đổi pin: pin 8 năm, không giới hạn quãng đường; không dùng mốc này để suy ra thời hạn bảo hành toàn xe.

## Pin, ắc quy và phụ tùng khách hàng mua thay thế
- Pin LFP được mua và lắp tại hệ thống VinFast: 5 năm hoặc 8 năm tùy sổ/chính sách áp dụng.
- Pin không phải LFP: 3 năm từ ngày mua. Ắc quy 12V: 1 năm. Phụ tùng khác không gồm pin và ắc quy 12V: 1 năm. Các mốc đều không giới hạn quãng đường.
- Phụ tùng mua nhưng không được thay tại Xưởng dịch vụ/Đại lý phân phối VinFast không được bảo hành theo chính sách này.

## Giới hạn quan trọng
- Chai pin tự nhiên và dung lượng tối đa giảm dần theo thời gian không thuộc phạm vi bảo hành thông thường.
- VinFast có thể sửa chữa hoặc thay thế pin; phương pháp xử lý do VinFast quyết định.
- Chỉ tên mẫu xe như Evo là chưa đủ để chọn một mốc duy nhất: phải xét công nghệ pin, ngày xuất hóa đơn và sổ bảo hành được cấp theo xe.

## Tài liệu chính thức hiện hành
- Sổ pin LFP trước 15/08/2025: https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-5-nam.pdf
- Sổ pin LFP chính sách từ/sau 15/08/2025: https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-6-nam-tu-15-8-2025_0.pdf
- Sổ xe máy điện pin khác: https://static-cms-prod.vinfastauto.com/250528-xmd-pin-khac.pdf
- Danh mục PDF hướng dẫn sử dụng chỉ được liên kết, chưa ingest nội dung vào Sales Agent.

[Xem chính sách đã đối chiếu và tải đúng PDF](/after-sales?vehicle=motorbike&tab=warranty#warranty-term)$markdown$,
  now(),
  now()
)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  category = excluded.category,
  status = excluded.status,
  published_version = excluded.published_version,
  summary = excluded.summary,
  content_markdown = excluded.content_markdown,
  published_at = excluded.published_at,
  updated_at = excluded.updated_at;

delete from public.sales_agent_knowledge_chunks
where document_id = '00000000-0000-4000-8000-000000000005';

insert into public.sales_agent_knowledge_chunks (
  document_id,
  version,
  chunk_index,
  section_title,
  content,
  tags,
  is_active
)
values
(
  '00000000-0000-4000-8000-000000000005',
  1,
  0,
  'Pin LFP theo xe mới — chọn đúng sổ theo ngày xuất hóa đơn',
  'Xe có hóa đơn trước 15/08/2025: xe 5 năm và pin nguyên bản 5 năm, không giới hạn quãng đường. Chính sách 6 năm từ mốc 15/08/2025: xe 6 năm và pin nguyên bản 8 năm, không giới hạn quãng đường. Nếu hóa đơn đúng ngày 15/08/2025, phải đối chiếu sổ được cấp cho xe vì nhãn website ghi sau mốc còn tên tệp ghi từ mốc.',
  array['bảo hành', 'pin', 'pin lfp', 'xe máy điện', 'ngày xuất hóa đơn', '5 năm', '6 năm', '8 năm', 'evo', 'feliz', 'klara'],
  true
),
(
  '00000000-0000-4000-8000-000000000005',
  1,
  1,
  'Pin khác và mô hình đổi pin',
  'Xe dùng pin không phải LFP: xe 3 năm và pin nguyên bản 3 năm, không giới hạn quãng đường. Pin LFP theo mô hình đổi pin: pin 8 năm, không giới hạn quãng đường; không suy ra thời hạn bảo hành toàn xe từ mốc bảo hành pin đổi.',
  array['bảo hành pin', 'pin khác', 'không phải lfp', 'đổi pin', '3 năm', '8 năm'],
  true
),
(
  '00000000-0000-4000-8000-000000000005',
  1,
  2,
  'Pin, ắc quy và phụ tùng khách hàng mua thay thế',
  'Pin LFP được mua và lắp tại hệ thống VinFast: 5 năm hoặc 8 năm tùy sổ/chính sách áp dụng. Pin không phải LFP: 3 năm từ ngày mua. Ắc quy 12V: 1 năm. Phụ tùng khác không gồm pin và ắc quy 12V: 1 năm. Phụ tùng phải được thay tại hệ thống VinFast.',
  array['pin thay thế', 'ắc quy 12v', 'phụ tùng', '5 năm', '8 năm', '3 năm', '1 năm'],
  true
),
(
  '00000000-0000-4000-8000-000000000005',
  1,
  3,
  'Giới hạn và cách chọn chính sách',
  'Chai pin tự nhiên và dung lượng tối đa giảm dần theo thời gian không thuộc phạm vi bảo hành thông thường. Chỉ tên mẫu xe như Evo là chưa đủ: phải xét công nghệ pin, ngày xuất hóa đơn và sổ bảo hành được cấp theo xe.',
  array['chai pin', 'giảm dung lượng', 'điều kiện bảo hành', 'evo', 'sổ bảo hành'],
  true
),
(
  '00000000-0000-4000-8000-000000000005',
  1,
  4,
  'Nguồn và tài liệu chính thức',
  'Nguồn chính sách: https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-xe-may. FASTLANE dẫn người dùng tới /after-sales?vehicle=motorbike&tab=warranty#warranty-term để xem chính sách và mở đúng PDF. Nội dung PDF hướng dẫn sử dụng chưa được ingest vào Sales Agent.',
  array['nguồn chính thức', 'sổ bảo hành', 'hướng dẫn sử dụng', 'pdf'],
  true
);

commit;
