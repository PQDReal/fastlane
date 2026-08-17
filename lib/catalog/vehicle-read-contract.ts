export type VehicleCatalogParityItem = {
  productId: string
  name: string
  productType: 'CAR' | 'BIKE'
  price: number | null
}

export type VehicleCatalogParityMismatch = {
  productId: string
  field: keyof Omit<VehicleCatalogParityItem, 'productId'>
  publicValue: string | number | null | undefined
  salesAgentValue: string | number | null | undefined
}

export type VehicleCatalogParityResult = {
  publicCount: number
  salesAgentCount: number
  matchedCount: number
  mismatches: VehicleCatalogParityMismatch[]
}

/**
 * Compares the small, user-visible read contract shared by public catalog and
 * Sales Agent. Detailed specs/configuration stay in their owning adapters;
 * identity, type, and effective listing price must not drift.
 */
export function compareVehicleCatalogParity(
  publicItems: VehicleCatalogParityItem[],
  salesAgentItems: VehicleCatalogParityItem[],
): VehicleCatalogParityResult {
  const publicById = new Map(publicItems.map((item) => [item.productId, item]))
  const salesAgentById = new Map(salesAgentItems.map((item) => [item.productId, item]))
  const ids = new Set([...publicById.keys(), ...salesAgentById.keys()])
  const mismatches: VehicleCatalogParityMismatch[] = []
  let matchedCount = 0

  for (const productId of ids) {
    const publicItem = publicById.get(productId)
    const salesAgentItem = salesAgentById.get(productId)
    if (!publicItem || !salesAgentItem) {
      mismatches.push({
        productId,
        field: 'productType',
        publicValue: publicItem?.productType,
        salesAgentValue: salesAgentItem?.productType,
      })
      continue
    }

    const fields: Array<keyof Omit<VehicleCatalogParityItem, 'productId'>> = ['name', 'productType', 'price']
    const itemMismatches = fields.flatMap((field) => publicItem[field] === salesAgentItem[field]
      ? []
      : [{ productId, field, publicValue: publicItem[field], salesAgentValue: salesAgentItem[field] }])
    if (itemMismatches.length) mismatches.push(...itemMismatches)
    else matchedCount += 1
  }

  return {
    publicCount: publicItems.length,
    salesAgentCount: salesAgentItems.length,
    matchedCount,
    mismatches,
  }
}
