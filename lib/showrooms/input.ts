import type { ShowroomVehicleType } from './types'

export type ShowroomInput = {
  name: string
  address: string
  vehicleType: ShowroomVehicleType
  code: string | null
  provinceSourceId: string | null
  provinceName: string
  districtSourceId: string | null
  districtName: string | null
  latitude: number
  longitude: number
  hotline: string | null
  serviceHotline: string | null
  salesOpenTime: string | null
  salesCloseTime: string | null
  serviceOpenTime: string | null
  serviceCloseTime: string | null
  isActive: boolean
}

function text(value: unknown, field: string, required = true) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new Error(`${field} là bắt buộc.`)
  return result || null
}

function number(value: unknown, field: string, min: number, max: number) {
  const result = Number(value)
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${field} không hợp lệ.`)
  return result
}

export function parseShowroomInput(value: unknown): ShowroomInput {
  if (!value || typeof value !== 'object') throw new Error('Dữ liệu showroom không hợp lệ.')
  const body = value as Record<string, unknown>
  const vehicleType = body.vehicleType === 'motorbike' ? 'motorbike' : body.vehicleType === 'car' ? 'car' : null
  if (!vehicleType) throw new Error('Loại xe không hợp lệ.')

  return {
    name: text(body.name, 'Tên showroom') as string,
    address: text(body.address, 'Địa chỉ') as string,
    vehicleType,
    code: text(body.code, 'Mã showroom', false),
    provinceSourceId: text(body.provinceSourceId, 'Mã tỉnh/thành', false),
    provinceName: text(body.provinceName, 'Tỉnh/thành') as string,
    districtSourceId: text(body.districtSourceId, 'Mã quận/huyện', false),
    districtName: text(body.districtName, 'Phường/xã', false),
    latitude: number(body.latitude, 'Vĩ độ', -90, 90),
    longitude: number(body.longitude, 'Kinh độ', -180, 180),
    hotline: text(body.hotline, 'Hotline', false),
    serviceHotline: text(body.serviceHotline, 'Hotline dịch vụ', false),
    salesOpenTime: text(body.salesOpenTime, 'Giờ mở cửa bán hàng', false),
    salesCloseTime: text(body.salesCloseTime, 'Giờ đóng cửa bán hàng', false),
    serviceOpenTime: text(body.serviceOpenTime, 'Giờ mở cửa dịch vụ', false),
    serviceCloseTime: text(body.serviceCloseTime, 'Giờ đóng cửa dịch vụ', false),
    isActive: body.isActive !== false,
  }
}
