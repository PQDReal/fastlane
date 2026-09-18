export const MOTORBIKE_WARRANTY_SOURCE_URL =
  'https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-xe-may'

export const MOTORBIKE_WARRANTY_REVIEWED_AT = '2026-08-24'
export const MOTORBIKE_WARRANTY_KNOWLEDGE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000005'
export const MOTORBIKE_WARRANTY_INTERNAL_URL = '/after-sales?vehicle=motorbike&tab=warranty#warranty-term'

export type OfficialMotorbikeDocument = {
  id: string
  label: string
  url: string
}

export type VerifiedMotorbikeWarrantyPolicy = {
  id: string
  label: string
  applicability: string
  vehicleWarranty: string | null
  batteryWarranty: string
  conditions: readonly string[]
  sourceUrl: string
}

export const VERIFIED_MOTORBIKE_WARRANTY_POLICIES: readonly VerifiedMotorbikeWarrantyPolicy[] = [
  {
    id: 'lfp-invoice-before-2025-08-15',
    label: 'Pin LFP · hóa đơn trước 15/08/2025',
    applicability: 'Chọn theo ngày xuất hóa đơn và đúng sổ bảo hành gắn với xe.',
    vehicleWarranty: '5 năm, không giới hạn quãng đường',
    batteryWarranty: '5 năm, không giới hạn quãng đường',
    conditions: [
      'Tính từ Ngày Kích Hoạt Bảo Hành.',
      'Áp dụng cho pin mua lần đầu theo xe mới.',
      'Pin LFP mua và lắp tại Xưởng dịch vụ/Đại lý phân phối VinFast sau khi giao xe: 5 năm từ ngày mua.',
    ],
    sourceUrl: 'https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-5-nam.pdf',
  },
  {
    id: 'lfp-invoice-from-2025-08-15',
    label: 'Pin LFP · chính sách 6 năm từ mốc 15/08/2025',
    applicability:
      'Website gọi tài liệu này là sổ cho xe xuất hóa đơn sau 15/08/2025; tên tệp chính thức ghi từ 15/08/2025. Với hóa đơn đúng ngày mốc, cần đối chiếu sổ được cấp cho xe.',
    vehicleWarranty: '6 năm, không giới hạn quãng đường',
    batteryWarranty: '8 năm, không giới hạn quãng đường',
    conditions: [
      'Tính từ Ngày Kích Hoạt Bảo Hành.',
      'Áp dụng cho pin mua lần đầu theo xe mới.',
      'Pin LFP mua và lắp tại Xưởng dịch vụ/Đại lý phân phối VinFast sau khi giao xe: 8 năm từ ngày mua.',
    ],
    sourceUrl: 'https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-6-nam-tu-15-8-2025_0.pdf',
  },
  {
    id: 'non-lfp',
    label: 'Pin khác · không phải pin LFP',
    applicability: 'Áp dụng cho xe máy điện sử dụng công nghệ pin/ắc quy không phải LFP.',
    vehicleWarranty: '3 năm, không giới hạn quãng đường',
    batteryWarranty: '3 năm, không giới hạn quãng đường',
    conditions: [
      'Pin nguyên bản tính từ Ngày Kích Hoạt Bảo Hành.',
      'Pin thay thế do khách hàng thanh toán và được lắp tại hệ thống VinFast: 3 năm từ ngày mua.',
    ],
    sourceUrl: 'https://static-cms-prod.vinfastauto.com/250528-xmd-pin-khac.pdf',
  },
  {
    id: 'lfp-battery-swap',
    label: 'Pin LFP theo mô hình đổi pin',
    applicability: 'Chỉ áp dụng cho pin LFP thuộc mô hình đổi pin.',
    vehicleWarranty: null,
    batteryWarranty: '8 năm, không giới hạn quãng đường',
    conditions: ['Không dùng thời hạn này để suy ra thời hạn bảo hành toàn xe.'],
    sourceUrl: MOTORBIKE_WARRANTY_SOURCE_URL,
  },
] as const

export const MOTORBIKE_WARRANTY_BOOKS: readonly OfficialMotorbikeDocument[] = [
  {
    id: 'warranty-lfp-before-2025-08-15',
    label: 'Sổ bảo hành xe máy điện pin LFP · hóa đơn trước 15/08/2025',
    url: 'https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-5-nam.pdf',
  },
  {
    id: 'warranty-lfp-from-2025-08-15',
    label: 'Sổ bảo hành xe máy điện pin LFP · chính sách từ/sau 15/08/2025',
    url: 'https://static-cms-prod.vinfastauto.com/sbh-xmd-lfp-6-nam-tu-15-8-2025_0.pdf',
  },
  {
    id: 'warranty-non-lfp',
    label: 'Sổ bảo hành xe máy điện pin khác',
    url: 'https://static-cms-prod.vinfastauto.com/250528-xmd-pin-khac.pdf',
  },
] as const

export const MOTORBIKE_OWNER_MANUALS: readonly OfficialMotorbikeDocument[] = [
  { id: 'klara-a1', label: 'HDSD xe Klara A1', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00000441-%20Klara%20-%202018%20A1.pdf' },
  { id: 'klara-a2', label: 'HDSD xe Klara A2', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00000565%20-%20Klara%20-%202018%20A2.pdf' },
  { id: 'klara-s', label: 'HDSD xe Klara S', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00002874%20-%20KLara%20S%202019.pdf' },
  { id: 'ludo', label: 'HDSD xe Ludo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00002718%20-%20Ludo.pdf' },
  { id: 'impes', label: 'HDSD xe Impes', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00002543%20-%20Impes.pdf' },
  { id: 'feliz', label: 'HDSD xe Feliz', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00003708%20-%20FELIZ%202020.pdf' },
  { id: 'theon', label: 'HDSD xe Theon', url: 'https://static-cms-prod.vinfastauto.com/theon-2021.pdf' },
  { id: 'klara-a2-2020', label: 'HDSD xe Klara A2 2020', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00007613%20-%20Klara%20A2%202020.pdf' },
  { id: 'vento', label: 'HDSD xe Vento', url: 'https://static-cms-prod.vinfastauto.com/vento-2021.pdf' },
  { id: 'tempest', label: 'HDSD xe Tempest', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00008584%20-%20Tempest%202021.pdf' },
  { id: 'feliz-s-shiper', label: 'HDSD xe Feliz S Shiper', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00010052-User%20manual%20V5%20LITE%20LFP_Rev%2007-HDSD%20xe%20Feliz%20S%20Shiper.pdf' },
  { id: 'feliz-s', label: 'HDSD xe Feliz S', url: 'https://static-cms-prod.vinfastauto.com/feliz-s-2022.pdf' },
  { id: 'klara-s2', label: 'HDSD xe Klara S2', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00008961_Rev%2011_Klara%20S_V5%20City%20LFP-HDSD%20xe%20Klara%20S2.pdf' },
  { id: 'theon-s', label: 'HDSD xe Theon S', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00004715_Rev%2010_Theon%20S_V9%20Sport%20LFP-HDSD%20xe%20Theon%20S.pdf' },
  { id: 'vento-s', label: 'HDSD xe Vento S', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00008958_Rev%2011_Vento%20S_V7%20Sport%20LFP-HDSD%20xe%20Vento%20S.pdf' },
  { id: 'evo200', label: 'HDSD xe Evo200', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00009361-User%20manual%20EVO%20200_Rev%2008_sua-HDSD%20xe%20Evo200.pdf' },
  { id: 'evo200-lite', label: 'HDSD xe Evo200 Lite', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00009869-User%20manual%20EVO%20200%20LITE_Rev%2008-HDSD%20xe%20Evo200%20Lite.pdf' },
  { id: 'motio', label: 'HDSD xe Motio', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00011232-%20MOTIO.pdf' },
  { id: 'evo-neo', label: 'HDSD xe Evo Neo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011256-User%20manual%20EVO%20NEO_SUA_V7-HDSD%20xe%20Evo%20Neo.pdf' },
  { id: 'evo-lite-neo', label: 'HDSD xe Evo Lite Neo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/BOL00011233%20-%20EVO%20LITE%20NEO.pdf' },
  { id: 'vento-neo', label: 'HDSD xe Vento Neo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011226-User%20manual%20VENTO%20NEO_SUA_V7-HDSD%20xe%20Vento%20Neo.pdf' },
  { id: 'feliz-neo', label: 'HDSD xe Feliz Neo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011234-User%20manual%20FELIZ%20NEO_sua_V7-HDSD%20xe%20Feliz%20Neo.pdf' },
  { id: 'klara-neo', label: 'HDSD xe Klara Neo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011225-User%20manual%20KLARA%20NEO_sua_V8-HDSD%20xe%20Klara%20Neo.pdf' },
  { id: 'evo-grand', label: 'HDSD xe Evo Grand', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011286AA%20-User%20manual%20EVO%20GRAND-v7-HDSD%20xe%20Evo%20Grand.pdf' },
  { id: 'evo-grand-lite', label: 'HDSD xe Evo Grand Lite', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011314AA%20-User%20manual%20EVO%20GRAND%20Lite_v7-BOL00011314AA%20-HDSD%20xe%20Evo%20Grand%20Lite.pdf' },
  { id: 'feliz-2025', label: 'HDSD xe Feliz 2025', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011287AA-User%20manual%20FELIZ%20NEO_2025-07-HDSD%20xe%20Feliz%202025.pdf' },
  { id: 'feliz-lite', label: 'HDSD xe Feliz Lite', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011332AA-User%20manual%20FELIZ%20NEO%20LITE%202025-ver-06-HDSD%20xe%20Feliz%20Lite.pdf' },
  { id: 'vero-x', label: 'HDSD xe Vero X', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/BOL00011310AA-Owner%20Manual%20Vero%20X-rev09-HDSD%20xe%20Vero%20X.pdf' },
  { id: 'zgoo', label: 'HDSD xe ZGoo', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/ESPCNECBOL001-04-DG1_ZGOO_OWNER_MANUAL-HDSD%20xe%20ZGOO.pdf' },
  { id: 'flazz-2025', label: 'HDSD xe Flazz', url: 'https://static-cms-prod.vinfastauto.com/hdsd/26022026/ESPCNEDBOL001-04-DG2_FLAZZ_OWNER_MANUAL-HDSD%20xe%20FLAZZ.pdf' },
  { id: 'vinfast-evo', label: 'HDSD xe VinFast Evo', url: 'https://static-cms-prod.vinfastauto.com/espcne9bol001-06-evo_max_vn_owner_manual_vie.pdf' },
  { id: 'vinfast-amio', label: 'HDSD xe VinFast Amio', url: 'https://static-cms-prod.vinfastauto.com/espcnf1bol00201-hs_bol_owner_manual_ver02_0.pdf' },
  { id: 'vinfast-feliz-ii', label: 'HDSD xe VinFast Feliz II', url: 'https://static-cms-prod.vinfastauto.com/hdsd/ESPCNEFBOL00201-FELIZ_MAX_BOL_OWNER_MANUAL.pdf' },
  { id: 'vinfast-viper', label: 'HDSD xe VinFast Viper', url: 'https://static-cms-prod.vinfastauto.com/espcneabol001-drift_max_owner_manual_vie_ver04_0.pdf' },
  { id: 'vinfast-evo-lite', label: 'HDSD xe VinFast Evo Lite', url: 'https://static-cms-prod.vinfastauto.com/espcne9bol003-01-evo_max_lite_owner_manual.pdf' },
  { id: 'vinfast-flazz', label: 'HDSD xe VinFast Flazz', url: 'https://static-cms-prod.vinfastauto.com/espcnf2bol001-01-flazz_max_vn_espc_bol_owner_manual.pdf' },
  { id: 'vinfast-amio-s', label: 'HDSD xe VinFast Amio S', url: 'https://static-cms-prod.vinfastauto.com/espcnf1bol003-01-hs_bol_owner_manual_amio_s_ver01.pdf' },
  { id: 'vf-drgnfly', label: 'HDSD xe VF DrgnFly eBike', url: 'https://static-cms-prod.vinfastauto.com/bol00011007-user-manual-e-bike-vie.pdf' },
  { id: 'vinfast-kyo', label: 'HDSD xe VinFast KYO', url: 'https://static-cms-prod.vinfastauto.com/hdsd/ESPCNF3BOL002_KYO_BOL_OWNER_MANUAL_VN.pdf' },
  { id: 'vinfast-kinet', label: 'HDSD xe VinFast KINET', url: 'https://static-cms-prod.vinfastauto.com/statics/ESPCNF4BOL001_02_KINET_VN_ESPC_BOL_OWNER_MANUAL_VIE.pdf' },
] as const

function normalizeOfficialDocumentText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function officialManualName(document: OfficialMotorbikeDocument): string {
  return normalizeOfficialDocumentText(document.label)
    .replace(/^(?:hdsd|huong dan su dung)\s+xe\s+/, '')
    .replace(/^vinfast\s+/, '')
    .trim()
}

export function findOfficialMotorbikeOwnerManual(query: string): OfficialMotorbikeDocument | null {
  const normalizedQuery = ` ${normalizeOfficialDocumentText(query)} `

  return [...MOTORBIKE_OWNER_MANUALS]
    .map((document) => ({ document, name: officialManualName(document) }))
    .filter(({ name }) => name && normalizedQuery.includes(` ${name} `))
    .sort((left, right) => right.name.length - left.name.length)[0]?.document ?? null
}

export const VERIFIED_MOTORBIKE_WARRANTY_KNOWLEDGE_MARKDOWN = `# Chính sách bảo hành xe máy điện và pin VinFast

Nguồn được admin xác minh ngày ${MOTORBIKE_WARRANTY_REVIEWED_AT}: ${MOTORBIKE_WARRANTY_SOURCE_URL}

## Pin LFP theo xe mới — chọn đúng sổ theo ngày xuất hóa đơn
- Xe có hóa đơn trước 15/08/2025: xe 5 năm và pin nguyên bản 5 năm, đều không giới hạn quãng đường.
- Chính sách 6 năm từ mốc 15/08/2025: xe 6 năm và pin nguyên bản 8 năm, đều không giới hạn quãng đường. Website gọi đây là sổ cho xe xuất hóa đơn sau 15/08/2025, còn tên tệp chính thức ghi từ 15/08/2025; nếu hóa đơn đúng ngày mốc phải đối chiếu sổ được cấp cho xe.

## Pin khác và mô hình đổi pin
- Xe dùng pin không phải LFP: xe 3 năm và pin nguyên bản 3 năm, không giới hạn quãng đường.
- Pin LFP theo mô hình đổi pin: pin 8 năm, không giới hạn quãng đường; không dùng mốc này để suy ra thời hạn bảo hành toàn xe.

## Pin, ắc quy và phụ tùng khách hàng mua thay thế
- Pin LFP được mua và lắp tại hệ thống VinFast: 5 năm nếu thuộc sổ/chính sách LFP trước mốc 15/08/2025; 8 năm nếu thuộc sổ/chính sách LFP mới từ/sau mốc 15/08/2025. Phải đối chiếu đúng sổ được cấp, không gộp hai trường hợp thành một mốc chung.
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

[Xem chính sách đã đối chiếu và tải đúng PDF](${MOTORBIKE_WARRANTY_INTERNAL_URL})`
