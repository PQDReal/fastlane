export type AdminInventoryStatus = 'INACTIVE' | 'UNLINKED' | 'MISSING_INVENTORY' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
export type AdminInventoryProductType = 'ALL' | 'CAR' | 'BIKE' | 'ACCESSORY'
export type AdminInventoryActivity = 'ALL' | 'ACTIVE' | 'INACTIVE'

export type AdminInventoryFilterItem = {
  sku: string
  productName: string
  variantName: string
  productType: string
  categoryName: string | null
  version: string | null
  color: string | null
  interiorColor: string | null
  onHandQuantity: number
  isActive: boolean
}

export type AdminInventoryFilters = {
  search: string
  status: 'ALL' | AdminInventoryStatus
  productType: AdminInventoryProductType
  product: string
  variant: string
  color: string
  interiorColor: string
  category: string
  activity: AdminInventoryActivity
}

export const LOW_STOCK_THRESHOLD = 5

export function normalizeInventoryText(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

export function canonicalInventoryProductType(value: unknown): Exclude<AdminInventoryProductType, 'ALL'> | 'UNKNOWN' {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'CAR') return 'CAR'
  if (normalized === 'BIKE' || normalized === 'MOTORBIKE') return 'BIKE'
  if (normalized === 'ACCESSORY') return 'ACCESSORY'
  return 'UNKNOWN'
}

export function inventoryProductTypeLabel(item: Pick<AdminInventoryFilterItem, 'categoryName' | 'productType'>) {
  const type = canonicalInventoryProductType(item.productType)
  if (type === 'CAR') return 'Ô tô điện'
  if (type === 'BIKE') return 'Xe máy điện'
  if (type === 'ACCESSORY') return 'Phụ kiện'
  return item.categoryName || String(item.productType || 'Chưa phân loại')
}

export function inventoryVariantFilterValue(item: Pick<AdminInventoryFilterItem, 'productType' | 'variantName' | 'version'>) {
  return canonicalInventoryProductType(item.productType) === 'ACCESSORY'
    ? item.variantName.trim()
    : item.version?.trim() || item.variantName.trim()
}

export function inventoryStatus(quantity: number): AdminInventoryStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK'
  if (quantity <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export function inventoryStatusLabel(status: AdminInventoryStatus) {
  if (status === 'IN_STOCK') return 'Còn hàng'
  if (status === 'LOW_STOCK') return 'Sắp hết'
  if (status === 'OUT_OF_STOCK') return 'Hết hàng'
  if (status === 'MISSING_INVENTORY') return 'Thiếu bản ghi tồn'
  if (status === 'UNLINKED') return 'Chưa liên kết'
  return 'Ngừng kinh doanh'
}

export function filterAdminInventoryItems<T extends AdminInventoryFilterItem>(items: T[], filters: AdminInventoryFilters) {
  const search = normalizeInventoryText(filters.search)

  return items.filter((item) => {
    if (search) {
      const searchable = normalizeInventoryText([
        item.sku,
        item.productName,
        item.variantName,
        item.version,
        item.color,
        item.interiorColor,
        item.categoryName,
        inventoryProductTypeLabel(item),
      ].filter(Boolean).join(' '))
      const searchTokens = search.split(' ').filter(Boolean)
      if (!searchTokens.every((token) => searchable.includes(token))) return false
    }

    if (filters.status !== 'ALL' && inventoryStatus(item.onHandQuantity) !== filters.status) return false
    if (filters.productType !== 'ALL' && canonicalInventoryProductType(item.productType) !== filters.productType) return false
    if (filters.product !== 'ALL' && item.productName !== filters.product) return false
    if (filters.variant !== 'ALL' && inventoryVariantFilterValue(item) !== filters.variant) return false
    if (filters.color !== 'ALL' && item.color !== filters.color) return false
    if (filters.interiorColor !== 'ALL' && item.interiorColor !== filters.interiorColor) return false
    if (filters.category !== 'ALL' && item.categoryName !== filters.category) return false
    if (filters.activity === 'ACTIVE' && !item.isActive) return false
    if (filters.activity === 'INACTIVE' && item.isActive) return false
    return true
  })
}

export function sortedInventoryValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, 'vi'))
}
