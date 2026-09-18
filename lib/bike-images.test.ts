import { describe, expect, it } from 'vitest'

import {
  getBikeListingImage,
  parseBikeImageUrls,
} from './bike-images'

const image = (name: string) => `https://cdn.example.com/${name}.webp`

describe('Supabase motorbike image contract', () => {
  it('maps listing, hero, ordered color pairs and three details', () => {
    const imageUrls = [
      image('listing'),
      image('hero'),
      image('red-bike'),
      image('red-swatch'),
      image('white-bike'),
      image('white-swatch'),
      image('detail-1'),
      image('detail-2'),
      image('detail-3'),
    ]

    expect(parseBikeImageUrls(imageUrls, ['Đỏ', 'Trắng'])).toEqual({
      listingImage: image('listing'),
      heroImage: image('hero'),
      colorImages: [
        { colorName: 'Đỏ', imageUrl: image('red-bike'), swatchUrl: image('red-swatch') },
        { colorName: 'Trắng', imageUrl: image('white-bike'), swatchUrl: image('white-swatch') },
      ],
      detailImages: [image('detail-1'), image('detail-2'), image('detail-3')],
      followsOrderedContract: true,
    })
  })

  it('rejects a shifted or incomplete ordered contract', () => {
    const result = parseBikeImageUrls(
      [image('listing'), image('hero'), image('red-bike')],
      ['Đỏ'],
    )

    expect(result.followsOrderedContract).toBe(false)
    expect(result.colorImages).toEqual([])
  })

  it('always uses the first Supabase image for a catalog card', () => {
    expect(
      getBikeListingImage('amio', [image('database-listing')], image('fallback')),
    ).toBe(image('database-listing'))
  })

  it('uses a local fallback only when Supabase has no renderable image', () => {
    expect(getBikeListingImage('amio', ['', null], '/images/vento.png')).toBe(
      '/images/vento.png',
    )
  })
})
