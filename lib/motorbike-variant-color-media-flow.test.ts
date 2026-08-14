import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const createRoute = fs.readFileSync(new URL('../app/api/v1/admin/motorbikes/route.ts', import.meta.url), 'utf8')
const editRoute = fs.readFileSync(new URL('../app/api/v1/admin/motorbikes/[productId]/route.ts', import.meta.url), 'utf8')
const catalog = fs.readFileSync(new URL('./motorbike-catalog.ts', import.meta.url), 'utf8')
const productPage = fs.readFileSync(new URL('../app/bikes/[slug]/page.tsx', import.meta.url), 'utf8')
const depositClient = fs.readFileSync(new URL('../app/deposit/DepositClient.tsx', import.meta.url), 'utf8')
const createAdminPage = fs.readFileSync(new URL('../app/admin/products/motorbikes/new/page.tsx', import.meta.url), 'utf8')
const editAdminPage = fs.readFileSync(new URL('../app/admin/products/motorbikes/edit/[productId]/page.tsx', import.meta.url), 'utf8')

describe('motorbike version and color media flow', () => {
  it('writes each combination media to its vehicle variant row', () => {
    for (const route of [createRoute, editRoute]) {
      expect(route).toContain('resolveMotorbikeVariantColorMedia(version, color)')
      expect(route).toContain('image_car_url: colorMediaForConfigurations[rowIndex].image_url')
      expect(route).toContain('image_color_url: colorMediaForConfigurations[rowIndex].swatch')
    }
  })

  it('keeps swatches in the shared color CRUD and makes vehicle images optional', () => {
    for (const page of [createAdminPage, editAdminPage]) {
      expect(page).toContain('Swatch màu dùng chung')
      expect(page).toContain("return !media.swatch")
    }
    expect(fs.readFileSync(new URL('../components/admin/motorbike-version-color-media-fields.tsx', import.meta.url), 'utf8'))
      .toContain('Swatch dùng chung')
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

  it('keeps the product detail image library synchronized end to end', () => {
    expect(createRoute).toContain('detail_images: detail_image_urls')
    expect(editRoute).toContain('const detail_image_urls = normalizeMotorbikeDetailImages')
    expect(catalog).toContain('detailImageUrls: Array.isArray(catalog.detail_image_urls)')
    expect(productPage).toContain('fallbackDetailImageUrls={detailImages}')
  })

  it('keeps version galleries in the product images tab', () => {
    for (const page of [createAdminPage, editAdminPage]) {
      const imagesTab = page.indexOf("activeTab === 'images'")
      const specsTab = page.indexOf("activeTab === 'specs'")
      const variantsTab = page.indexOf("activeTab === 'variants'")
      const landingTab = page.indexOf("activeTab === 'landing_page'")
      const detailLibrary = page.lastIndexOf('<MotorbikeDetailImageLibrary')

      expect(detailLibrary).toBeGreaterThan(imagesTab)
      expect(detailLibrary).toBeLessThan(specsTab)
      expect(page.slice(variantsTab, landingTab)).not.toContain('<MotorbikeVersionMediaFields')
    }
  })
})
