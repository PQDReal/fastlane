import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assertVerification,
  buildVerificationReport,
} from './published-catalog-verifier.mjs'
import { loadPublishedSources } from './sync-published-catalog-options.mjs'

function cleanFixture() {
  return {
    sources: [
      {
        name: 'Vehicle',
        categorySlug: 'vehicles',
        kind: 'car',
        productId: 'product-1',
        variants: [{ sku: 'VEHICLE-1', selection: { version: 'base' } }],
      },
      {
        name: 'Accessory',
        categorySlug: 'accessories',
        kind: 'accessory',
        productId: 'product-2',
        variants: [{ sku: 'ACCESSORY-1', selection: {} }],
      },
    ],
    products: [
      { id: 'product-1', name: 'Vehicle', is_active: true, category: { slug: 'vehicles' } },
      { id: 'product-2', name: 'Accessory', is_active: true, category: { slug: 'accessories' } },
    ],
    variants: [
      {
        id: 'variant-1',
        product_id: 'product-1',
        sku: 'VEHICLE-1',
        is_active: true,
        option_signature: 'version=base',
      },
      {
        id: 'variant-2',
        product_id: 'product-2',
        sku: 'ACCESSORY-1',
        is_active: true,
        option_signature: null,
      },
    ],
    groups: [
      { id: 'group-1', product_id: 'product-1', code: 'version', is_active: true },
    ],
    values: [
      {
        id: 'value-1',
        product_id: 'product-1',
        option_group_id: 'group-1',
        code: 'base',
        is_active: true,
      },
    ],
    mappings: [
      {
        product_id: 'product-1',
        variant_id: 'variant-1',
        option_group_id: 'group-1',
        option_value_id: 'value-1',
      },
    ],
    media: [
      { id: 'media-1', product_id: 'product-1', variant_id: null, option_value_id: null, is_active: true },
      { id: 'media-2', product_id: 'product-2', variant_id: null, option_value_id: null, is_active: true },
    ],
    inventory: [{ variant_id: 'variant-2' }],
  }
}

describe('published catalog source', () => {
  it('contains the reconciled 110 products and 276 canonical variants', () => {
    const sources = loadPublishedSources()

    expect(sources).toHaveLength(110)
    expect(sources.reduce((count, source) => count + source.variants.length, 0)).toBe(276)
    expect(sources.find(source => source.data.name === 'VinFast VF MPV 7')?.variants[0].sku)
      .toBe('VINFAST-VFMPV7-01')
    expect(sources.find(source => source.data.name === 'VinFast VF 8 The All-New 2026')?.variants[0].sku)
      .toBe('VINFAST-VF8ALLNEW-01')
    expect(sources.find(source => source.data.name === 'VF 9')?.variants.map(variant => variant.sku))
      .toContain('VINFAST-VF9-03')
    expect(sources.find(source => source.data.name === 'Viper')?.variants.map(variant => variant.sku))
      .toContain('VINFAST-VIPER-02')
    expect(sources.find(source => source.data.name === 'Flazz Max')?.variants.map(variant => variant.sku))
      .toContain('VINFAST-FLAZZMAX-02')
  })

  it('keeps public-only motorbikes and has one master entry for every reconciled product', () => {
    const motorbikes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/by_type/motorbikes.json'), 'utf8'))
    const master = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/master_products.json'), 'utf8'))

    for (const name of ['Vero X', 'Evo Lite Neo', 'Evo Neo']) {
      expect(motorbikes.filter(product => product.name === name)).toHaveLength(1)
    }
    for (const [bucket, names] of Object.entries({
      cars: ['VinFast VF MPV 7', 'VinFast VF 8 The All-New 2026'],
      motorbikes: ['Kinet', 'Kyo'],
    })) {
      for (const name of names) {
        expect(master[bucket].filter(product => product.name === name)).toHaveLength(1)
      }
    }
  })
})

describe('published catalog verifier', () => {
  it('accepts a fully matched normalized catalog', () => {
    const report = buildVerificationReport(cleanFixture())

    expect(report).toMatchObject({
      sourceProducts: 2,
      matchedProducts: 2,
      sourceVariants: 2,
      matchedVariants: 2,
      groups: 1,
      values: 1,
      mappings: 1,
      media: 2,
      productsWithoutMedia: [],
      productsOutsideSource: [],
      variantsOutsideSource: [],
      errors: [],
    })
    expect(() => assertVerification(report)).not.toThrow()
  })

  it('reports stale variants, mapping defects, media mismatches, and missing accessory inventory', () => {
    const fixture = cleanFixture()
    fixture.variants.push({
      id: 'variant-stale',
      product_id: 'product-1',
      sku: 'VEHICLE-LEGACY',
      is_active: true,
      option_signature: null,
    })
    fixture.values[0].code = 'plus'
    fixture.media.push({
      id: 'media-wrong-product',
      product_id: 'product-1',
      variant_id: 'variant-2',
      option_value_id: null,
      is_active: true,
    })
    fixture.inventory = []

    const report = buildVerificationReport(fixture)

    expect(report.variantsOutsideSource.map(variant => variant.sku)).toEqual(['VEHICLE-LEGACY'])
    expect(report.integrity.mappingErrors.some(error => error.reason === 'source-selection-mismatch')).toBe(true)
    expect(report.integrity.mediaProductMismatches).toHaveLength(1)
    expect(report.integrity.activeAccessoryVariantsMissingInventory.map(variant => variant.sku))
      .toEqual(['ACCESSORY-1'])
    expect(() => assertVerification(report)).toThrow('Catalog verification failed')
  })

  it('reports products without media while honoring an explicit allowlist', () => {
    const fixture = cleanFixture()
    fixture.media = fixture.media.filter(item => item.product_id !== 'product-1')

    const report = buildVerificationReport({
      ...fixture,
      productsWithoutMediaAllowlist: new Set(['Vehicle']),
    })

    expect(report.productsWithoutMedia).toEqual([{ id: 'product-1', name: 'Vehicle' }])
    expect(report.integrity.productsWithoutRequiredMedia).toEqual([])
    expect(report.errors).toEqual([])
  })

  it('rejects duplicate source SKUs and option signatures', () => {
    const fixture = cleanFixture()
    fixture.sources[0].variants.push({ sku: 'VEHICLE-2', selection: { version: 'base' } })
    fixture.sources[1].variants[0].sku = 'vehicle-1'

    const report = buildVerificationReport(fixture)

    expect(report.integrity.duplicateSourceSkus).toHaveLength(1)
    expect(report.integrity.duplicateSourceSignatures).toHaveLength(1)
    expect(report.errors).toContain('duplicateSourceSkus: 1')
    expect(report.errors).toContain('duplicateSourceSignatures: 1')
  })
})
