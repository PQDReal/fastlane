import { describe, expect, it } from 'vitest'

import {
  COLLECTION_DEFINITIONS,
  collectionMembershipsForProduct,
  taxonomyManifest,
  validatePublishedTaxonomy,
} from './catalog-taxonomy-source.mjs'
import { buildTaxonomyVerificationReport, loadPublishedTaxonomy } from './sync-catalog-taxonomy.mjs'

describe('published catalog taxonomy v2', () => {
  it('publishes the audited source counts with stable collection keys', () => {
    const publication = loadPublishedTaxonomy()

    expect(publication.report).toEqual({
      schemaVersion: 2,
      products: 83,
      collections: 13,
      vehicleModels: 8,
      categoryMemberships: 88,
      modelMemberships: 52,
      errors: [],
    })
    expect(new Set(COLLECTION_DEFINITIONS.map(item => item.sourceKey)).size).toBe(13)
  })

  it('keeps one primary category and never marks a model collection as primary', () => {
    const memberships = collectionMembershipsForProduct({
      pid: 'PRODUCT-1',
      category: 'Phong cách sống',
      categories: ['Phong cách sống', 'Phụ kiện ô tô điện'],
      compatible_models: ['VF 3'],
    })

    expect(memberships.filter(item => item.is_primary).map(item => item.source_key)).toEqual(['5003'])
    expect(memberships.find(item => item.kind === 'MODEL')?.is_primary).toBe(false)
  })

  it('rejects incomplete or internally inconsistent publications', () => {
    const manifest = taxonomyManifest({ crawledAt: '2026-07-27T00:00:00.000Z', expectedProducts: 1 })
    manifest.publication.status = 'FAILED'
    const report = validatePublishedTaxonomy(manifest, [{
      pid: 'PRODUCT-1',
      schema_version: 2,
      categories: [],
      compatible_models: [],
      collection_memberships: [],
    }])

    expect(report.errors).toContain('publication status must be COMPLETE')
    expect(report.errors).toContain('PRODUCT-1: expected exactly one primary membership')
  })

  it('verifies normalized database rows against published identities', () => {
    const publication = {
      manifest: {
        source_system: 'VINFAST_DEMANDWARE',
        collections: [{ source_key: '5003' }],
        vehicle_models: [],
      },
      products: [{
        pid: 'PRODUCT-1',
        collection_memberships: [{ source_system: 'VINFAST_DEMANDWARE', source_key: '5003' }],
      }],
      report: { products: 1 },
    }
    const report = buildTaxonomyVerificationReport({
      publication,
      database: {
        products: [{ id: 'product-1', specifications: { pid: 'PRODUCT-1' } }],
        vehicleModels: [],
        collections: [{ id: 'collection-1', source_key: '5003', is_active: true }],
        memberships: [{
          product_id: 'product-1', collection_id: 'collection-1',
          source_system: 'VINFAST_DEMANDWARE', is_active: true, is_primary: true,
        }],
      },
    })

    expect(report.errors).toEqual([])
  })
})
