import { describe, expect, it } from 'vitest'

import { mapCatalogProduct } from '@/lib/catalog/mapper'

describe('public catalog visibility', () => {
  it('omits variants that are no longer active', () => {
    const product = mapCatalogProduct({
      id: 'product-1',
      name: 'Bình giữ nhiệt',
      slug: 'binh-giu-nhiet',
      product_type: 'ACCESSORY',
      specifications: { schema: 'accessory_content_v1', sections: [] },
      variants: [
        {
          id: 'active-variant', product_id: 'product-1', sku: 'ACTIVE',
          name: 'Đang kinh doanh', original_price: 100, is_active: true,
          inventory: [{ on_hand_quantity: 5 }],
        },
        {
          id: 'inactive-variant', product_id: 'product-1', sku: 'INACTIVE',
          name: 'Ngừng kinh doanh', original_price: 100, is_active: false,
          inventory: [{ on_hand_quantity: 10 }],
        },
      ],
    })

    expect(product.variants.map((variant) => variant.sku)).toEqual(['ACTIVE'])
    expect(product.availableQuantity).toBe(5)
  })
})
