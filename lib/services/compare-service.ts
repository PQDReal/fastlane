import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProductImage } from '@/lib/get-product-image'

export type ComparableVariant = {
  id: string
  name: string
  sku: string
  originalPrice: number
  salePrice: number | null
}

export type ComparableVehicle = {
  id: string
  name: string
  slug: string
  category: string
  imageUrl: string | null
  displayedPrice: number | null
  specifications: Record<string, string>
  variants: ComparableVariant[]
}

type ProductRow = {
  id: string
  name: string
  slug: string
  image_urls: unknown
  displayed_price: number | null
  specifications: unknown
  categories: { name: string } | { name: string }[] | null
  product_variants: { id: string; name: string; sku: string; original_price: number; sale_price: number | null }[] | null
}

const COMPARABLE_CATEGORIES = new Set(['Ô tô điện', 'Xe máy điện'])
const HIDDEN_SPECIFICATION_KEYS = new Set(['url', 'name', 'product_type'])
const CAR_CATEGORY = 'Ô tô điện'

type JsonRecord = Record<string, unknown>

const CAR_SPECIFICATION_FIELDS: [string, string][] = [
  ['dimension.length', 'Kích thước (D x R x C)'],
  ['dimension.wheelbase', 'Chiều dài cơ sở (mm)'],
  ['dimension.croundClearance', 'Khoảng sáng gầm xe (mm)'],
  ['dimension.kurbWeightPayload', 'Khối lượng / tải trọng (kg)'],
  ['powertrain.distance', 'Quãng đường di chuyển'],
  ['powertrain.maxPower', 'Công suất tối đa'],
  ['powertrain.maxTorque', 'Mô-men xoắn cực đại (Nm)'],
  ['powertrain.topSpeed', 'Tốc độ tối đa (km/h)'],
  ['powertrain.drivetrain', 'Hệ dẫn động'],
  ['powertrain.drivingModes', 'Chế độ lái'],
  ['powertrain.batteryCapacity', 'Dung lượng pin (kWh)'],
  ['powertrain.fastChargingTime', 'Thời gian sạc nhanh'],
  ['powertrain.maxACCharging', 'Công suất sạc AC'],
  ['powertrain.maxDCCharging', 'Công suất sạc DC'],
  ['powertrain.steering', 'Trợ lực lái'],
  ['powertrain.frontSuspension', 'Hệ thống treo trước'],
  ['powertrain.rearSuspension', 'Hệ thống treo sau'],
  ['interior.numberOfSeats', 'Số chỗ ngồi'],
  ['interior.informationCenter', 'Màn hình thông tin'],
  ['interior.audioSystem', 'Hệ thống âm thanh'],
  ['interior.airConditioner', 'Điều hòa'],
  ['interior.driverSeatAdjustment', 'Ghế lái'],
  ['interior.upholstery', 'Chất liệu ghế'],
  ['interior.isofix', 'Móc ghế trẻ em ISOFIX'],
  ['interior.wirelessCharger', 'Sạc không dây'],
  ['exterior.auto', 'Đèn chiếu sáng phía trước'],
  ['exterior.lazang', 'Kích thước la-zăng'],
  ['safety.airbagSystem', 'Túi khí'],
  ['safety.abs', 'Chống bó cứng phanh (ABS)'],
  ['safety.ebd', 'Phân phối lực phanh điện tử (EBD)'],
  ['safety.tcs', 'Kiểm soát lực kéo (TCS)'],
  ['safety.esc', 'Cân bằng điện tử (ESC)'],
  ['safety.frontBrake', 'Phanh trước'],
  ['safety.rearBrake', 'Phanh sau'],
  ['safety.tpms', 'Giám sát áp suất lốp'],
  ['safety.360Camera', 'Camera 360°'],
  ['safety.reverseCamera', 'Camera lùi'],
  ['adas.cruiseControl', 'Kiểm soát hành trình'],
  ['adas.blindSpotWarning', 'Cảnh báo điểm mù'],
  ['adas.forwardCollisionWarning', 'Cảnh báo va chạm phía trước'],
  ['adas.frontEmergencyAutoBraking', 'Phanh khẩn cấp tự động phía trước'],
]

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => asRecord(current)?.[key], value)
}

function cleanText(value: string): string | null {
  const text = value.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return text || null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function displayValue(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((item): item is string => Boolean(item))
    return values.length ? values.join(', ') : null
  }
  if (value && typeof value === 'object') {
    const values = Object.entries(value)
      .map(([key, item]) => {
        const displayed = displayValue(item)
        return displayed ? `${key}: ${displayed}` : null
      })
      .filter((item): item is string => Boolean(item))
    return values.length ? values.join('; ') : null
  }
  return null
}

function normalizeCarSpecifications(value: unknown): Record<string, string> {
  const root = asRecord(value)
  if (!root) return {}

  const editions = asRecord(root.specs)
  const entries = editions ? Object.entries(editions) : []
  const preferredNames = ['Eco', 'Comfort', 'Tiêu chuẩn', 'Plus']
  const selected = preferredNames
    .map((name) => entries.find(([edition]) => edition.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')))
    .find((entry) => entry !== undefined) ?? entries[0]

  const wrapper = asRecord(selected?.[1])
  const detail = asRecord(wrapper?.specs) ?? wrapper
  const result: Record<string, string> = {}

  if (selected) result['Phiên bản thông số'] = selected[0]
  if (detail) {
    for (const [path, label] of CAR_SPECIFICATION_FIELDS) {
      const displayed = displayValue(valueAtPath(detail, path))
      if (displayed) result[label] = displayed
    }
  }

  const range = displayValue(root.range_text ?? root.range_km)
  const seats = displayValue(root.seat_count)
  if (!result['Quãng đường di chuyển'] && range) result['Quãng đường di chuyển'] = range
  if (!result['Số chỗ ngồi'] && seats) result['Số chỗ ngồi'] = seats

  return result
}

function normalizeSpecifications(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_') && !HIDDEN_SPECIFICATION_KEYS.has(key))
      .map(([key, item]) => [key, displayValue(item)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}

function normalizeMotorbikeSpecifications(value: unknown): Record<string, string> {
  const root = asRecord(value)
  if (!root) return {}

  // Published motorbike records keep technical fields under `specs`.
  // Other root fields are catalog metadata and media, not specifications.
  return normalizeSpecifications(asRecord(root.specs) ?? root)
}

export async function listComparableVehicles(): Promise<ComparableVehicle[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select(`id,name,slug,image_urls,displayed_price,specifications,categories(name),product_variants(id,name,sku,original_price,sale_price)`)
    .eq('is_active', true)
    .in('product_type', ['CAR', 'BIKE'])
    .eq('product_variants.is_active', true)
    .order('name')

  if (error) throw new Error(`Không thể tải dữ liệu so sánh: ${error.message}`)

  return ((data ?? []) as ProductRow[])
    .map((product) => {
      const category = Array.isArray(product.categories) ? product.categories[0] : product.categories
      const images = stringArray(product.image_urls)
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: category?.name ?? '',
        imageUrl: category?.name === CAR_CATEGORY ? getProductImage(product.name, images) : images[0] ?? null,
        displayedPrice: product.displayed_price,
        specifications: category?.name === CAR_CATEGORY
          ? normalizeCarSpecifications(product.specifications)
          : normalizeMotorbikeSpecifications(product.specifications),
        variants: (product.product_variants ?? []).map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          originalPrice: variant.original_price,
          salePrice: variant.sale_price,
        })),
      }
    })
    .filter((product) => COMPARABLE_CATEGORIES.has(product.category))
}
