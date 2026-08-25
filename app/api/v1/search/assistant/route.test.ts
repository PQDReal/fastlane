import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  retrieveCatalogProducts: vi.fn(),
  loadCanonicalAssistantFacts: vi.fn(),
}))

vi.mock('@/lib/assistant/catalog-context', () => ({
  retrieveCatalogProducts: mocks.retrieveCatalogProducts,
}))

vi.mock('@/lib/catalog-intelligence/assistant-facts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/catalog-intelligence/assistant-facts')>(
    '@/lib/catalog-intelligence/assistant-facts',
  )
  return { ...actual, loadCanonicalAssistantFacts: mocks.loadCanonicalAssistantFacts }
})

import { POST } from './route'

const product = {
  id: 'product-1',
  name: 'VinFast VF 9',
  slug: 'vinfast-vf-9',
  category: 'Ô tô điện',
  product_type: 'CAR' as const,
  displayed_price: 1_499_000_000,
  image_urls: ['/vf9.jpg'],
  facts: {
    'technical.topSpeed': '200 km/h',
    'technical.range': '626 km',
  },
  searchableText: 'vinfast vf 9',
}

async function post(query: string) {
  return POST(new Request('http://localhost/api/v1/search/assistant', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  }))
}

describe('deterministic assistant canonical FAQ read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.retrieveCatalogProducts.mockResolvedValue([product])
    mocks.loadCanonicalAssistantFacts.mockResolvedValue({
      status: 'available',
      errorCode: null,
      facts: [{
        productId: product.id,
        canonicalKey: 'top_speed_kmh',
        displayValue: '201 km/h',
        numericValue: 201,
        canonicalUnit: 'km/h',
        contextKey: 'default',
      }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.CATALOG_FACT_READ_MODE
  })

  it('uses canonical data only for a READY FAQ key', async () => {
    process.env.CATALOG_FACT_READ_MODE = 'canonical'

    const response = await post('VF 9 tốc độ tối đa?')
    const body = await response.json()

    expect(body.data.message).toBe('VinFast VF 9 có tốc độ: 201 km/h.')
    expect(mocks.loadCanonicalAssistantFacts).toHaveBeenCalledWith([product.id], ['top_speed_kmh'])
    expect(body.data.products[0]).not.toHaveProperty('facts')
  })

  it('keeps a HOLD range FAQ on legacy data', async () => {
    process.env.CATALOG_FACT_READ_MODE = 'canonical'

    const response = await post('VF 9 đi được bao xa?')
    const body = await response.json()

    expect(body.data.message).toBe('VinFast VF 9 có phạm vi di chuyển: 626 km.')
    expect(mocks.loadCanonicalAssistantFacts).not.toHaveBeenCalled()
  })

  it('keeps serving legacy data when the canonical tables are unavailable', async () => {
    process.env.CATALOG_FACT_READ_MODE = 'canonical'
    mocks.loadCanonicalAssistantFacts.mockResolvedValue({ status: 'unavailable', facts: [], errorCode: 'PGRST205' })

    const response = await post('VF 9 tốc độ tối đa?')
    const body = await response.json()

    expect(body.data.message).toBe('VinFast VF 9 có tốc độ: 200 km/h.')
  })
})
