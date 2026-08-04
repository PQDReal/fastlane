import type { CatalogAccessoryContentSectionType } from '@/lib/catalog/types'
import type { AdminAccessoryDraft } from '@/lib/catalog/admin-accessory-draft'

export const ACCESSORY_TEMPLATE_CODES = [
  'vehicle_fit',
  'window_film',
  'apparel',
  'ev_charger',
  'custom',
] as const

export type AccessoryTemplateCode = (typeof ACCESSORY_TEMPLATE_CODES)[number]

export type AccessoryTemplateSectionDefinition = {
  key: string
  type: CatalogAccessoryContentSectionType
  title: string
  attributes?: string[]
  items?: string[]
  bodyPlaceholder?: string
}

export type AccessoryTemplateDefinition = {
  code: AccessoryTemplateCode
  version: 1
  group: string
  label: string
  description: string
  sections: AccessoryTemplateSectionDefinition[]
  suggestedOptionCodes: Array<'color' | 'size' | 'package'>
  suggestedCategorySlugs: string[]
}

const templates: AccessoryTemplateDefinition[] = [
  {
    code: 'vehicle_fit',
    version: 1,
    group: 'Phụ kiện xe',
    label: 'Phụ kiện lắp theo xe',
    description: 'Thảm, ốp, phụ kiện lắp đặt và các sản phẩm cần thông số phù hợp xe.',
    sections: [
      {
        key: 'specifications',
        type: 'TECHNICAL_SPECS',
        title: 'Thông số sản phẩm',
        attributes: ['Vật liệu', 'Vị trí lắp đặt', 'Màu sắc / hoàn thiện', 'Kích thước', 'Trọng lượng'],
      },
      {
        key: 'advanced_specifications',
        type: 'TECHNICAL_SPECS',
        title: 'Thông số nâng cao',
        attributes: ['Độ dày', 'Cấu trúc / kiểu dáng', 'Phương thức cố định', 'Tải trọng', 'Chứng nhận'],
      },
      { key: 'features', type: 'FEATURES', title: 'Đặc điểm nổi bật', items: [] },
      { key: 'package', type: 'PACKAGE_CONTENTS', title: 'Bộ sản phẩm', items: [] },
      { key: 'installation', type: 'INSTALLATION_GUIDE', title: 'Hướng dẫn lắp đặt', bodyPlaceholder: 'Hướng dẫn lắp đặt và lưu ý cần thiết.' },
      { key: 'safety', type: 'SAFETY_NOTE', title: 'Lưu ý an toàn', bodyPlaceholder: 'Các lưu ý an toàn khi sử dụng.' },
      { key: 'warranty', type: 'WARRANTY', title: 'Chính sách bảo hành', bodyPlaceholder: 'Điều kiện và thời hạn bảo hành.' },
    ],
    suggestedOptionCodes: ['color', 'package'],
    suggestedCategorySlugs: ['phu-kien-o-to-dien'],
  },
  {
    code: 'window_film',
    version: 1,
    group: 'Phụ kiện xe',
    label: 'Film cách nhiệt',
    description: 'Thông tin film, vị trí dán, gói dịch vụ và điều kiện bảo hành.',
    sections: [
      {
        key: 'specifications',
        type: 'TECHNICAL_SPECS',
        title: 'Thông số film',
        attributes: ['Thương hiệu film', 'Dòng / phiên bản film', 'Vị trí áp dụng'],
      },
      { key: 'features', type: 'FEATURES', title: 'Đặc điểm nổi bật', items: [] },
      { key: 'warranty', type: 'WARRANTY', title: 'Chính sách bảo hành', bodyPlaceholder: 'Điều kiện và thời hạn bảo hành.' },
      { key: 'purchase', type: 'PURCHASE_NOTE', title: 'Lưu ý khi mua hàng', bodyPlaceholder: 'Thông tin cần xác nhận trước khi đặt mua.' },
    ],
    suggestedOptionCodes: ['package'],
    suggestedCategorySlugs: ['phu-kien-o-to-dien'],
  },
  {
    code: 'apparel',
    version: 1,
    group: 'Thời trang',
    label: 'Quần áo',
    description: 'Trang phục có màu, kích cỡ, chất liệu và hướng dẫn bảo quản.',
    sections: [
      {
        key: 'specifications',
        type: 'TECHNICAL_SPECS',
        title: 'Thông số trang phục',
        attributes: ['Chất liệu', 'Kiểu dáng / form', 'Xuất xứ', 'Kỹ thuật in / hoàn thiện'],
      },
      { key: 'features', type: 'FEATURES', title: 'Đặc điểm nổi bật', items: [] },
      { key: 'care', type: 'CARE_GUIDE', title: 'Hướng dẫn bảo quản', bodyPlaceholder: 'Hướng dẫn giặt, phơi và bảo quản.' },
    ],
    suggestedOptionCodes: ['color', 'size'],
    suggestedCategorySlugs: ['phong-cach-song'],
  },
  {
    code: 'ev_charger',
    version: 1,
    group: 'Thiết bị điện',
    label: 'Thiết bị sạc',
    description: 'Thông số nguồn, đầu nối, bảo vệ và hướng dẫn sử dụng thiết bị sạc.',
    sections: [
      {
        key: 'specifications',
        type: 'TECHNICAL_SPECS',
        title: 'Thông số thiết bị sạc',
        attributes: ['Công suất định mức / tối đa', 'Nguồn vào', 'Nguồn ra', 'Chuẩn đầu nối', 'Chiều dài cáp', 'Chế độ sạc', 'Cơ chế bảo vệ', 'Điều kiện vận hành / lưu trữ', 'Chứng nhận'],
      },
      { key: 'installation', type: 'INSTALLATION_GUIDE', title: 'Lắp đặt và sử dụng', bodyPlaceholder: 'Hướng dẫn lắp đặt và sử dụng thiết bị.' },
      { key: 'safety', type: 'SAFETY_NOTE', title: 'Lưu ý an toàn', bodyPlaceholder: 'Các lưu ý an toàn khi sử dụng.' },
      { key: 'warranty', type: 'WARRANTY', title: 'Chính sách bảo hành', bodyPlaceholder: 'Điều kiện và thời hạn bảo hành.' },
      { key: 'compatibility', type: 'PURCHASE_NOTE', title: 'Ghi chú tương thích', bodyPlaceholder: 'Ví dụ: VF 3 cần adapter đi kèm.' },
    ],
    suggestedOptionCodes: [],
    suggestedCategorySlugs: ['sac-o-to-dien'],
  },
  {
    code: 'custom',
    version: 1,
    group: 'Khác',
    label: 'Tùy chỉnh',
    description: 'Dùng khi sản phẩm không phù hợp với các mẫu có sẵn.',
    sections: [],
    suggestedOptionCodes: [],
    suggestedCategorySlugs: [],
  },
]

export const ACCESSORY_TEMPLATE_DEFINITIONS = templates

export function isAccessoryTemplateCode(value: unknown): value is AccessoryTemplateCode {
  return typeof value === 'string' && ACCESSORY_TEMPLATE_CODES.includes(value as AccessoryTemplateCode)
}

export function accessoryTemplate(
  code: unknown,
  version: unknown = 1,
): AccessoryTemplateDefinition | null {
  return isAccessoryTemplateCode(code) && version === 1
    ? templates.find((template) => template.code === code) ?? null
    : null
}

export function templateSectionKey(code: AccessoryTemplateCode, sectionKey: string) {
  return `tpl_${code}_${sectionKey}`
}

export function isTemplateSectionKey(value: string) {
  return value.startsWith('tpl_')
}

export function applyAccessoryTemplateToDraft(
  draft: AdminAccessoryDraft,
  templateCode: AccessoryTemplateCode,
): AdminAccessoryDraft {
  const template = accessoryTemplate(templateCode)
  if (!template) return draft

  return {
    ...draft,
    templateCode,
    templateVersion: template.version,
    sections: [
      ...template.sections.map((definition) => ({
        id: templateSectionKey(template.code, definition.key),
        type: definition.type,
        title: definition.title,
        body: '',
        itemsText: '',
        attributes: (definition.attributes ?? []).map((label, index) => ({
          id: `${templateSectionKey(template.code, definition.key)}_attribute_${index + 1}`,
          label,
          value: '',
        })),
      })),
      ...draft.sections.filter((section) => !isTemplateSectionKey(section.id)),
    ],
  }
}
