export type VehicleSkuProductType = 'CAR' | 'BIKE'

type RpcError = { message?: string } | null
type VehicleSkuRpcClient = {
  rpc: (
    functionName: string,
    args: { target_product_type: VehicleSkuProductType; requested_count: number },
  ) => PromiseLike<{ data: unknown; error: RpcError }>
}

const VEHICLE_SKU_RULES = {
  CAR: { prefix: 'CAR', minimum: 10_000_001, maximum: 19_999_999 },
  BIKE: { prefix: 'BIK', minimum: 20_000_001, maximum: 29_999_999 },
} as const

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function configurationPart(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/\u0111/g, 'd')
    .replace(/\s+/g, ' ')
}

/** Same opaque 3-letter + 8-digit shape used by accessory SKUs. */
export function formatVehicleSku(productType: VehicleSkuProductType, sequenceValue: number) {
  const rule = VEHICLE_SKU_RULES[productType]
  if (!Number.isInteger(sequenceValue) || sequenceValue < rule.minimum || sequenceValue > rule.maximum) {
    throw new Error(`Vehicle SKU sequence is outside the ${productType} range.`)
  }
  return `${rule.prefix}${String(sequenceValue).padStart(8, '0')}`
}

export function isCanonicalVehicleSku(value: unknown, productType?: VehicleSkuProductType): boolean {
  const sku = text(value).toUpperCase()
  if (productType) {
    const rule = VEHICLE_SKU_RULES[productType]
    return new RegExp(`^${rule.prefix}[0-9]{8}$`).test(sku)
      && Number(sku.slice(rule.prefix.length)) >= rule.minimum
      && Number(sku.slice(rule.prefix.length)) <= rule.maximum
  }
  return isCanonicalVehicleSku(sku, 'CAR') || isCanonicalVehicleSku(sku, 'BIKE')
}

/** Stable matching key used while preserving an existing configuration SKU on edit. */
export function vehicleConfigurationKey(input: {
  version: unknown
  color: unknown
  interiorColor?: unknown
}) {
  return [input.version, input.color, input.interiorColor]
    .map(configurationPart)
    .join('\u001f')
}

export async function allocateVehicleVariantSkus(
  client: VehicleSkuRpcClient,
  productType: VehicleSkuProductType,
  count: number,
) {
  if (!Number.isInteger(count) || count < 0 || count > 1_000) {
    throw new Error('Vehicle SKU allocation count must be between 0 and 1000.')
  }
  if (count === 0) return []

  const { data, error } = await client.rpc('allocate_vehicle_variant_skus', {
    target_product_type: productType,
    requested_count: count,
  })
  if (error) throw new Error(`Unable to allocate vehicle SKUs: ${error.message || 'unknown database error'}`)
  if (!Array.isArray(data) || data.length !== count) {
    throw new Error(`Vehicle SKU allocator returned ${Array.isArray(data) ? data.length : 0} of ${count} requested SKUs.`)
  }

  const skus = data.map((value) => text(value).toUpperCase())
  if (new Set(skus).size !== skus.length || skus.some((sku) => !isCanonicalVehicleSku(sku, productType))) {
    throw new Error('Vehicle SKU allocator returned duplicate or invalid SKUs.')
  }
  return skus
}
