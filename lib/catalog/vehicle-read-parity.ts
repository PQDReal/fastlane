import 'server-only'

import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { browseCatalogRepository } from '@/lib/sales-agent/catalog/browse'
import { compareVehicleCatalogParity, type VehicleCatalogParityResult } from './vehicle-read-contract'

/**
 * Diagnostic-only parity read. It deliberately calls domain repositories
 * directly rather than the public HTTP route, so a mismatch cannot be hidden
 * by serialization, cache or route-specific filtering.
 */
export async function readMotorbikeCatalogParity(): Promise<VehicleCatalogParityResult> {
  const [publicItems, salesAgentRes] = await Promise.all([
    listMotorbikeCatalog(),
    browseCatalogRepository({ productTypes: ['BIKE'], page: { limit: 20 } }),
  ])

  const publicFacts = publicItems.map((item) => ({
    productId: item.productId,
    name: item.name,
    productType: 'BIKE' as const,
    price: item.displayedPrice,
  }))

  const salesAgentFacts = (salesAgentRes.outcome === 'SUCCESS' ? salesAgentRes.data.items : [])
    .map((item) => ({
      productId: item.id,
      name: item.name,
      productType: 'BIKE' as const,
      price: item.price,
    }))

  return compareVehicleCatalogParity(publicFacts, salesAgentFacts)
}
