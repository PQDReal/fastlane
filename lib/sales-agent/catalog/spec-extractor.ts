export type CanonicalVehicleSpecs = {
  battery?: string
  batteryCapacityKwh?: string | number
  batteryType?: string
  range?: string
  rangeKm?: string | number
  topSpeed?: string
  topSpeedKmh?: string | number
  weight?: string
  weightKg?: string | number
  power?: string
  powerKw?: string | number
  chargingTime?: string
  fastChargeMin?: string | number
  warranty?: string
  warrantyVehicle?: string
  warrantyBattery?: string
  seats?: string | number
  trunk?: string
  trunkLiters?: string | number
  dimensions?: string
  groundClearance?: string
  rawFlatSpecs: Record<string, string>
}

function cleanHtml(val: unknown): string {
  if (val == null) return ''
  const str = String(val).trim()
  return str.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').trim()
}

/**
 * Recursively flattens any nested specification structure into a flat Record<string, string>.
 * Supports:
 * - specifications.specifications_flat
 * - specifications.specs (bike flat specs or car versioned specs like Eco/Plus)
 * - specifications root keys
 */
export function flattenRawSpecifications(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return result

  const obj = raw as Record<string, any>

  // 1. Direct flat specifications_flat
  if (obj.specifications_flat && typeof obj.specifications_flat === 'object' && !Array.isArray(obj.specifications_flat)) {
    for (const [k, v] of Object.entries(obj.specifications_flat)) {
      if (v != null && typeof v !== 'object') {
        result[k] = cleanHtml(v)
      }
    }
  }

  // 2. Direct specs object
  if (obj.specs && typeof obj.specs === 'object' && !Array.isArray(obj.specs)) {
    for (const [k, v] of Object.entries(obj.specs)) {
      if (v == null) continue
      if (typeof v !== 'object') {
        if (cleanHtml(v)) result[k] = cleanHtml(v)
      } else {
        // Nested version object like "Eco": { specs: { powertrain: { ... } } }
        const sub = v as Record<string, any>
        if (sub.specs && typeof sub.specs === 'object') {
          for (const [category, catObj] of Object.entries(sub.specs)) {
            if (catObj && typeof catObj === 'object') {
              for (const [propKey, propVal] of Object.entries(catObj as Record<string, any>)) {
                if (propVal != null && typeof propVal !== 'object' && cleanHtml(propVal)) {
                  result[`${category}.${propKey}`] = cleanHtml(propVal)
                  result[propKey] = cleanHtml(propVal)
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Root level keys (except complex non-spec keys)
  const ignoredRootKeys = new Set(['url', 'name', 'price', 'deposit', 'gallery', 'images', 'colors', 'color_details', 'variants', 'options', 'marketing', 'product_variants', 'vehicle_variants', 'detail_images', 'representative_image'])
  for (const [k, v] of Object.entries(obj)) {
    if (ignoredRootKeys.has(k)) continue
    if (v != null && typeof v !== 'object' && !result[k]) {
      const cleaned = cleanHtml(v)
      if (cleaned) result[k] = cleaned
    }
  }

  return result
}

function findFirstMatching(flat: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (flat[key] && flat[key].trim().length > 0) {
      return flat[key].trim()
    }
  }
  // Try case-insensitive matching
  const lowerMap = new Map<string, string>()
  for (const [k, v] of Object.entries(flat)) {
    lowerMap.set(k.toLowerCase(), v)
  }
  for (const key of keys) {
    const val = lowerMap.get(key.toLowerCase())
    if (val && val.trim().length > 0) {
      return val.trim()
    }
  }
  return undefined
}

/**
 * Extracts canonical vehicle specifications from a product.
 * NEVER INJECTS HARDCODED / HALLUCINATED DEFAULTS.
 */
export function extractCanonicalVehicleSpecs(product: {
  name?: string
  productType?: 'CAR' | 'BIKE' | 'ACCESSORY' | string
  specifications?: unknown
}): CanonicalVehicleSpecs {
  const flat = flattenRawSpecifications(product.specifications)
  const isBike = product.productType === 'BIKE'
  const isCar = product.productType === 'CAR'

  // 1. Battery
  let battery: string | undefined
  const batteryType = findFirstMatching(flat, ['Loại pin/ắc quy', 'battery_type', 'batteryType', 'Loại pin'])
  const batteryCap = findFirstMatching(flat, ['Dung lượng pin/ắc quy', 'Dung lượng pin', 'battery_kwh', 'batteryCapacity', 'battery_capacity_kwh'])
  const directBattery = findFirstMatching(flat, ['battery', 'Pin', 'Thông số pin'])

  if (directBattery) {
    battery = directBattery
  } else if (batteryType && batteryCap) {
    battery = `${batteryType} ${batteryCap}`
  } else if (batteryCap) {
    battery = batteryCap.toLowerCase().includes('kwh') || batteryCap.toLowerCase().includes('pin') ? batteryCap : `Pin ${batteryCap} kWh`
  } else if (batteryType) {
    battery = batteryType.toLowerCase().includes('pin') || batteryType.toLowerCase().includes('ắc quy') ? batteryType : `Pin ${batteryType}`
  }

  // 2. Top Speed
  const topSpeed = findFirstMatching(flat, [
    'Tốc độ tối đa',
    'Tốc độ tối đa - SPORT',
    'top_speed_kmh',
    'topSpeed',
    'Tốc độ tối đa (km/h)',
    'max_speed',
  ])

  // 3. Range
  const range = findFirstMatching(flat, [
    'Quãng đường đi được mỗi lần sạc',
    'Quãng đường đi được',
    'range_km',
    'distance',
    'range_text',
    'Tầm hoạt động',
    'Quãng đường di chuyển',
  ])

  // 4. Weight
  const weight = findFirstMatching(flat, [
    'Trọng lượng xe',
    'Trọng lượng',
    'Khối lượng / Tải trọng',
    'kurbWeightPayload',
    'Khối lượng bản thân',
    'weight',
  ])

  // 5. Power
  const power = findFirstMatching(flat, [
    'Công suất tối đa',
    'Công suất danh định',
    'maxPower',
    'power_kw',
    'power_w',
    'power_hp',
    'Công suất',
  ])

  // 6. Charging Time
  const chargingTime = findFirstMatching(flat, [
    'Thời gian sạc tiêu chuẩn',
    'Thời gian sạc nhanh',
    'Thời gian sạc',
    'fastChargingTime',
    'fast_charge_min',
    'maxDCCharging',
  ])

  // 7. Seats
  const seats = findFirstMatching(flat, ['Số chỗ ngồi', 'numberOfSeats', 'seats', 'Số chỗ'])

  // 8. Trunk
  const trunk = findFirstMatching(flat, ['Thể tích cốp', 'trunk_liters', 'Cốp xe', 'trunk'])

  // 9. Dimensions
  const dimensions = findFirstMatching(flat, ['Dài x Rộng x Cao (mm)', 'Dài x Rộng x Cao', 'length', 'Kích thước'])

  // 10. Ground Clearance
  const groundClearance = findFirstMatching(flat, ['Khoảng sáng gầm', 'Khoảng sáng gầm xe', 'croundClearance', 'ground_clearance'])

  // 11. Warranty
  const warranty = findFirstMatching(flat, ['Bảo hành', 'Bảo hành xe', 'warranty', 'warranty_vehicle'])

  return {
    battery,
    batteryCapacityKwh: batteryCap,
    batteryType,
    range,
    rangeKm: range,
    topSpeed,
    topSpeedKmh: topSpeed,
    weight,
    weightKg: weight,
    power,
    powerKw: power,
    chargingTime,
    fastChargeMin: chargingTime,
    warranty,
    warrantyVehicle: warranty,
    warrantyBattery: findFirstMatching(flat, ['warranty_battery', 'Bảo hành pin']),
    seats,
    trunk,
    trunkLiters: trunk,
    dimensions,
    groundClearance,
    rawFlatSpecs: flat,
  }
}

/**
 * Returns a criterion's fact value and display string for comparison/details.
 */
export function getCanonicalSpecFact(
  specs: CanonicalVehicleSpecs,
  criterionKey: string,
): { displayValue: string; rawValue: unknown } | undefined {
  const normKey = criterionKey.toLowerCase().replace(/[-_]/g, '')

  if (normKey.includes('battery') || normKey.includes('pin')) {
    if (specs.battery) return { displayValue: specs.battery, rawValue: specs.battery }
  }
  if (normKey.includes('speed') || normKey.includes('tocdo') || normKey === 'topspeedkmh') {
    if (specs.topSpeed) return { displayValue: specs.topSpeed, rawValue: specs.topSpeed }
  }
  if (normKey.includes('range') || normKey.includes('quangduong') || normKey === 'rangekm') {
    if (specs.range) return { displayValue: specs.range, rawValue: specs.range }
  }
  if (normKey.includes('weight') || normKey.includes('trongluong') || normKey.includes('khoiluong')) {
    if (specs.weight) return { displayValue: specs.weight, rawValue: specs.weight }
  }
  if (normKey.includes('power') || normKey.includes('congsuat') || normKey === 'maxpowerkw') {
    if (specs.power) return { displayValue: specs.power, rawValue: specs.power }
  }
  if (normKey.includes('seat') || normKey.includes('cho') || normKey === 'seats') {
    if (specs.seats) return { displayValue: `${specs.seats} chỗ`, rawValue: specs.seats }
  }
  if (normKey.includes('charge') || normKey.includes('sac') || normKey === 'chargingtime') {
    if (specs.chargingTime) return { displayValue: specs.chargingTime, rawValue: specs.chargingTime }
  }
  if (normKey.includes('trunk') || normKey.includes('cop')) {
    if (specs.trunk) return { displayValue: specs.trunk, rawValue: specs.trunk }
  }
  if (normKey.includes('warranty') || normKey.includes('baohanh')) {
    if (specs.warranty) return { displayValue: specs.warranty, rawValue: specs.warranty }
  }

  // Fallback to raw flat matching
  if (specs.rawFlatSpecs[criterionKey]) {
    return { displayValue: specs.rawFlatSpecs[criterionKey], rawValue: specs.rawFlatSpecs[criterionKey] }
  }

  return undefined
}
