export type VehicleSpecField = {
  key: string
  label: string
  section: string
  visible: boolean
}

export const DEFAULT_VEHICLE_SPEC_FIELDS: VehicleSpecField[] = [
  ['Quãng đường đi được', 'Quãng đường đi được', 'Vận hành & Pin'],
  ['Công suất tối đa', 'Công suất tối đa', 'Vận hành & Pin'],
  ['Mô-men xoắn cực đại', 'Mô-men xoắn cực đại', 'Vận hành & Pin'],
  ['Tốc độ tối đa', 'Tốc độ tối đa', 'Vận hành & Pin'],
  ['Hệ dẫn động', 'Hệ dẫn động', 'Vận hành & Pin'],
  ['Dung lượng pin', 'Dung lượng pin', 'Vận hành & Pin'],
  ['Thời gian sạc nhanh', 'Thời gian sạc nhanh', 'Vận hành & Pin'],
  ['Công suất sạc DC tối đa', 'Công suất sạc DC tối đa', 'Vận hành & Pin'],
  ['Dài x Rộng x Cao', 'Dài x Rộng x Cao', 'Kích thước & Trọng lượng'],
  ['Chiều dài cơ sở', 'Chiều dài cơ sở', 'Kích thước & Trọng lượng'],
  ['Khoảng sáng gầm xe', 'Khoảng sáng gầm xe', 'Kích thước & Trọng lượng'],
  ['Khối lượng / Tải trọng', 'Khối lượng / Tải trọng', 'Kích thước & Trọng lượng'],
  ['Số chỗ ngồi', 'Số chỗ ngồi', 'Kích thước & Trọng lượng'],
  ['Đèn chiếu sáng phía trước', 'Đèn chiếu sáng phía trước', 'Nội thất & Ngoại thất'],
  ['Kích thước la-zăng', 'Kích thước la-zăng', 'Nội thất & Ngoại thất'],
  ['Hệ thống giải trí', 'Hệ thống giải trí', 'Nội thất & Ngoại thất'],
  ['Hệ thống điều hòa', 'Hệ thống điều hòa', 'Nội thất & Ngoại thất'],
  ['Điều chỉnh ghế lái', 'Điều chỉnh ghế lái', 'Nội thất & Ngoại thất'],
  ['Hệ thống túi khí', 'Hệ thống túi khí', 'Hệ thống An toàn'],
  ['Hệ thống ABS', 'Hệ thống ABS', 'Hệ thống An toàn'],
  ['Hệ thống EBD', 'Hệ thống EBD', 'Hệ thống An toàn'],
].map(([key, label, section]) => ({ key, label, section, visible: true }))

export const DEFAULT_MOTORBIKE_SPEC_FIELDS: VehicleSpecField[] = [
  ['Quãng đường đi được mỗi lần sạc', 'Quãng đường/Sạc', 'Vận hành & Pin'],
  ['Công suất tối đa', 'Công suất tối đa', 'Vận hành & Pin'],
  ['Tốc độ tối đa', 'Tốc độ tối đa', 'Vận hành & Pin'],
  ['Thời gian sạc tiêu chuẩn', 'Thời gian sạc', 'Vận hành & Pin'],
  ['Dài x Rộng x Cao', 'Kích thước Dài x Rộng x Cao', 'Kích thước & Tiện ích'],
  ['Chiều cao yên', 'Chiều cao yên', 'Kích thước & Tiện ích'],
  ['Khoảng sáng gầm', 'Khoảng sáng gầm', 'Kích thước & Tiện ích'],
  ['Thể tích cốp', 'Thể tích cốp', 'Kích thước & Tiện ích'],
  ['Trọng lượng', 'Trọng lượng', 'Kích thước & Tiện ích'],
  ['Khóa xe', 'Khóa xe', 'Kích thước & Tiện ích'],
  ['Loại pin/ắc quy', 'Loại pin/ắc quy', 'Vận hành & Pin'],
  ['Đèn pha trước', 'Đèn pha trước', 'Kích thước & Tiện ích'],
  ['Phanh trước và sau', 'Phanh trước và sau', 'Kích thước & Tiện ích'],
  ['Giảm xóc', 'Hệ thống giảm xóc', 'Kích thước & Tiện ích'],
  ['Tiêu chuẩn chống nước động cơ', 'Chuẩn chống nước động cơ', 'Kích thước & Tiện ích'],
  ['Kích thước lốp Trước - Sau', 'Kích thước lốp Trước - Sau', 'Kích thước & Tiện ích'],
  ['Khoảng cách trục bánh Trước-Sau', 'Khoảng cách trục bánh Trước-Sau', 'Kích thước & Tiện ích'],
  ['Trọng lượng xe', 'Trọng lượng xe', 'Kích thước & Tiện ích'],
  ['Tải trọng', 'Tải trọng', 'Kích thước & Tiện ích'],
  ['Giảm xóc trước và sau', 'Giảm xóc trước và sau', 'Kích thước & Tiện ích'],
  ['Loại động cơ', 'Loại động cơ', 'Vận hành & Pin'],
  ['Công suất danh định', 'Công suất danh định', 'Vận hành & Pin'],
  ['Tốc độ tối đa - SPORT', 'Tốc độ tối đa - SPORT', 'Vận hành & Pin'],
  ['Tốc độ tối đa - ECO', 'Tốc độ tối đa - ECO', 'Vận hành & Pin'],
  ['Gia tốc 0 - 50 km/h', 'Gia tốc 0 - 50 km/h', 'Vận hành & Pin'],
  ['Gia tốc 0 - 40 km/h', 'Gia tốc 0 - 40 km/h', 'Vận hành & Pin'],
  ['Khả năng leo dốc 20%', 'Khả năng leo dốc 20%', 'Vận hành & Pin'],
  ['Dung lượng pin/ắc quy', 'Dung lượng pin/ắc quy', 'Vận hành & Pin'],
  ['Trọng lượng pin/ắc quy', 'Trọng lượng pin/ắc quy', 'Vận hành & Pin'],
  ['Loại sạc', 'Loại sạc', 'Vận hành & Pin'],
  ['Vị trí lắp pin', 'Vị trí lắp pin', 'Vận hành & Pin'],
].map(([key, label, section]) => ({ key, label, section, visible: true }))

export function normalizeVehicleSpecFields(
  value: unknown,
  defaultFields: VehicleSpecField[] = DEFAULT_VEHICLE_SPEC_FIELDS,
): VehicleSpecField[] {
  if (!Array.isArray(value)) return defaultFields.map((field) => ({ ...field }))
  const defaults = new Map(defaultFields.map((field) => [field.key, field]))
  const fields = value
    .filter((field): field is Partial<VehicleSpecField> => !!field && typeof field === 'object')
    .map((field) => {
      const fallback = defaults.get(String(field.key))
      return {
        key: String(field.key || ''),
        label: String(field.label || fallback?.label || field.key || ''),
        section: String(field.section || fallback?.section || 'Thông số khác'),
        visible: field.visible !== false,
      }
    })
    .filter((field) => field.key)
  return fields.length ? fields : defaultFields.map((field) => ({ ...field }))
}

export function normalizeMotorbikeSpecFields(value: unknown): VehicleSpecField[] {
  const fields = normalizeVehicleSpecFields(value, DEFAULT_MOTORBIKE_SPEC_FIELDS)
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const defaultKeys = new Set(DEFAULT_MOTORBIKE_SPEC_FIELDS.map((field) => field.key))
  return [
    ...DEFAULT_MOTORBIKE_SPEC_FIELDS.map((field) => byKey.get(field.key) ?? { ...field }),
    ...fields.filter((field) => !defaultKeys.has(field.key)),
  ]
}

export function mergeVehicleSpecFields(
  fields: VehicleSpecField[],
  specifications: unknown,
  fallbackSection = 'Thông số khác',
  defaultFields: VehicleSpecField[] = DEFAULT_VEHICLE_SPEC_FIELDS,
): VehicleSpecField[] {
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return fields
  const defaultKeys = new Set(defaultFields.map((field) => field.key))
  const knownKeys = new Set(fields.map((field) => field.key))
  const sourceKeys = new Set(Object.keys(specifications as Record<string, unknown>))
  const retained = fields.filter((field) => defaultKeys.has(field.key) || sourceKeys.has(field.key))
  const additions = Object.keys(specifications as Record<string, unknown>)
    .filter((key) => !knownKeys.has(key) && !defaultKeys.has(key))
    .map((key) => ({ key, label: key, section: fallbackSection, visible: true }))
  return [...retained, ...additions]
}
