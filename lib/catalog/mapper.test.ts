import { describe, expect, it } from 'vitest'

import { mapCatalogProduct } from '@/lib/catalog/mapper'

describe('mapCatalogProduct', () => {
  it('maps ordered normalized options, prices, inventory and media scopes', () => {
    const product = mapCatalogProduct({
      id: 'product-1',
      category_id: 'category-1',
      name: 'Áo VF 7',
      slug: 'ao-vf-7',
      description: 'Áo thun',
      product_type: 'ACCESSORY',
      displayed_price: '250000',
      image_urls: ['legacy.jpg'],
      specifications: {
        specification_text: 'Chất liệu cotton',
        specifications: { material: 'Cotton' },
        variants: [{ sku: 'must-not-be-read' }],
      },
      category: { id: 'category-1', name: 'Phụ kiện', slug: 'accessories' },
      collection_memberships: [{
        id: 'membership-1', source_system: 'VINFAST_DEMANDWARE', is_primary: true,
        first_seen_at: '2026-07-27T00:00:00Z', last_seen_at: '2026-07-27T00:00:00Z',
        is_active: true, metadata: {},
        collection: {
          id: 'collection-1', parent_id: null, kind: 'CATEGORY',
          source_system: 'VINFAST_DEMANDWARE', source_key: '5003',
          slug: 'phong-cach-song', name: 'Phong cách sống',
          vehicle_filter_mode: 'NONE', display_order: 10, is_active: true, metadata: {},
        },
      }, {
        id: 'membership-2', source_system: 'VINFAST_DEMANDWARE', is_primary: false,
        first_seen_at: '2026-07-27T00:00:00Z', last_seen_at: '2026-07-27T00:00:00Z',
        is_active: true, metadata: {},
        collection: {
          id: 'collection-2', parent_id: 'collection-car', kind: 'MODEL',
          source_system: 'VINFAST_DEMANDWARE', source_key: '5007',
          slug: 'vf-3', name: 'VF 3', vehicle_filter_mode: 'COLLECTION_MEMBERSHIP',
          display_order: 80, is_active: true, metadata: {},
          vehicle_model: {
            id: 'model-1', code: 'VF_3', slug: 'vf-3', name: 'VF 3',
            vehicle_kind: 'CAR', is_active: true, metadata: {},
          },
        },
      }],
      option_groups: [
        {
          id: 'size-group', code: 'size', name: 'Kích thước', display_type: 'BUTTON',
          minimum_selections: 1, display_order: 2, is_active: true, metadata: {},
          option_values: [
            { id: 'size-m', code: 'm', name: 'M', price_adjustment: 0, display_order: 0, is_active: true },
          ],
        },
        {
          id: 'color-group', code: 'color', name: 'Màu sắc', display_type: 'SWATCH',
          minimum_selections: 1, display_order: 1, is_active: true, metadata: {},
          option_values: [
            { id: 'red', code: 'red', name: 'Đỏ', price_adjustment: '10000', display_order: 0, is_active: true },
            { id: 'hidden', code: 'hidden', name: 'Ẩn', display_order: 1, is_active: false },
          ],
        },
      ],
      variants: [{
        id: 'variant-red-m', product_id: 'product-1', sku: 'RED-M', name: 'Đỏ / M',
        original_price: '250000', sale_price: '225000', deposit_amount: null,
        option_signature: 'color=red|size=m', is_active: true, metadata: {},
        inventory: [{ on_hand_quantity: 3 }],
        option_mappings: [
          { option_group_id: 'size-group', option_value_id: 'size-m' },
          { option_group_id: 'color-group', option_value_id: 'red' },
        ],
      }],
      media: [
        { id: 'product-media', product_id: 'product-1', role: 'HERO', media_type: 'IMAGE', url: 'product.jpg', display_order: 1, is_active: true },
        { id: 'variant-media', product_id: 'product-1', variant_id: 'variant-red-m', role: 'THUMBNAIL', media_type: 'IMAGE', url: 'variant.jpg', display_order: 0, is_active: true },
        { id: 'option-media', product_id: 'product-1', option_value_id: 'red', role: 'GALLERY', media_type: 'IMAGE', url: 'red.jpg', display_order: 0, is_active: true },
      ],
    })

    expect(product.optionGroups.map((group) => group.code)).toEqual(['color', 'size'])
    expect(product.optionGroups[0].values.map((value) => value.code)).toEqual(['red'])
    expect(product.variants[0]).toMatchObject({
      effectivePrice: 225000,
      availableQuantity: 3,
      selectedOptions: { color: 'red', size: 'm' },
      selectedOptionDetails: [
        expect.objectContaining({ groupCode: 'color', valueCode: 'red', priceAdjustment: 10000 }),
        expect.objectContaining({ groupCode: 'size', valueCode: 'm' }),
      ],
    })
    expect(product.priceRange).toEqual({ minimum: 225000, maximum: 225000 })
    expect(product.media.product[0].url).toBe('product.jpg')
    expect(product.media.byVariant['variant-red-m'][0].url).toBe('variant.jpg')
    expect(product.media.byOptionValue.red[0].url).toBe('red.jpg')
    expect(product.collectionMemberships).toMatchObject([
      {
        isPrimary: true,
        collection: { sourceKey: '5003', vehicleFilterMode: 'NONE' },
      },
      {
        isPrimary: false,
        collection: {
          sourceKey: '5007',
          vehicleFilterMode: 'COLLECTION_MEMBERSHIP',
          vehicleModel: { code: 'VF_3' },
        },
      },
    ])
    expect(product.content).toEqual({
      specificationText: 'Chất liệu cotton',
      specifications: { material: 'Cotton' },
      category: null,
      categories: [],
    })
  })

  it('handles products with zero option groups and missing inventory', () => {
    const product = mapCatalogProduct({
      id: 'product-1', name: 'Sản phẩm', slug: 'san-pham', product_type: 'ACCESSORY',
      variants: [{
        id: 'variant-1', product_id: 'product-1', sku: 'SKU-1', name: 'Mặc định',
        original_price: 100, sale_price: null, is_active: true,
      }],
    })
    expect(product.optionGroups).toEqual([])
    expect(product.collectionMemberships).toEqual([])
    expect(product.variants[0].selectedOptions).toEqual({})
    expect(product.variants[0].availableQuantity).toBe(0)
  })
})
