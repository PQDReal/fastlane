import { describe, expect, it } from 'vitest'

import { mapCatalogProduct } from '@/lib/catalog/mapper'
import { mapCatalogCartItem } from '@/lib/cart/catalog-item'

describe('mapCatalogCartItem', () => {
  it('maps normalized option details, attributes, media and server prices', () => {
    const product = mapCatalogProduct({
      id: '223e4567-e89b-12d3-a456-426614174002',
      name: 'Áo VF 7',
      slug: 'ao-vf-7',
      product_type: 'ACCESSORY',
      specifications: { schema: 'accessory_content_v1', sections: [] },
      option_groups: [{
        id: '323e4567-e89b-12d3-a456-426614174002',
        code: 'color',
        name: 'Màu sắc',
        display_type: 'SWATCH',
        minimum_selections: 1,
        display_order: 0,
        is_active: true,
        option_values: [{
          id: '423e4567-e89b-12d3-a456-426614174002',
          code: 'red',
          name: 'Đỏ',
          price_adjustment: 10000,
          display_order: 0,
          is_active: true,
        }],
      }],
      variants: [{
        id: '123e4567-e89b-12d3-a456-426614174002',
        product_id: '223e4567-e89b-12d3-a456-426614174002',
        sku: 'SHIRT-RED',
        name: 'Đỏ',
        original_price: 250000,
        sale_price: 225000,
        is_active: true,
        inventory: { on_hand_quantity: 4 },
        option_mappings: [{
          option_group_id: '323e4567-e89b-12d3-a456-426614174002',
          option_value_id: '423e4567-e89b-12d3-a456-426614174002',
        }],
      }],
      media: [{
        id: '523e4567-e89b-12d3-a456-426614174002',
        product_id: '223e4567-e89b-12d3-a456-426614174002',
        variant_id: '123e4567-e89b-12d3-a456-426614174002',
        role: 'THUMBNAIL',
        media_type: 'IMAGE',
        url: 'https://example.com/shirt-red.jpg',
        display_order: 0,
        is_active: true,
      }],
    })
    const variant = product.variants[0]

    expect(mapCatalogCartItem({ product, variant }, 2)).toMatchObject({
      id: variant.id,
      variantId: variant.id,
      productId: product.id,
      sku: 'SHIRT-RED',
      variantAttributes: { color: 'red' },
      selectedOptions: [{
        groupId: '323e4567-e89b-12d3-a456-426614174002',
        groupCode: 'color',
        groupName: 'Màu sắc',
        valueId: '423e4567-e89b-12d3-a456-426614174002',
        valueCode: 'red',
        valueName: 'Đỏ',
        priceAdjustment: '10000',
      }],
      quantity: 2,
      unitListPrice: '250000',
      unitSalePrice: '225000',
      unitOptionTotal: '0',
      unitPrice: '225000',
      lineTotal: '450000',
      imageUrl: 'https://example.com/shirt-red.jpg',
      availableQuantity: 4,
    })
  })
})
