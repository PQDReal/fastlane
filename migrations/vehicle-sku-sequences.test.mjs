import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./056_vehicle_sku_sequences.sql', import.meta.url), 'utf8')

describe('vehicle SKU sequence migration', () => {
  it('defines separate non-overlapping vehicle ranges and a service-role allocator', () => {
    expect(migration).toContain("v_prefix := 'CAR'")
    expect(migration).toContain("v_prefix := 'BIK'")
    expect(migration).toMatch(/grant execute on function public\.allocate_vehicle_variant_skus\(text, integer\)[\r\n\s]+to service_role/i)
    expect(migration).toContain("revoke all on sequence public.car_sku_sequence, public.bike_sku_sequence")
  })

  it('preserves variant IDs and synchronizes the mirrored vehicle SKU', () => {
    expect(migration).not.toMatch(/update\s+public\.product_variants\s+set\s+id/i)
    expect(migration).toContain('join public.vehicle_variants vehicle on vehicle.product_variant_id = variant.id')
    expect(migration).toContain('set sku = variant.sku')
    expect(migration).toContain('vehicle.product_variant_id = variant.id')
    expect(migration).toContain('Vehicle and product variant SKUs are not synchronized.')
  })
})
