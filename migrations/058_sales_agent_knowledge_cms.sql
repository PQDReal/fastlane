-- Migration 058: Sales Agent Knowledge Base CMS & Chunks
-- Provides versioned knowledge publication with cascade deletion and full-text keyword indexing.

create table if not exists public.sales_agent_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  slug varchar(200) not null unique,
  title varchar(255) not null,
  category varchar(64) not null,
  status varchar(32) not null default 'DRAFT',
  published_version integer not null default 0,
  content_markdown text not null,
  summary text,
  author_email varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint sales_agent_knowledge_documents_category_check
    check (category in ('WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING')),
  constraint sales_agent_knowledge_documents_status_check
    check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

create table if not exists public.sales_agent_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sales_agent_knowledge_documents(id) on delete cascade,
  version integer not null,
  chunk_index integer not null,
  section_title varchar(255) not null,
  content text not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sales_agent_knowledge_chunks_doc_ver_idx_unique
    unique (document_id, version, chunk_index)
);

create index if not exists idx_knowledge_docs_category_status
  on public.sales_agent_knowledge_documents (category, status);

create index if not exists idx_knowledge_chunks_doc_active
  on public.sales_agent_knowledge_chunks (document_id, is_active);

create index if not exists idx_knowledge_chunks_tags_gin
  on public.sales_agent_knowledge_chunks using gin (tags);

-- Seed initial official VinFast knowledge documents
insert into public.sales_agent_knowledge_documents
  (id, slug, title, category, status, published_version, summary, content_markdown, published_at)
values
(
  '00000000-0000-4000-8000-000000000001',
  'chinh-sach-bao-hanh-xe-dien-vinfast',
  'Chính sách bảo hành ô tô & pin xe điện VinFast',
  'WARRANTY_BATTERY',
  'PUBLISHED',
  1,
  'Quy định chi tiết về thời hạn bảo hành xe 10 năm/200.000km và chính sách bảo hành pin cao áp không giới hạn km.',
  '# Chính Sách Bảo Hành Xe Điện VinFast

## 1. Thời hạn bảo hành xe
- Các dòng ô tô điện VinFast (VF 5, VF 6, VF 7, VF 8, VF 9, VF e34) được áp dụng chính sách bảo hành chính hãng **10 năm hoặc 200.000 km** (tùy điều kiện nào đến trước).
- Dòng xe mini-SUV VinFast VF 3 được bảo hành chính hãng **7 năm hoặc 160.000 km**.
- Các dòng xe máy điện (Evo 200, Feliz S, Klara S, Vento S, Theon S) được bảo hành **5 năm hoặc không giới hạn số km**.

## 2. Chính sách bảo hành pin cao áp
- Đối với khách hàng mua xe kèm pin: Pin cao áp được bảo hành **10 năm không giới hạn số km** cho các dòng ô tô VF 5, VF 6, VF 7, VF 8, VF 9; và **8 năm không giới hạn km** cho VF 3.
- Đối với khách hàng thuê pin: VinFast cam kết bảo dưỡng, sửa chữa và thay mới pin miễn phí hoàn toàn khi dung lượng tiếp nhận sạc tối đa (SoH) giảm xuống dưới 70%.

## 3. Dịch vụ cứu hộ & sạc lưu động
- Dịch vụ cứu hộ 24/7 hoàn toàn miễn phí trong suốt thời gian bảo hành.
- Hỗ trợ cứu hộ pin lưu động (Mobile Charging) và sửa chữa lưu động (Mobile Service) tại 63 tỉnh thành trên toàn quốc.',
  now()
),
(
  '00000000-0000-4000-8000-000000000002',
  'chinh-sach-thue-pin-va-he-thong-tram-sac',
  'Chính sách thuê pin & Hệ thống trạm sạc V-GREEN',
  'WARRANTY_BATTERY',
  'PUBLISHED',
  1,
  'Thông tin các gói thuê pin linh hoạt/cố định và mạng lưới trạm sạc xe điện V-GREEN toàn quốc.',
  '# Chính Sách Thuê Pin & Mạng Lưới Trạm Sạc

## 1. Các gói thuê pin ô tô điện
- Gói di chuyển dưới 3.000 km/tháng: Mức phí thuê pin tiết kiệm phù hợp cho nhu cầu di chuyển gia đình và đô thị.
- Gói di chuyển không giới hạn km: Mức phí cố định hàng tháng, không phát sinh chi phí phụ trội, thích hợp cho khách hàng di chuyển nhiều hoặc kinh doanh dịch vụ.

## 2. Hệ thống trạm sạc V-GREEN
- Mạng lưới trạm sạc xe điện phủ khắp 63 tỉnh thành, các tuyến cao tốc, quốc lộ, trung tâm thương mại và trạm dừng nghỉ.
- Chuẩn sạc quốc tế CCS2 với đa dạng công suất: Sạc thường AC 7kW - 11kW, Sạc nhanh DC 30kW - 60kW, và Sạc siêu nhanh DC 150kW - 250kW (sạc từ 10% đến 70% chỉ trong khoảng 15-25 phút).

## 3. Chi phí sạc điện
- Đơn giá sạc điện được niêm yết minh bạch theo biểu giá điện hiện hành và thanh toán trực tiếp qua ứng dụng VinFast / thẻ thanh toán.',
  now()
),
(
  '00000000-0000-4000-8000-000000000003',
  'quy-trinh-dat-coc-va-nhan-xe-fastlane',
  'Quy trình đặt cọc online & Bàn giao xe tại FASTLANE',
  'DEPOSIT_DELIVERY',
  'PUBLISHED',
  1,
  'Hướng dẫn các bước đặt cọc xe trực tuyến, ký hợp đồng điện tử và nhận xe tại showroom gần nhất.',
  '# Quy Trình Đặt Cọc & Nhận Xe FASTLANE

## 1. Các bước đặt cọc xe trực tuyến
- Bước 1: Chọn mẫu xe, phiên bản, màu ngoại thất và tùy chọn pin/phụ kiện trên hệ thống FASTLANE.
- Bước 2: Nhập thông tin chủ xe (Họ tên, CCCD/CMND, Số điện thoại và Địa chỉ).
- Bước 3: Xác thực mã OTP qua điện thoại để tạo hợp đồng đặt cọc điện tử.
- Bước 4: Thanh toán tiền đặt cọc an toàn qua cổng thanh toán trực tuyến (VNPAY / Thẻ tín dụng).

## 2. Số tiền đặt cọc quy định
- Đặt cọc dòng xe VF 3: 15.000.000 VNĐ / xe.
- Đặt cọc các dòng ô tô VF 5, VF 6, VF 7: 30.000.000 VNĐ / xe.
- Đặt cọc dòng xe phân khúc cao cấp VF 8, VF 9: 50.000.000 VNĐ / xe.
- Đặt cọc xe máy điện: 2.000.000 VNĐ / xe.

## 3. Thủ tục bàn giao xe
- Sau khi đặt cọc, tư vấn viên FASTLANE sẽ liên hệ trong vòng 24 giờ để xác nhận tiến độ xuất xưởng và hoàn tất thủ tục đăng ký xe.
- Khách hàng có thể lựa chọn nhận xe tại Showroom FASTLANE gần nhất hoặc giao xe tận nhà theo yêu cầu.',
  now()
),
(
  '00000000-0000-4000-8000-000000000004',
  'chinh-sach-tra-gop-va-uu-dai-tai-chinh',
  'Chính sách mua xe trả góp & Ưu đãi tài chính FASTLANE',
  'PROMOTIONS_FINANCING',
  'PUBLISHED',
  1,
  'Chương trình hỗ trợ vay vốn ngân hàng tới 80% giá trị xe, lãi suất ưu đãi và thủ tục phê duyệt nhanh chóng.',
  '# Chính Sách Mua Xe Trả Góp & Ưu Đãi Tài Chính

## 1. Gói vay mua xe trả góp
- Hỗ trợ hạn mức vay lên đến **80% giá trị xe**.
- Thời hạn vay linh hoạt từ **1 năm đến 8 năm** (tối đa 96 tháng).
- Hợp tác cùng các ngân hàng đối tác lớn (Vietcombank, Techcombank, BIDV, MBBank, VPBank...).

## 2. Lãi suất & Phương thức thanh toán
- Lãi suất ưu đãi cố định trong 2 năm đầu tiên theo các chương trình hợp tác của VinFast và ngân hàng đối tác.
- Phương thức trả góp tính theo dư nợ giảm dần, giảm thiểu áp lực tài chính hàng tháng.

## 3. Hồ sơ và thủ tục phê duyệt
- Khách hàng cá nhân: CCCD gắn chip, xác nhận độc thân/kết hôn, chứng minh thu nhập (sao kê lương hoặc hợp đồng lao động).
- Khách hàng doanh nghiệp: Đăng ký kinh doanh, báo cáo tài chính 6 tháng gần nhất.
- Thời gian duyệt hồ sơ nhanh chóng: Phê duyệt online trong vòng 4 - 8 giờ làm việc.',
  now()
)
on conflict (slug) do nothing;

-- Seed Chunks for Published Documents
insert into public.sales_agent_knowledge_chunks
  (document_id, version, chunk_index, section_title, content, tags, is_active)
values
(
  '00000000-0000-4000-8000-000000000001',
  1,
  0,
  'Thời hạn bảo hành xe',
  'Các dòng ô tô điện VinFast (VF 5, VF 6, VF 7, VF 8, VF 9, VF e34) được áp dụng chính sách bảo hành chính hãng 10 năm hoặc 200.000 km. VF 3 bảo hành 7 năm hoặc 160.000 km. Xe máy điện bảo hành 5 năm không giới hạn km.',
  array['bảo hành', 'thời hạn', '10 năm', 'vf3', 'vf5', 'vf6', 'vf7', 'vf8', 'vf9', 'xe máy điện'],
  true
),
(
  '00000000-0000-4000-8000-000000000001',
  1,
  1,
  'Chính sách bảo hành pin cao áp',
  'Pin mua kèm xe bảo hành 10 năm không giới hạn km cho VF 5, VF 6, VF 7, VF 8, VF 9; và 8 năm cho VF 3. Khách hàng thuê pin được bảo dưỡng, thay thế miễn phí khi dung lượng nạp xả tối đa dưới 70%.',
  array['pin', 'pin cao áp', 'bảo hành pin', 'thuê pin', 'mua pin', 'chai pin', '70%'],
  true
),
(
  '00000000-0000-4000-8000-000000000001',
  1,
  2,
  'Dịch vụ cứu hộ & sạc lưu động',
  'Cứu hộ 24/7 miễn phí trong suốt thời gian bảo hành. Dịch vụ sạc pin lưu động Mobile Charging và sửa chữa lưu động Mobile Service phủ khắp 63 tỉnh thành.',
  array['cứu hộ', 'sạc lưu động', 'mobile service', '24/7', 'sửa chữa lưu động'],
  true
),
(
  '00000000-0000-4000-8000-000000000002',
  1,
  0,
  'Các gói thuê pin ô tô điện',
  'Khách hàng có thể chọn gói thuê pin di chuyển dưới 3.000 km/tháng tiết kiệm hoặc gói không giới hạn km cố định hàng tháng, không phụ phí phát sinh.',
  array['thuê pin', 'gói cước', '3000km', 'không giới hạn', 'chi phí thuê pin'],
  true
),
(
  '00000000-0000-4000-8000-000000000002',
  1,
  1,
  'Hệ thống trạm sạc V-GREEN',
  'Trạm sạc V-GREEN phủ khắp 63 tỉnh thành, cao tốc, quốc lộ và trung tâm thương mại. Chuẩn sạc CCS2 với sạc AC 7-11kW, sạc nhanh DC 30-60kW và sạc siêu nhanh DC 150-250kW (sạc 10-70% chỉ trong 15-25 phút).',
  array['trạm sạc', 'v-green', 'sạc nhanh', 'ccs2', 'công suất', 'thời gian sạc'],
  true
),
(
  '00000000-0000-4000-8000-000000000003',
  1,
  0,
  'Các bước đặt cọc & Số tiền cọc',
  'Đặt cọc online qua FASTLANE với 4 bước: Chọn xe, nhập thông tin CCCD, xác thực OTP và thanh toán. Mức cọc: VF 3 là 15 triệu, VF 5/6/7 là 30 triệu, VF 8/9 là 50 triệu, xe máy điện là 2 triệu VNĐ.',
  array['đặt cọc', 'tiền cọc', 'quy trình cọc', 'hợp đồng cọc', 'vf3', 'vf5', 'vf8', 'vf9'],
  true
),
(
  '00000000-0000-4000-8000-000000000004',
  1,
  0,
  'Chính sách mua xe trả góp & Lãi suất',
  'Hỗ trợ vay ngân hàng tới 80% giá trị xe, thời hạn vay 1-8 năm (tối đa 96 tháng). Lãi suất ưu đãi cố định 2 năm đầu, tính theo dư nợ giảm dần. Duyệt hồ sơ online trong 4-8 giờ.',
  array['trả góp', 'vay vốn', 'ngân hàng', '80%', 'lãi suất', 'thời hạn vay', 'hồ sơ vay'],
  true
)
on conflict do nothing;

alter table public.sales_agent_knowledge_documents enable row level security;
alter table public.sales_agent_knowledge_chunks enable row level security;

revoke all on table public.sales_agent_knowledge_documents from public, anon, authenticated;
revoke all on table public.sales_agent_knowledge_chunks from public, anon, authenticated;

grant select, insert, update, delete on table public.sales_agent_knowledge_documents to service_role;
grant select, insert, update, delete on table public.sales_agent_knowledge_chunks to service_role;
