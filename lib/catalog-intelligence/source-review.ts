import { catalogSourceHash } from './hash'
import type { CatalogProductInput } from './types'

export type SourceReviewBlockReason = 'OFFICIAL_SOURCE_CONFLICT' | 'NO_CURRENT_OFFICIAL_SOURCE'

export type SourceReviewBlock = {
  productId: string
  productName: string
  sourceHash: string
  reasonCode: SourceReviewBlockReason
  reason: string
  evidenceUrls: readonly string[]
  reviewedAt: string
}

// These rules bind to an exact product id + specifications hash. A corrected
// snapshot automatically stops matching and must pass a fresh dry-run review;
// stale administrative findings can therefore never block a newer payload.
export const CURRENT_SOURCE_REVIEW_BLOCKS: readonly SourceReviewBlock[] = [
  {
    productId: '4a3a88ab-0c90-50b3-79eb-5bd71698cd63',
    productName: 'Amio S',
    sourceHash: '12173fb3de9990d67d8639d0275225b0dc0a2673b382ab396d2f15b75c8fc6cc',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot legacy ghi 30 km/h, công suất danh định khoảng 400 W và kích thước khung của Amio; trang chính thức hiện ghi 25 km/h, công suất danh định khoảng 240 W và thông số khung khác.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-amio-s'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '19d2e93c-ccdc-1f50-4b17-9b3da2728f31',
    productName: 'Amio S2',
    sourceHash: '8d109063f18ccd29258c40f0886b13e906b6fda03976909a8da58a2357b0eacd',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot legacy sao chép thông số Amio 30 km/h/400 W; trang Amio S2 chính thức hiện ghi 25 km/h và công suất danh định khoảng 240 W.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-amio-S2'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '81bb7568-490d-abe3-1ed5-b6aa97d42e22',
    productName: 'Evo',
    sourceHash: '07c6d5d8ad94a3b4e739d6a45278b347fc7302190338245d5edbcf311f5dbbb2',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot còn cấu hình ắc quy chì/công suất/kích thước cũ; trang Evo hiện hành công bố pin LFP 1,5 kWh, sạc 400 W và thông số vận hành mới.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/xe-may-dien-evo'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: 'ad393db3-1732-d45f-ef3f-e384b232e468',
    productName: 'Evo Lite',
    sourceHash: '4ec1f8b08fea8afc7ef39a4abb8da8094c521bd7b3e73187e0358236b32d7f7c',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot còn cấu hình ắc quy chì cũ; trang Evo hiện hành công bố Evo Lite dùng pin LFP tùy chọn pin phụ và bộ thông số mới.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/xe-may-dien-evo'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '6ffb8378-9dc1-0110-46f9-1fd91a2a8138',
    productName: 'EvoGrand',
    sourceHash: '2bd2c5b2be3631eada77e6aa1a20460ce890c139b8c164a7eef9902f66ed4092',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot ghi cấu hình pin/quãng đường cũ; FAQ chính thức hiện ghi 134 km và cộng 128 km khi lắp pin phụ, tổng điều kiện là 262 km.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: 'e3bf7b96-cf9c-7fed-fee5-df4f16d7f8ae',
    productName: 'Evo Grand Lite',
    sourceHash: 'ef6161d8efcf3892c80c97d0f820d11f987de45573ae9cedc9d2c84b1bc9aa26',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot còn cấu hình ắc quy chì và quãng đường cũ; FAQ/brochure chính thức hiện ghi pin LFP và 70 km cộng 128 km khi lắp pin phụ.',
    evidenceUrls: [
      'https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap',
      'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3466f4c1/Document/Vinfast_EvoGrand_TSKT_FA_2025-07.pdf',
    ],
    reviewedAt: '2026-08-24',
  },
  {
    productId: 'e616220e-f2f0-67c9-7811-139bf0f5edf2',
    productName: 'Feliz 2025',
    sourceHash: '204bb3e7f4a6c20d941a1621a49a447d766a63382cd2a74e2ad4217fb92ae0f9',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot sao chép cấu hình Feliz II và thiếu quãng đường; FAQ chính thức hiện ghi 134 km cộng 128 km khi lắp pin phụ và cốp 34/15 L theo cấu hình pin.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: 'cfb20fbd-57df-d8bd-6732-2d6f4315005c',
    productName: 'Flazz',
    sourceHash: '4090bd29bd63b229c12d71b9bd44e89480429f2d61bd836aa3d3001d2fa8f469',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot ghi quãng đường/cốp của cấu hình khác; FAQ chính thức hiện ghi 70 km cộng 65 km khi lắp pin phụ và cốp 14/8 L.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi/cau-hoi-thuong-gap'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '27e22933-585f-4072-9f73-97cde9866166',
    productName: 'Evo Ultra Super Lite',
    sourceHash: '92d8ed43133def78eadddf80e6a6e71690cf38efffc8bf449e6d1fcb485b7f1a',
    reasonCode: 'NO_CURRENT_OFFICIAL_SOURCE',
    reason: 'Snapshot chỉ có một giá trị quãng đường và không có URL nguồn; không tìm thấy mẫu này trong danh mục xe máy điện chính thức hiện hành.',
    evidenceUrls: ['https://vinfastauto.com/vn_vi'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '7ca2b0ce-f933-027b-f7ed-340d65f73496',
    productName: 'VinFast VF 6',
    sourceHash: 'fb56488a623be945483c307de58ff1bbba853507081fe43af198ef043382fbb5',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Các variant trong snapshot cơ sở dữ liệu đang dùng chung powertrain; nguồn công bố hiện hành tách thông số Eco/Plus.',
    evidenceUrls: ['https://shop.vinfastauto.com/vn_vi/dat-coc-xe-dien-vf6.html'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '9b8f60b1-7496-62a4-a4f8-f5aadb0503e2',
    productName: 'VinFast VF 7',
    sourceHash: '3a2d3dc5f95ecc3080319c852c16b87112f901bdb8d4773883d92398020fb6c9',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Các variant trong snapshot cơ sở dữ liệu đang dùng chung powertrain Eco; nguồn chính thức hiện hành công bố Plus với pin/công suất/quãng đường khác.',
    evidenceUrls: ['https://shop.vinfastauto.com/vn_vi/dat-coc-xe-dien-vf7.html'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '91378699-6fa4-fd6d-86da-b44ce5614ce5',
    productName: 'VinFast VF 8',
    sourceHash: '0c367082a01a0f7e274eeaff0ee7802792384d2e690d21e5e06859e63fa0e151',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Các variant trong snapshot cơ sở dữ liệu đang dùng chung powertrain Eco; brochure chính thức tách Eco 150 kW và Plus 300 kW.',
    evidenceUrls: ['https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw4da7205d/raisinghands/documents/VF8_Brochure_VN.pdf'],
    reviewedAt: '2026-08-24',
  },
  {
    productId: '9fd4dfec-a0e2-42ce-dae2-85e89c9c499b',
    productName: 'VinFast VF 9',
    sourceHash: '1a9ce13ae3d1a86bccdd322ced9ef77514953214ed1f8ce3a282383dfb82eac7',
    reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
    reason: 'Snapshot dùng cùng quãng đường cho mọi variant và để công suất sạc DC là TBD; trang chính thức hiện hành công bố quãng đường Eco/Plus khác nhau.',
    evidenceUrls: ['https://shop.vinfastauto.com/vn_vi/dat-coc-o-to-dien-vinfast.html'],
    reviewedAt: '2026-08-24',
  },
]

export function sourceReviewBlockFor(product: CatalogProductInput) {
  const sourceHash = catalogSourceHash(product.specifications)
  return CURRENT_SOURCE_REVIEW_BLOCKS.find((block) =>
    block.productId === product.id && block.sourceHash === sourceHash,
  ) ?? null
}
