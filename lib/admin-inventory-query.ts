export const ADMIN_INVENTORY_STATUSES = [
  'INACTIVE',
  'UNLINKED',
  'MISSING_INVENTORY',
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'IN_STOCK',
] as const

export type AdminInventoryQueryStatus = typeof ADMIN_INVENTORY_STATUSES[number]
export type AdminInventoryQueryActivity = 'ALL' | 'ACTIVE' | 'INACTIVE'
export type AdminInventoryQueryProductType = 'ALL' | 'CAR' | 'BIKE' | 'ACCESSORY'

export type AdminInventoryQueryParams = {
  search: string | null
  productType: AdminInventoryQueryProductType
  productId: string | null
  variant: string | null
  color: string | null
  interiorColor: string | null
  status: AdminInventoryQueryStatus | 'ALL'
  activity: AdminInventoryQueryActivity
  limit: number
  cursor: string | null
  includeFilterOptions: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function optionalText(value: string | null) {
  const normalized = value?.trim() ?? ''
  return normalized === '' || normalized === 'ALL' ? null : normalized
}

export function parseAdminInventoryQuery(searchParams: URLSearchParams):
  | { ok: true; value: AdminInventoryQueryParams }
  | { ok: false; message: string } {
  const rawProductType = (searchParams.get('productType')?.trim().toUpperCase() || 'ALL') as AdminInventoryQueryProductType
  if (!['ALL', 'CAR', 'BIKE', 'ACCESSORY'].includes(rawProductType)) {
    return { ok: false, message: 'Loại sản phẩm không hợp lệ.' }
  }

  const productId = optionalText(searchParams.get('productId'))
  if (productId && !UUID_PATTERN.test(productId)) {
    return { ok: false, message: 'Mã sản phẩm không hợp lệ.' }
  }

  const rawStatus = (searchParams.get('status')?.trim().toUpperCase() || 'ALL') as AdminInventoryQueryStatus | 'ALL'
  if (rawStatus !== 'ALL' && !ADMIN_INVENTORY_STATUSES.includes(rawStatus)) {
    return { ok: false, message: 'Trạng thái tồn kho không hợp lệ.' }
  }

  const rawActivity = (searchParams.get('activity')?.trim().toUpperCase() || 'ALL') as AdminInventoryQueryActivity
  if (!['ALL', 'ACTIVE', 'INACTIVE'].includes(rawActivity)) {
    return { ok: false, message: 'Trạng thái kinh doanh không hợp lệ.' }
  }

  const rawLimit = searchParams.get('limit')?.trim()
  const limit = rawLimit ? Number(rawLimit) : 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, message: 'Số dòng phải là số nguyên từ 1 đến 100.' }
  }

  const cursor = optionalText(searchParams.get('cursor'))
  if (cursor && cursor.length > 4096) {
    return { ok: false, message: 'Cursor không hợp lệ.' }
  }

  const search = searchParams.get('search')?.trim() || null
  if (search && search.length > 160) {
    return { ok: false, message: 'Từ khóa tìm kiếm không được vượt quá 160 ký tự.' }
  }

  const rawIncludeFilterOptions = searchParams.get('includeFilterOptions')?.trim().toLowerCase()
  if (rawIncludeFilterOptions && !['true', 'false'].includes(rawIncludeFilterOptions)) {
    return { ok: false, message: 'Tùy chọn tải bộ lọc không hợp lệ.' }
  }

  return {
    ok: true,
    value: {
      search,
      productType: rawProductType,
      productId,
      variant: optionalText(searchParams.get('variant')),
      color: optionalText(searchParams.get('color')),
      interiorColor: optionalText(searchParams.get('interiorColor')),
      status: rawStatus,
      activity: rawActivity,
      limit,
      cursor,
      includeFilterOptions: rawIncludeFilterOptions !== 'false',
    },
  }
}
