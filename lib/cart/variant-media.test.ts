import { describe, expect, it } from 'vitest'

import { variantImageForSku } from '@/lib/cart/variant-media'

const product = {
  image_urls: ['mint01.png', 'rose01.png', 'yellow01.png'],
  specifications: {
    variants: [
      { sku: 'ACS30000105', image: 'yellow01.png', images: ['yellow01.png', 'yellow02.png'] },
      { sku: 'ACS30000107', image: 'rose01.png', images: ['rose01.png', 'rose02.png'] },
    ],
  },
}

describe('variantImageForSku', () => {
  it('returns the image belonging to the selected SKU', () => {
    expect(variantImageForSku(product, 'ACS30000105')).toBe('yellow01.png')
    expect(variantImageForSku(product, 'acs30000107')).toBe('rose01.png')
  })

  it('falls back to the first product image when variant media is unavailable', () => {
    expect(variantImageForSku(product, 'UNKNOWN')).toBe('mint01.png')
  })
})
