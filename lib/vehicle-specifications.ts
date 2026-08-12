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
