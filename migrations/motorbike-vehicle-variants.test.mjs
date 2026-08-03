import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '027_migrate_motorbikes_to_vehicle_variants.sql',
  ),
  'utf8',
)

describe('motorbike vehicle_variants migration', () => {
  it('adds the catalog fields required to stop reading motorbike products at runtime', () => {
    for (const column of [
      'product_slug',
      'description',
      'original_price',
      'sale_price',
      'listing_image_url',
      'hero_image_url',
      'detail_image_urls',
      'brochure_url',
      'version_order',
      'color_order',
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`)
    }
  })

  it('expands every active version and color into one BIKE row', () => {
    expect(migration).toContain("from public.product_variants product_variant")
    expect(migration).toContain("jsonb_array_elements(bike.color_details)")
    expect(migration).toContain("join bike_versions version")
    expect(migration).toContain("'BIKE'")
  })

  it('checks source media, row counts and required target fields before commit', () => {
    expect(migration).toContain(
      "5 + 2 * jsonb_array_length(product.specifications -> 'color_details')",
    )
    expect(migration).toContain('Motorbike migration count mismatch')
    expect(migration).toContain('Migrated motorbike variants contain incomplete rows')
    expect(migration).toContain('validate constraint vehicle_variants_bike_complete')
  })

  it('protects SKU and version-color identity', () => {
    expect(migration).toContain('vehicle_variants_bike_sku_uidx')
    expect(migration).toContain('vehicle_variants_bike_version_color_uidx')
  })
})

