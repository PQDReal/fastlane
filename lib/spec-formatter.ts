export const formatSpecificationValue = (key: string, value: string): string => {
  // If the field is empty, return empty
  if (!value.trim()) return value

  // 1. Dimensions: Dài x Rộng x Cao
  // Example: 475019001660 -> 4750 x 1900 x 1660 mm
  if (key === 'Dài x Rộng x Cao') {
    const digits = value.replace(/\D/g, '')
    let res = ''
    if (digits.length > 0) res += digits.substring(0, 4)
    if (digits.length > 4) res += ' x ' + digits.substring(4, 8)
    if (digits.length > 8) res += ' x ' + digits.substring(8, 12)
    if (res.length > 0) {
      // Only append 'mm' if there is at least one dimension fully typed
      res += ' mm'
    }
    return res
  }

  // 2. Weight / Payload: Khối lượng / Tải trọng
  // Example: 1360325 -> 1360 / 325 kg
  if (key === 'Khối lượng / Tải trọng') {
    const digits = value.replace(/\D/g, '')
    let res = ''
    if (digits.length > 0) res += digits.substring(0, 4)
    if (digits.length > 4) res += ' / ' + digits.substring(4, 8)
    if (res.length > 0) res += ' kg'
    return res
  }

  // 3. General units
  const units: Record<string, string> = {
    'Tốc độ tối đa': 'km/h',
    'Quãng đường đi được': 'km',
    'Công suất tối đa': 'kW',
    'Mô-men xoắn cực đại': 'Nm',
    'Chiều dài cơ sở': 'mm',
    'Khoảng sáng gầm xe': 'mm',
    'Dung lượng pin': 'kWh',
    'Kích thước la-zăng': 'inch',
    'Thời gian sạc nhanh': 'phút',
    'Công suất sạc DC tối đa': 'kW',
  }

  const unit = units[key]
  if (unit) {
    // Only extract numbers and dots/commas
    const rawNumber = value.replace(/[^\d.,]/g, '')
    if (rawNumber) {
      return `${rawNumber} ${unit}`
    }
    return value
  }

  // No formatting for other fields
  return value
}
