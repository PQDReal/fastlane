import { describe, expect, it } from 'vitest'

import { resolveCatalogImageUrl, resolveCatalogMedia } from '@/lib/catalog/resolver'
import {
  changeOptionSelection,
  filterCompatibleVariants,
  getOptionAvailability,
  reconcileSelection,
  resolveExactVariant,
} from '@/lib/catalog/resolver'
import type { CatalogMedia, CatalogProduct, CatalogVariant } from '@/lib/catalog/types'

function variant(id: string, selectedOptions: Record<string, string>): CatalogVariant {
  return {
    id,
    productId: 'product-1',
    sku: id.toUpperCase(),
    name: id,
    originalPrice: 100,
    salePrice: null,
    effectivePrice: 100,
    depositAmount: null,
    availableQuantity: 1,
    optionSignature: null,
    metadata: {},
    selectedOptions,
    selectedOptionDetails: [],
  }
}

function media(id: string, scope: { variantId?: string; optionValueId?: string }, order = 0): CatalogMedia {
  return {
    id,
    productId: 'product-1',
    variantId: scope.variantId ?? null,
    optionValueId: scope.optionValueId ?? null,
    role: 'GALLERY',
    mediaType: 'IMAGE',
    url: `${id}.jpg`,
    altText: id,
    displayOrder: order,
    metadata: {},
  }
}

function product(): CatalogProduct {
  return {
    id: 'product-1',
    categoryId: null,
    category: null,
    name: 'Áo VF 7',
    slug: 'ao-vf-7',
    description: null,
    productType: 'ACCESSORY',
    displayedPrice: null,
    depositPrice: null,
    content: { schema: 'accessory_content_v1', sections: [] },
    serviceLabels: [],
    collectionMemberships: [],
    legacyImageUrls: ['legacy.jpg'],
    optionGroups: [
      {
        id: 'color-group', code: 'color', name: 'Màu sắc', displayType: 'SWATCH',
        minimumSelections: 1, maximumSelections: 1, displayOrder: 0, metadata: {},
        values: [
          { id: 'red-id', code: 'red', name: 'Đỏ', swatchUrl: null, colorHex: null, priceAdjustment: 0, displayOrder: 0, metadata: {} },
          { id: 'blue-id', code: 'blue', name: 'Xanh', swatchUrl: null, colorHex: null, priceAdjustment: 0, displayOrder: 1, metadata: {} },
        ],
      },
      {
        id: 'size-group', code: 'size', name: 'Kích thước', displayType: 'BUTTON',
        minimumSelections: 1, maximumSelections: 1, displayOrder: 1, metadata: {},
        values: [
          { id: 's-id', code: 's', name: 'S', swatchUrl: null, colorHex: null, priceAdjustment: 0, displayOrder: 0, metadata: {} },
          { id: 'm-id', code: 'm', name: 'M', swatchUrl: null, colorHex: null, priceAdjustment: 0, displayOrder: 1, metadata: {} },
        ],
      },
    ],
    variants: [
      variant('red-s', { color: 'red', size: 's' }),
      variant('red-m', { color: 'red', size: 'm' }),
      variant('blue-m', { color: 'blue', size: 'm' }),
    ],
    media: {
      product: [media('product', {})],
      byVariant: { 'red-m': [media('variant', { variantId: 'red-m' })] },
      byOptionValue: { 'red-id': [media('red', { optionValueId: 'red-id' })] },
    },
    priceRange: { minimum: 100, maximum: 100 },
    availableQuantity: 3,
  }
}

describe('catalog combination resolver', () => {
  it('filters compatible variants from a partial selection', () => {
    expect(filterCompatibleVariants(product().variants, { color: 'red' }).map((item) => item.id))
      .toEqual(['red-s', 'red-m'])
  })

  it('disables values that cannot form a combination with other selections', () => {
    const availability = getOptionAvailability(product(), { color: 'blue' })
    expect(availability.size).toEqual({ s: false, m: true })
  })

  it('resolves only a unique variant after every required group is selected', () => {
    expect(resolveExactVariant(product(), { color: 'red' })).toBeNull()
    expect(resolveExactVariant(product(), { color: 'red', size: 'm' })?.id).toBe('red-m')
    expect(resolveExactVariant(product(), { color: 'blue', size: 's' })).toBeNull()
  })

  it('keeps the changed group and drops incompatible dependent selections', () => {
    expect(reconcileSelection(
      product(),
      { color: 'blue', size: 's' },
      'color',
    )).toEqual({ color: 'blue' })
  })

  it('resolves a single no-option variant', () => {
    const single = { ...product(), optionGroups: [], variants: [variant('default', {})] }
    expect(resolveExactVariant(single, {})?.id).toBe('default')
  })

  it('resolves the unmapped default when an optional group is not selected', () => {
    const base = product()
    const optional = {
      ...base,
      optionGroups: [
        base.optionGroups[0],
        {
          id: 'gift-group', code: 'gift', name: 'Gói quà', displayType: 'BUTTON' as const,
          minimumSelections: 0 as const, maximumSelections: 1 as const,
          displayOrder: 1, metadata: {},
          values: [
            { id: 'wrap-id', code: 'wrap', name: 'Có gói quà', swatchUrl: null, colorHex: null, priceAdjustment: 0, displayOrder: 0, metadata: {} },
          ],
        },
      ],
      variants: [
        variant('plain-red', { color: 'red' }),
        variant('wrapped-red', { color: 'red', gift: 'wrap' }),
      ],
    }

    expect(resolveExactVariant(optional, { color: 'red' })?.id).toBe('plain-red')
    expect(resolveExactVariant(optional, { color: 'red', gift: 'wrap' })?.id)
      .toBe('wrapped-red')
    expect(changeOptionSelection(
      optional,
      { color: 'red', gift: 'wrap' },
      'gift',
      'wrap',
    )).toEqual({ color: 'red' })
  })
})

describe('catalog media resolver', () => {
  it('uses variant media first', () => {
    expect(resolveCatalogMedia(product(), {
      variantId: 'red-m',
      selectedOptions: { color: 'red', size: 'm' },
    })[0]).toMatchObject({ url: 'variant.jpg', source: 'VARIANT' })
  })

  it('falls back through selected color, product, legacy and placeholder media', () => {
    const base = product()
    expect(resolveCatalogMedia(base, { selectedOptions: { color: 'red' } })[0])
      .toMatchObject({ url: 'red.jpg', source: 'OPTION_VALUE' })

    expect(resolveCatalogMedia(base, { variantId: 'red-s' })[0])
      .toMatchObject({ url: 'red.jpg', source: 'OPTION_VALUE' })

    expect(resolveCatalogMedia(base, { selectedOptions: { color: 'blue' } })[0])
      .toMatchObject({ url: 'product.jpg', source: 'PRODUCT' })

    const legacy = { ...base, media: { product: [], byVariant: {}, byOptionValue: {} } }
    expect(resolveCatalogMedia(legacy)[0]).toMatchObject({ url: 'legacy.jpg', source: 'LEGACY' })

    const placeholder = { ...legacy, legacyImageUrls: [] }
    expect(resolveCatalogMedia(placeholder, { placeholderUrl: '/fallback.svg' })[0])
      .toMatchObject({ url: '/fallback.svg', source: 'PLACEHOLDER' })
    expect(resolveCatalogImageUrl(placeholder)).toBe('/images/vf8.png')
  })

  it('skips variant videos when an image-only consumer needs a URL', () => {
    const base = product()
    base.media.byVariant['red-m'] = [{
      ...media('variant-video', { variantId: 'red-m' }),
      mediaType: 'VIDEO',
      url: 'variant.mp4',
    }]

    expect(resolveCatalogMedia(base, { variantId: 'red-m' })[0])
      .toMatchObject({ url: 'variant.mp4', mediaType: 'VIDEO' })
    expect(resolveCatalogImageUrl(base, { variantId: 'red-m' }))
      .toBe('red.jpg')
  })
})
