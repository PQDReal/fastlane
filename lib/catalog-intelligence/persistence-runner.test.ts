import { describe, expect, it, vi } from 'vitest'

import { buildCatalogPersistencePayload } from './persistence'
import {
  applyCatalogPersistencePayloads,
  parseCatalogPersistenceRpcResult,
  type CatalogPersistenceRpcResult,
} from './persistence-runner'
import type { CatalogProductInput } from './types'

function product(id: string, name: string, specifications: unknown): CatalogProductInput {
  return { id, name, productType: 'MOTORBIKE', updatedAt: '2026-08-24T00:00:00Z', specifications }
}

function result(productId: string, status: CatalogPersistenceRpcResult['status']): CatalogPersistenceRpcResult {
  return {
    status,
    productId,
    snapshotId: `snapshot-${productId}`,
    observations: status === 'applied' ? 1 : 0,
    candidates: status === 'applied' ? 1 : 0,
    factsCreated: status === 'applied' ? 1 : 0,
    factsUpdated: 0,
    factsKept: 0,
    conflicts: 0,
    events: status === 'applied' ? 1 : 0,
  }
}

describe('catalog persistence runner', () => {
  it('processes eligible payloads in stable product order and aggregates writes', async () => {
    const second = buildCatalogPersistencePayload(product(
      '00000000-0000-4000-8000-000000000002',
      'Second',
      { specs: { 'Tốc độ tối đa': '50 km/h' } },
    ))
    const first = buildCatalogPersistencePayload(product(
      '00000000-0000-4000-8000-000000000001',
      'First',
      { specs: { 'Tốc độ tối đa': '40 km/h' } },
    ))
    const persist = vi.fn(async (payload) => result(
      payload.productId,
      payload.productId.endsWith('1') ? 'applied' : 'already_applied',
    ))

    const report = await applyCatalogPersistencePayloads([second, first], persist)

    expect(persist.mock.calls.map(([payload]) => payload.productId)).toEqual([first.productId, second.productId])
    expect(report).toMatchObject({
      mode: 'APPLY',
      plannedProducts: 2,
      processedProducts: 2,
      appliedSnapshots: 1,
      alreadyAppliedSnapshots: 1,
      observations: 1,
      candidates: 1,
      factsCreated: 1,
      events: 1,
      writes: 4,
    })
  })

  it('skips snapshots with extractor warnings instead of persisting false completeness', async () => {
    const unsupported = buildCatalogPersistencePayload({
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Accessory without registered schema',
      productType: 'ACCESSORY',
      specifications: {},
    })
    const persist = vi.fn()

    const report = await applyCatalogPersistencePayloads([unsupported], persist)

    expect(persist).not.toHaveBeenCalled()
    expect(report.skippedProducts).toEqual([
      expect.objectContaining({
        productId: unsupported.productId,
        warningCodes: ['UNSUPPORTED_PRODUCT_TYPE'],
      }),
    ])
  })

  it('stops with product context when an atomic snapshot call fails', async () => {
    const payload = buildCatalogPersistencePayload(product(
      '00000000-0000-4000-8000-000000000004',
      'Broken product',
      { specs: { 'Tốc độ tối đa': '45 km/h' } },
    ))

    await expect(applyCatalogPersistencePayloads([payload], async () => {
      throw new Error('RPC unavailable')
    })).rejects.toThrow(`Persist catalog snapshot failed for Broken product (${payload.productId}): RPC unavailable`)
  })

  it('rejects malformed RPC counters before aggregating a report', () => {
    expect(() => parseCatalogPersistenceRpcResult({
      ...result('product-1', 'applied'),
      factsCreated: -1,
    })).toThrow('Persistence RPC returned invalid factsCreated.')
  })
})
