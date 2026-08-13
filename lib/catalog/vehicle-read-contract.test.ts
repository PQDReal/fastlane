import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { compareVehicleCatalogParity } from './vehicle-read-contract'
import { toMotorbikeCatalogParityItem } from '@/lib/motorbike-catalog'
import { toSalesAgentCatalogParityItem } from '@/lib/sales-agent/catalog/context'

const activeBikeIds = Array.from({ length: 19 }, (_, index) => `bike-${String(index + 1).padStart(2, '0')}`)

describe('vehicle catalog read contract parity', () => {
  it('keeps all 19 active BIKE identity/type/price facts aligned', () => {
    const publicItems = activeBikeIds.map((productId, index) => toMotorbikeCatalogParityItem({
      productId,
      name: `VinFast Bike ${index + 1}`,
      displayedPrice: 20_000_000 + index * 1_000_000,
    }))
    const salesAgentItems = activeBikeIds.map((id, index) => toSalesAgentCatalogParityItem({
      id,
      name: `VinFast Bike ${index + 1}`,
      productType: 'BIKE',
      price: 20_000_000 + index * 1_000_000,
    }))

    const result = compareVehicleCatalogParity(publicItems, salesAgentItems.flatMap((item) => item ? [item] : []))

    expect(result).toEqual({ publicCount: 19, salesAgentCount: 19, matchedCount: 19, mismatches: [] })
  })

  it('flags price drift and draft/inactive visibility drift instead of hiding it', () => {
    const result = compareVehicleCatalogParity([
      { productId: 'bike-live', name: 'Live', productType: 'BIKE', price: 10 },
      { productId: 'bike-draft', name: 'Draft', productType: 'BIKE', price: 20 },
    ], [
      { productId: 'bike-live', name: 'Live', productType: 'BIKE', price: 11 },
    ])

    expect(result.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'bike-live', field: 'price', publicValue: 10, salesAgentValue: 11 }),
      expect.objectContaining({ productId: 'bike-draft' }),
    ]))
    expect(result.matchedCount).toBe(0)
  })
})
