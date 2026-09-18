export type ShowroomVehicleType = 'car' | 'motorbike'
export type ShowroomManagementMode = 'IMPORT' | 'ADMIN'

export type Showroom = {
  id: string
  source: string
  sourceEntityId: string
  storeId: string
  code: string | null
  vehicleType: ShowroomVehicleType
  name: string
  address: string
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
  managementMode: ShowroomManagementMode
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type ShowroomRow = {
  id: string
  source: string
  source_entity_id: string
  store_id: string
  code: string | null
  vehicle_type: ShowroomVehicleType
  name: string
  address: string
  province_source_id: string | null
  province_name: string
  district_source_id: string | null
  district_name: string | null
  latitude: number
  longitude: number
  hotline: string | null
  service_hotline: string | null
  sales_open_time: string | null
  sales_close_time: string | null
  service_open_time: string | null
  service_close_time: string | null
  management_mode: ShowroomManagementMode
  is_active: boolean
  created_at: string
  updated_at: string
}

export function mapShowroomRow(row: ShowroomRow): Showroom {
  return {
    id: row.id,
    source: row.source,
    sourceEntityId: row.source_entity_id,
    storeId: row.store_id,
    code: row.code,
    vehicleType: row.vehicle_type,
    name: row.name,
    address: row.address,
    provinceSourceId: row.province_source_id,
    provinceName: row.province_name,
    districtSourceId: row.district_source_id,
    districtName: row.district_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    hotline: row.hotline,
    serviceHotline: row.service_hotline,
    salesOpenTime: row.sales_open_time,
    salesCloseTime: row.sales_close_time,
    serviceOpenTime: row.service_open_time,
    serviceCloseTime: row.service_close_time,
    managementMode: row.management_mode,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
