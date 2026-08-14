import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { compareVehicleCatalogParity } from './vehicle-read-contract'
import { toMotorbikeCatalogParityItem } from '@/lib/motorbike-catalog'

function toSalesAgentCatalogParityItem(item: { id: string; name: string; productType: 'BIKE'; price: number }) {
  return {
    productId: item.id,
    name: item.name,
    productType: item.productType,
    price: item.price,
  }
}

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
    const publicItems = [
      toMotorbikeCatalogParityItem({ productId: 'bike-1', name: 'Bike One', displayedPrice: 20_000_000 }),
    ]
    const salesAgentItems = [
      toSalesAgentCatalogParityItem({ id: 'bike-1', name: 'Bike One', productType: 'BIKE', price: 22_000_000 }),
    ]

    const result = compareVehicleCatalogParity(publicItems, salesAgentItems)

    expect(result.mismatches).toEqual([
      { productId: 'bike-1', field: 'price', publicValue: 20_000_000, salesAgentValue: 22_000_000 },
    ])
  })
})
