import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const createRoute = fs.readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
const updateRoute = fs.readFileSync(new URL('./[productId]/route.ts', import.meta.url), 'utf8')

describe('car advanced colour surcharge persistence', () => {
  it.each([createRoute, updateRoute])('uses one version price plus a product-level advanced-colour surcharge', (source) => {
    expect(source).toContain('advanced_color_price')
    expect(source).toContain("color.color_type === 'ADVANCED'")
    expect(source).not.toContain('price_by_color')
  })
})
