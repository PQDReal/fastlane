import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ publicCatalog: vi.fn(), salesCatalog: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/motorbike-catalog', () => ({ listMotorbikeCatalog: mocks.publicCatalog }))
vi.mock('@/lib/sales-agent/catalog/context', () => ({ searchSalesAgentCatalog: mocks.salesCatalog }))

import { readMotorbikeCatalogParity } from './vehicle-read-parity'

describe('live vehicle catalog parity adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads both domain paths with the same BIKE scope and bounded candidate set', async () => {
    mocks.publicCatalog.mockResolvedValue([
      { productId: 'bike-1', name: 'Evo Grand', displayedPrice: 20_000_000 },
    ])
    mocks.salesCatalog.mockResolvedValue([
      { id: 'bike-1', name: 'Evo Grand', productType: 'BIKE', price: 20_000_000 },
      { id: 'accessory-1', name: 'Mũ bảo hiểm', productType: 'ACCESSORY', price: 500_000 },
    ])

    await expect(readMotorbikeCatalogParity()).resolves.toMatchObject({
      publicCount: 1,
      salesAgentCount: 1,
      matchedCount: 1,
      mismatches: [],
    })
    expect(mocks.salesCatalog).toHaveBeenCalledWith({ query: '', productTypes: ['BIKE'], limit: 20 })
  })
})
