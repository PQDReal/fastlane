import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const createRoute = fs.readFileSync(new URL('../app/api/v1/admin/motorbikes/route.ts', import.meta.url), 'utf8')
const editRoute = fs.readFileSync(new URL('../app/api/v1/admin/motorbikes/[productId]/route.ts', import.meta.url), 'utf8')
const catalog = fs.readFileSync(new URL('./motorbike-catalog.ts', import.meta.url), 'utf8')
const productPage = fs.readFileSync(new URL('../app/bikes/[slug]/page.tsx', import.meta.url), 'utf8')
const depositClient = fs.readFileSync(new URL('../app/deposit/DepositClient.tsx', import.meta.url), 'utf8')

describe('motorbike version and color media flow', () => {
  it('writes each combination media to its vehicle variant row', () => {
    for (const route of [createRoute, editRoute]) {
      expect(route).toContain('resolveMotorbikeVariantColorMedia(version, color)')
      expect(route).toContain('image_car_url: colorMediaForConfigurations[rowIndex].image_url')
      expect(route).toContain('image_color_url: colorMediaForConfigurations[rowIndex].swatch')
    }
  })

  it('hydrates combination media when reopening the admin editor', () => {
    expect(editRoute).toContain('image_car_url,image_color_url')
    expect(editRoute).toContain('media_by_color: mediaByColor')
  })

  it('uses vehicle variant media on product and deposit pages', () => {
    expect(catalog).toContain('imageCarUrl: row.image_car_url')
    expect(catalog).toContain('imageColorUrl: row.image_color_url')
    expect(productPage).toContain('const versionColorOptions = motorbike.variantRows.map')
    expect(depositClient).toContain('const variantColors = Array.from(new Map(canonicalColorRows')
    expect(depositClient).toContain('swatch: variant.image_color_url')
  })
})
