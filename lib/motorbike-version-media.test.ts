import { describe, expect, it } from 'vitest'
import {
  buildMotorbikeVersionMedia,
  findMotorbikeVersionMedia,
  MAX_MOTORBIKE_VERSION_DETAIL_IMAGES,
  normalizeMotorbikeVersionMedia,
} from './motorbike-version-media'

describe('motorbike version media', () => {
  it('normalizes, de-duplicates and limits detail images', () => {
    const urls = Array.from({ length: 25 }, (_, index) => ` /image-${index}.webp `)
    urls.splice(2, 0, ' /image-1.webp ')

    const media = buildMotorbikeVersionMedia([{
      name: 'Kèm pin',
      sku: 'BIKE-01',
      image_url: ' /hero.webp ',
      detail_image_urls: urls,
    }])

    expect(media).toHaveLength(1)
    expect(media[0].image_url).toBe('/hero.webp')
    expect(media[0].detail_image_urls).toHaveLength(MAX_MOTORBIKE_VERSION_DETAIL_IMAGES)
    expect(new Set(media[0].detail_image_urls).size).toBe(MAX_MOTORBIKE_VERSION_DETAIL_IMAGES)
  })

  it('omits versions without their own media', () => {
    expect(buildMotorbikeVersionMedia([{ name: 'Tiêu chuẩn', sku: 'BIKE-02' }])).toEqual([])
  })

  it('reads the legacy object-map shape and prefers matching by SKU', () => {
    const media = normalizeMotorbikeVersionMedia({
      'Tên cũ': { sku: 'BIKE-03', image_url: '/old.webp', detail_image_urls: [] },
    })

    expect(findMotorbikeVersionMedia(media, { name: 'Tên mới', sku: 'BIKE-03' })?.image_url).toBe('/old.webp')
  })
})
