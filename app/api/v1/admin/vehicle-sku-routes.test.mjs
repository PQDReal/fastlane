import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const routes = {
  carCreate: source('./cars/route.ts'),
  carEdit: source('./cars/[productId]/route.ts'),
  bikeCreate: source('./motorbikes/route.ts'),
  bikeEdit: source('./motorbikes/[productId]/route.ts'),
}

describe('admin vehicle SKU write routes', () => {
  it('allocates opaque canonical SKUs for every newly created configuration', () => {
    expect(routes.carCreate).toContain("allocateVehicleVariantSkus(supabase, 'CAR'")
    expect(routes.bikeCreate).toContain("allocateVehicleVariantSkus(supabase, 'BIKE'")
    expect(routes.carCreate).not.toContain('buildCarVariantSku')
    expect(routes.bikeCreate).not.toMatch(/sku:\s*`\$\{version\.sku\}-C/)
  })

  it('matches edit rows by configuration, preserves IDs, and replaces any legacy SKU', () => {
    for (const [route, type] of [[routes.carEdit, 'CAR'], [routes.bikeEdit, 'BIKE']]) {
      expect(route).toContain('vehicleConfigurationKey')
      expect(route).toContain('assignment.existingProduct?.sku')
      expect(route).toContain('assignment.existingProduct?.id')
      expect(route).toContain(`isCanonicalVehicleSku(item.existingProduct?.sku, '${type}')`)
      expect(route).toContain(`isCanonicalVehicleSku(assignment.existingProduct?.sku, '${type}')`)
      expect(route).not.toContain('buildCarVariantSku')
      expect(route).not.toMatch(/sku\?\.replace\(\/-C/)
    }
  })

  it('retires reserved car configurations instead of deleting immutable deposit history', () => {
    expect(routes.carEdit).toContain("DEPOSIT_RESERVED_VEHICLE_IMMUTABLE")
    expect(routes.carEdit).toContain("isImmutableReservedVehicleError(vvDelError)")
    expect(routes.carEdit).toContain(".update({ is_active: false })")
  })
})
