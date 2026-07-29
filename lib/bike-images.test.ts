import { describe, expect, it } from 'vitest'

import {
  getBikeColorFallbacks,
  getBikeColorImage,
  isRenderableBikeImage,
} from './bike-images'

describe('bike color images', () => {
  it.each([
    ['amio', 5],
    ['amio-s', 5],
    ['amio-s2', 5],
    ['zgoo', 4],
    ['evo', 4],
    ['evo-lite', 4],
    ['evo-grand', 5],
    ['evo-grand-lite', 4],
    ['evo-lite-neo', 5],
    ['evo-neo', 5],
    ['feliz-2025', 5],
    ['feliz-ii', 4],
    ['kinet', 5],
    ['kyo', 5],
    ['flazz', 4],
    ['flazz-max', 4],
    ['vero-x', 4],
    ['viper', 5],
  ])(
    'provides a complete and distinct color-image set for %s',
    (slug, expectedCount) => {
      const colors = getBikeColorFallbacks(slug)
      const imageUrls = colors.map((color) => color.imageUrl)

      expect(colors).toHaveLength(expectedCount)
      expect(new Set(imageUrls)).toHaveLength(expectedCount)
      expect(imageUrls.every(isRenderableBikeImage)).toBe(true)
    },
  )

  it('provides four distinct renderable Flazz Max color images', () => {
    const colors = getBikeColorFallbacks('flazz-max')
    const imageUrls = colors.map((color) => color.imageUrl)

    expect(colors.map((color) => color.colorName)).toEqual([
      'Đỏ Đen',
      'Trắng Cam',
      'Xanh',
      'Đen',
    ])
    expect(new Set(imageUrls)).toHaveLength(4)
    expect(imageUrls.every(isRenderableBikeImage)).toBe(true)
    expect(colors.every((color) => isRenderableBikeImage(color.swatchUrl))).toBe(
      true,
    )
  })

  it('maps a selected Flazz Max color to its matching full-bike image', () => {
    expect(getBikeColorImage('flazz-max', 'Xanh', '')).toContain(
      '/FLAZZMAX/BUZVN.png',
    )
    expect(getBikeColorImage('flazz-max', 'Đỏ Đen', '')).toContain(
      '/FLAZZMAX/REQVN.png',
    )
  })

  it.each([
    ['amio', 'Đỏ Tươi', '/AMIO/REQ.png'],
    ['viper', 'Đỏ Tươi', '/VIPER/REQ.png'],
    ['evo', 'Đỏ Tươi', '/EVO/REQ1.png'],
    ['flazz-max', 'Xanh', '/FLAZZMAX/BUZVN.png'],
  ])('maps %s %s to the matching official vehicle image', (slug, color, path) => {
    const option = getBikeColorFallbacks(slug).find(
      (item) => item.colorName === color,
    )

    expect(option?.imageUrl).toContain(path)
    expect(isRenderableBikeImage(option?.swatchUrl)).toBe(true)
  })

  it('does not reuse Evo Lite Neo vehicle images for Evo Neo', () => {
    const colors = getBikeColorFallbacks('evo-neo')

    expect(colors).toHaveLength(5)
    expect(
      colors.every(
        (color) =>
          color.imageUrl.includes('/EVONEO/') &&
          !color.imageUrl.includes('/evoliteneo/'),
      ),
    ).toBe(true)
  })
})
