import { describe, expect, it } from 'vitest'
import {
  normalizeMotorbikeVariantColorMedia,
  renameMotorbikeVariantColorMedia,
  resolveMotorbikeVariantColorMedia,
} from './motorbike-variant-color-media'

describe('motorbike variant color media', () => {
  it('uses a custom vehicle image but keeps the shared color swatch', () => {
    expect(resolveMotorbikeVariantColorMedia({
      media_by_color: { Đỏ: { image_url: '/version-red.webp', swatch: '/version-red-swatch.webp' } },
    }, {
      color_name: 'Đỏ',
      image_url: '/shared-red.webp',
      swatch: '/shared-red-swatch.webp',
    })).toEqual({
      image_url: '/version-red.webp',
      swatch: '/shared-red-swatch.webp',
    })
  })

  it('falls back to a legacy combination swatch only when the color has none', () => {
    expect(resolveMotorbikeVariantColorMedia({
      media_by_color: { Đỏ: { image_url: '/version-red.webp', swatch: '/legacy-red-swatch.webp' } },
    }, {
      color_name: 'Đỏ',
      image_url: '/shared-red.webp',
      swatch: '',
    })).toEqual({
      image_url: '/version-red.webp',
      swatch: '/legacy-red-swatch.webp',
    })
  })

  it('falls back to legacy color media when the combination has no media', () => {
    expect(resolveMotorbikeVariantColorMedia({}, {
      color_name: 'Trắng',
      image_url: ' /shared-white.webp ',
      swatch: ' /shared-white-swatch.webp ',
    })).toEqual({
      image_url: '/shared-white.webp',
      swatch: '/shared-white-swatch.webp',
    })
  })

  it('renames color keys without losing media', () => {
    expect(renameMotorbikeVariantColorMedia({
      'Đỏ cũ': { image_url: '/red.webp', swatch: '/swatch.webp' },
    }, 'Đỏ cũ', 'Đỏ mới')).toEqual({
      'Đỏ mới': { image_url: '/red.webp', swatch: '/swatch.webp' },
    })
  })

  it('normalizes malformed values to controlled strings', () => {
    expect(normalizeMotorbikeVariantColorMedia({ ' Xám ': { image_url: undefined, swatch: 123 }, ' ': { image_url: '/ignored.webp' } })).toEqual({
      Xám: { image_url: '', swatch: '' },
    })
  })

  it('keeps media linked while a color name is trimmed', () => {
    expect(renameMotorbikeVariantColorMedia({
      Đỏ: { image_url: '/red.webp', swatch: '/swatch.webp' },
    }, 'Đỏ', ' Đỏ ')).toEqual({
      Đỏ: { image_url: '/red.webp', swatch: '/swatch.webp' },
    })
  })
})
