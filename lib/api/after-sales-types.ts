export type VehicleCategoryType = 'car' | 'motorbike' | 'bus' | 'all'

export type AfterSalesServiceType =
  | 'warranty'
  | 'maintenance'
  | 'repair'
  | 'rescue'
  | 'manual'
  | 'workshop'

export interface WarrantyFactItem {
  id: string
  vehicleType: 'car' | 'motorbike' | 'bus'
  modelSeries: string
  models: string[]
  warrantyTerm: string
  batteryWarrantyTerm: string
  batteryCapacityWarranty?: string
  commercialWarranty?: string
  conditions: string[]
  highlight?: string
}

export interface MaintenanceMilestone {
  mileageKm: number
  months: number
  level: string
  description: string
  estimatedDuration: string
  keyItems: string[]
}

export interface MaintenanceServiceItem {
  id: string
  vehicleType: 'car' | 'motorbike' | 'bus'
  title: string
  description: string
  intervals: MaintenanceMilestone[]
  checklist: { category: string; items: string[] }[]
  mobileServiceAvailable: boolean
}

export interface RepairServiceItem {
  id: string
  title: string
  description: string
  badge: string
  features: string[]
  imageUrl?: string
}

export interface RescuePolicyItem {
  id: string
  vehicleType: 'car' | 'motorbike' | 'bus' | 'all'
  title: string
  description: string
  hotline: string
  operatingHours: string
  coverage: string[]
  conditions: string[]
  mobileChargingSupport: boolean
}

export interface ServiceWorkshopItem {
  id: string
  name: string
  city: string
  district: string
  address: string
  phone: string
  operatingHours: string
  services: ('car' | 'motorbike' | 'charging' | 'body_paint' | 'quick_service')[]
  latitude?: number
  longitude?: number
}

export interface AfterSalesData {
  warranties: WarrantyFactItem[]
  maintenances: MaintenanceServiceItem[]
  repairs: RepairServiceItem[]
  rescues: RescuePolicyItem[]
  workshops: ServiceWorkshopItem[]
  sourcesSyncedAt?: string
}

export interface ServiceBookingPayload {
  fullName: string
  phoneNumber: string
  email?: string
  vehicleType: 'car' | 'motorbike' | 'bus'
  vehicleModel: string
  licensePlate?: string
  serviceType: string
  preferredDate: string
  preferredTime: string
  workshopId: string
  workshopName: string
  note?: string
}
