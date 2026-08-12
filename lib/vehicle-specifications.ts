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
  ['Dài x Rộng x Cao', 'Kích thước Dài x Rộng x Cao', 'Kích thước & Trọng lượng'],
  ['Chiều cao yên', 'Chiều cao yên', 'Kích thước & Trọng lượng'],
  ['Khoảng sáng gầm', 'Khoảng sáng gầm', 'Kích thước & Trọng lượng'],
  ['Thể tích cốp', 'Thể tích cốp', 'Kích thước & Trọng lượng'],
  ['Trọng lượng', 'Trọng lượng', 'Kích thước & Trọng lượng'],
  ['Khóa xe', 'Khóa xe', 'Nội thất & Ngoại thất'],
  ['Loại pin/ắc quy', 'Loại pin/ắc quy', 'Vận hành & Pin'],
  ['Đèn pha trước', 'Đèn pha trước', 'Nội thất & Ngoại thất'],
  ['Phanh trước và sau', 'Phanh trước và sau', 'Hệ thống An toàn'],
  ['Giảm xóc', 'Hệ thống giảm xóc', 'Hệ thống An toàn'],
  ['Tiêu chuẩn chống nước động cơ', 'Chuẩn chống nước động cơ', 'Hệ thống An toàn'],
  ['Kích thước lốp Trước - Sau', 'Kích thước lốp Trước - Sau', 'Nội thất & Ngoại thất'],
].map(([key, label, section]) => ({ key, label, section, visible: true }))

export function normalizeVehicleSpecFields(value: unknown): VehicleSpecField[] {
  if (!Array.isArray(value)) return DEFAULT_VEHICLE_SPEC_FIELDS.map((field) => ({ ...field }))
  const defaults = new Map(DEFAULT_VEHICLE_SPEC_FIELDS.map((field) => [field.key, field]))
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
  return fields.length ? fields : DEFAULT_VEHICLE_SPEC_FIELDS.map((field) => ({ ...field }))
}
