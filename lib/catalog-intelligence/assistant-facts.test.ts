import { describe, expect, it, vi } from 'vitest'

import {
  loadCanonicalAssistantFacts,
  mapCanonicalAssistantFactRows,
  resolveCatalogFactReadMode,
} from './assistant-facts'

describe('catalog intelligence assistant fact reader', () => {
  it('defaults invalid or missing read modes to legacy', () => {
    expect(resolveCatalogFactReadMode(undefined)).toBe('legacy')
    expect(resolveCatalogFactReadMode('unexpected')).toBe('legacy')
    expect(resolveCatalogFactReadMode(' SHADOW ')).toBe('shadow')
    expect(resolveCatalogFactReadMode('canonical')).toBe('canonical')
  })

  it('maps valid PostgREST rows and keeps contextual facts ordered', () => {
    expect(mapCanonicalAssistantFactRows([
      {
        product_id: 'product-1',
        display_value: '70 km/h',
        numeric_value: '70',
        canonical_unit: 'km/h',
        context_key: 'standard',
        catalog_spec_definitions: [{ canonical_key: 'top_speed_kmh' }],
      },
      {
        product_id: 'product-1',
        display_value: '50 km/h',
        numeric_value: 50,
        canonical_unit: 'km/h',
        context_key: 'eco',
        catalog_spec_definitions: { canonical_key: 'top_speed_kmh' },
      },
      { product_id: 'product-1', display_value: '', catalog_spec_definitions: { canonical_key: 'range_km' } },
    ])).toEqual([
      {
        productId: 'product-1',
        canonicalKey: 'top_speed_kmh',
        displayValue: '50 km/h',
        numericValue: 50,
        canonicalUnit: 'km/h',
        contextKey: 'eco',
      },
      {
        productId: 'product-1',
        canonicalKey: 'top_speed_kmh',
        displayValue: '70 km/h',
        numericValue: 70,
        canonicalUnit: 'km/h',
        contextKey: 'standard',
      },
    ])
  })

  it('deduplicates query inputs and reports an available result', async () => {
    const fetchRows = vi.fn().mockResolvedValue({
      data: [{
        product_id: 'product-1',
        display_value: '70 km/h',
        numeric_value: 70,
        canonical_unit: 'km/h',
        context_key: 'default',
        catalog_spec_definitions: { canonical_key: 'top_speed_kmh' },
      }],
      error: null,
    })

    const result = await loadCanonicalAssistantFacts(
      ['product-1', 'product-1'],
      ['top_speed_kmh', 'top_speed_kmh'],
      fetchRows,
    )

    expect(fetchRows).toHaveBeenCalledWith(['product-1'], ['top_speed_kmh'])
    expect(result.status).toBe('available')
    expect(result.facts).toHaveLength(1)
  })

  it('fails closed without throwing when the canonical schema is unavailable', async () => {
    const result = await loadCanonicalAssistantFacts(
      ['product-1'],
      ['top_speed_kmh'],
      vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST205' } }),
    )

    expect(result).toEqual({ status: 'unavailable', facts: [], errorCode: 'PGRST205' })
  })
})
