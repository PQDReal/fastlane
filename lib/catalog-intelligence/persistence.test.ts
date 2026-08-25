import { describe, expect, it } from 'vitest'

import { catalogSourceHash } from './hash'
import { buildCatalogPersistencePayload } from './persistence'
import type { CatalogProductInput } from './types'

const kinet: CatalogProductInput = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Kinet',
  productType: 'MOTORBIKE',
  updatedAt: '2026-08-24T10:30:00+07:00',
  specifications: {
    url: 'https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kinet',
    specs: {
      'Thời gian sạc tiêu chuẩn': 'Khoảng 9 giờ; khoảng 3,5 giờ nếu dùng sạc 1000 W',
    },
  },
}

describe('catalog intelligence persistence planner', () => {
  it('keeps contextual Kinet charging values as separate canonical proposals', () => {
    const payload = buildCatalogPersistencePayload(kinet)

    expect(payload).toMatchObject({
      payloadVersion: 1,
      extractorVersion: 'catalog-extractor-v2',
      selectionPolicyVersion: 'catalog-selection-v2',
      snapshotCompleteness: 'FULL',
      observedAt: '2026-08-24T03:30:00.000Z',
      sourceReview: null,
    })
    expect(payload.observations).toHaveLength(1)
    expect(payload.observations[0].candidates).toHaveLength(2)
    expect(payload.canonicalFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        definitionKey: 'charging_time',
        value: expect.objectContaining({ durationSeconds: 32_400 }),
        qualifiers: [{ key: 'charging_mode', value: 'STANDARD' }],
      }),
      expect.objectContaining({
        definitionKey: 'charging_time',
        value: expect.objectContaining({ durationSeconds: 12_600 }),
        qualifiers: [{ key: 'charger_power_w', value: 1000, unit: 'W' }],
      }),
    ]))
    expect(payload.events).toEqual([])
  })

  it('creates a deterministic review event for an unknown technical key', () => {
    const payload = buildCatalogPersistencePayload({
      ...kinet,
      specifications: { specs: { 'Thông số hoàn toàn mới': '123 foo' } },
    })

    expect(payload.observations[0]).toMatchObject({
      resolutionStatus: 'UNKNOWN_SPEC',
      definitionKey: null,
      candidates: [],
    })
    expect(payload.canonicalFacts).toEqual([])
    expect(payload.events).toEqual([
      expect.objectContaining({ eventType: 'NEW_SPEC_TYPE', sourcePath: 'specs.Thông số hoàn toàn mới' }),
    ])
  })

  it('blocks a reviewed source snapshot before creating canonical proposals', () => {
    const payload = buildCatalogPersistencePayload(kinet, {
      sourceReview: (product) => ({
        productId: product.id,
        productName: product.name,
        sourceHash: catalogSourceHash(product.specifications),
        reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
        reason: 'Snapshot không còn khớp nguồn chính thức.',
        evidenceUrls: ['https://vinfastauto.com/vn_vi/'],
        reviewedAt: '2026-08-24',
      }),
    })

    expect(payload.observations.every((item) => item.resolutionStatus === 'SOURCE_CONFLICT')).toBe(true)
    expect(payload.canonicalFacts).toEqual([])
    expect(payload.events).toEqual([
      expect.objectContaining({ eventType: 'SOURCE_CONFLICT', sourcePath: '$snapshot' }),
    ])
  })

  it('rejects a source review that is not bound to the exact snapshot', () => {
    expect(() => buildCatalogPersistencePayload(kinet, {
      sourceReview: (product) => ({
        productId: product.id,
        productName: product.name,
        sourceHash: 'a'.repeat(64),
        reasonCode: 'OFFICIAL_SOURCE_CONFLICT',
        reason: 'Stale review.',
        evidenceUrls: [],
        reviewedAt: '2026-08-24',
      }),
    })).toThrow(`Source review hash mismatch for product ${kinet.id}.`)
  })

  it('is byte-stable for the same product snapshot', () => {
    expect(JSON.stringify(buildCatalogPersistencePayload(kinet))).toBe(
      JSON.stringify(buildCatalogPersistencePayload({ ...kinet })),
    )
  })
})
