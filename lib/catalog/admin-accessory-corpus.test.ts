import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ACCESSORY_OPTION_PRESETS,
  accessoryAdminSlug,
  type AdminAccessoryDraft,
  type DraftOptionGroup,
} from '@/lib/catalog/admin-accessory-draft'
import { validateAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-validation'

type RawVariant = {
  variant_id: string
  sku: string
  name: string
  attributes: Record<string, string>
  price: number
  images: string[]
  in_stock: boolean
}

type RawAccessory = {
  pid: string
  sku: string
  name: string
  description: string
  images: string[]
  variants: RawVariant[]
}

const products = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), 'public/data/by_type/accessories.json'),
  'utf8',
)) as RawAccessory[]

const supportedCodes = ['color', 'size', 'package'] as const

function draftFromFixture(product: RawAccessory): AdminAccessoryDraft {
  const groupCodes = [...new Set(product.variants.flatMap((variant) => Object.keys(variant.attributes)))]
  const optionGroups: DraftOptionGroup[] = groupCodes.map((code) => {
    const names = [...new Set(product.variants.map((variant) => variant.attributes[code]).filter(Boolean))]
    return {
      id: `group-${code}`,
      presetCode: supportedCodes.includes(code as typeof supportedCodes[number]) ? code : '',
      code,
      name: ACCESSORY_OPTION_PRESETS.find((preset) => preset.code === code)?.name ?? code,
      displayType: code === 'color' ? 'SWATCH' : 'BUTTON',
      minimumSelections: 1,
      maximumSelections: 1,
      values: names.map((name) => ({
        id: `value-${code}-${accessoryAdminSlug(name)}`,
        code: accessoryAdminSlug(name),
        name,
        colorHex: '',
        swatchUrl: '',
        imageUrls: [''],
      })),
    }
  })

  return {
    rootCategoryId: 'fixture-accessories',
    primaryCollectionSlug: 'fixture',
    modelCollectionSlugs: [],
    name: product.name,
    slug: accessoryAdminSlug(product.name),
    description: product.description,
    isActive: true,
    serviceLabelIds: [],
    sections: [],
    optionGroups,
    variants: product.variants.map((variant) => ({
      id: variant.variant_id,
      name: variant.name || 'Mặc định',
      sku: variant.sku,
      originalPrice: String(variant.price),
      salePrice: '',
      isActive: true,
      isIncluded: true,
      selections: Object.fromEntries(optionGroups.map((group) => {
        const sourceName = variant.attributes[group.code]
        return [group.id, `value-${group.code}-${accessoryAdminSlug(sourceName)}`]
      })),
      imageUrls: variant.images.length > 0 ? variant.images : [''],
    })),
    productImageUrls: product.images.length > 0 ? product.images : [''],
  }
}

describe('83-product accessory corpus compatibility', () => {
  it('preserves the audited product, variant and option shapes', () => {
    const shapes: Record<string, number> = {}
    const variants = products.flatMap((product) => product.variants)
    for (const product of products) {
      const shape = [...new Set(product.variants.flatMap((variant) => Object.keys(variant.attributes)))].sort().join('+') || 'none'
      shapes[shape] = (shapes[shape] ?? 0) + 1
    }

    expect(products).toHaveLength(83)
    expect(variants).toHaveLength(234)
    expect(products.filter((product) => product.variants.length > 1)).toHaveLength(36)
    expect(shapes).toEqual({ none: 47, color: 12, package: 17, 'color+size': 7 })
  })

  it('accepts every fixture product and variant with the prototype validator', () => {
    const errors = products.flatMap((product) => validateAdminAccessoryDraft(draftFromFixture(product))
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${product.sku}: ${issue.code} ${issue.message}`))
    expect(errors).toEqual([])
  })

  it('recreates all seven color-size products as full Cartesian matrices', () => {
    const multiGroup = products.filter((product) => {
      const keys = [...new Set(product.variants.flatMap((variant) => Object.keys(variant.attributes)))].sort()
      return keys.join('+') === 'color+size'
    })
    expect(multiGroup).toHaveLength(7)
    for (const product of multiGroup) {
      const colors = new Set(product.variants.map((variant) => variant.attributes.color))
      const sizes = new Set(product.variants.map((variant) => variant.attributes.size))
      expect(product.variants).toHaveLength(colors.size * sizes.size)
    }
  })

  it('covers every exact source value in the preset provider', () => {
    for (const code of supportedCodes) {
      const preset = ACCESSORY_OPTION_PRESETS.find((item) => item.code === code)
      const sourceValues = new Set(products.flatMap((product) => product.variants
        .map((variant) => variant.attributes[code])
        .filter(Boolean)))
      expect(preset?.usageCount).toBe(products.reduce((count, product) => count + product.variants.filter((variant) => Boolean(variant.attributes[code])).length, 0))
      expect(new Set(preset?.suggestedValues)).toEqual(sourceValues)
    }
  })

  it('keeps the known product-level 3DTRUNKMATVF6 identifier out of variant SKUs', () => {
    const trunkMat = products.find((product) => product.sku === '3DTRUNKMATVF6')
    expect(trunkMat?.variants.map((variant) => variant.sku)).toEqual(['ACS10000045', 'ACS10000036'])
  })
})
