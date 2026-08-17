import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

describe('vehicle SKU migration safety', () => {
  it('retires scripts that generated or matched semantic vehicle SKUs', () => {
    for (const relativePath of [
      'scripts/migrate-motorbike-vehicle-variants.mjs',
      'scripts/migrate-vf0-vehicle-variants.mjs',
      'scripts/motorbike-version-normalization.mjs',
      'scripts/collect-deposit-vehicle-interiors.mjs',
    ]) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(false)
    }

    const packageJson = read('package.json')
    expect(packageJson).not.toContain('migrate:motorbike-vehicle-variants')
    expect(packageJson).not.toContain('migrate:vf0-vehicle-variants')
  })

  it('keeps the published JSON synchronization isolated to accessories', () => {
    const source = read('scripts/sync-published-catalog-options.mjs')
    expect(source).toContain("productType: 'ACCESSORY'")
    expect(source).toContain("product.product_type).toUpperCase() === 'ACCESSORY'")
    expect(source).not.toContain("file: 'cars.json'")
    expect(source).not.toContain("file: 'motorbikes.json'")
    expect(source).not.toContain('variantSku')
  })

  it('uses configuration identity and the database allocator for vehicle repair', () => {
    const source = read('scripts/reconcile-vehicle-inventory.mjs')
    expect(source).toContain('vehicleConfigurationKey')
    expect(source).toContain("supabase.rpc('allocate_vehicle_variant_skus'")
    expect(source).toContain('Refusing to reconcile')
    expect(source).not.toContain('oldRowsBySku')
    expect(source).not.toContain('existingBySku')
    expect(source).not.toMatch(/sku:\s*`\$\{row\.sku\}-/)
  })
})
