import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ publicCatalog: vi.fn(), browseCatalog: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/motorbike-catalog', () => ({ listMotorbikeCatalog: mocks.publicCatalog }))
vi.mock('@/lib/sales-agent/catalog/browse', () => ({ browseCatalogRepository: mocks.browseCatalog }))

import { readMotorbikeCatalogParity } from './vehicle-read-parity'

describe('live vehicle catalog parity adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads both domain paths with the same BIKE scope and bounded candidate set', async () => {
    mocks.publicCatalog.mockResolvedValue([
      { productId: 'bike-1', name: 'Evo Grand', displayedPrice: 20_000_000 },
    ])
    mocks.browseCatalog.mockResolvedValue({
      outcome: 'SUCCESS',
      data: {
        items: [
          { id: 'bike-1', name: 'Evo Grand', productType: 'BIKE', price: 20_000_000 },
        ],
      },
    })

    await expect(readMotorbikeCatalogParity()).resolves.toMatchObject({
      publicCount: 1,
      salesAgentCount: 1,
      matchedCount: 1,
      mismatches: [],
    })
    expect(mocks.browseCatalog).toHaveBeenCalledWith({ productTypes: ['BIKE'], page: { limit: 20 } })
  })
})
