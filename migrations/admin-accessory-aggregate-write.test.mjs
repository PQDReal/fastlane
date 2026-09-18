import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/016_admin_accessory_aggregate_write.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('admin accessory aggregate write migration', () => {
  it('exposes one service-role-only aggregate transaction', () => {
    expect(migration).toContain('products_slug_case_insensitive_uidx')
    expect(migration).toContain('product_variants_sku_case_insensitive_uidx')
    expect(migration).toContain('function public.save_admin_accessory_product(')
    expect(migration).toContain('target_product_id uuid')
    expect(migration).toContain('expected_updated_at timestamptz')
    expect(migration).toContain('target_payload jsonb')
    expect(migration).toMatch(/revoke all on function public\.save_admin_accessory_product[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.save_admin_accessory_product[\s\S]*to service_role/i)
  })

  it('writes every normalized accessory relation and initializes only new inventory', () => {
    for (const table of [
      'products',
      'product_collection_memberships',
      'product_service_label_assignments',
      'product_option_groups',
      'product_option_values',
      'product_variants',
      'product_variant_option_values',
      'inventory_items',
      'product_media',
    ]) {
      expect(migration).toContain(`public.${table}`)
    }
    expect(migration).toMatch(/insert into public\.inventory_items[\s\S]*on conflict \(variant_id\) do nothing/i)
    expect(migration).not.toMatch(/update public\.inventory_items/i)
  })

  it('keeps pricing on SKU rows and forces option adjustments to zero', () => {
    expect(migration).toMatch(/price_adjustment, display_order[\s\S]*?\n\s*0,/i)
    expect(migration).toContain('price_adjustment = 0')
    expect(migration).toContain('(v_variant ->> \'originalPrice\')::numeric')
    expect(migration).toContain("nullif(v_variant ->> 'salePrice', '')::numeric")
  })

  it('guards taxonomy, stale edits, product ownership and publication', () => {
    expect(migration).toContain("category.slug = 'phu-kien'")
    expect(migration).toContain('v_existing_updated_at is distinct from expected_updated_at')
    expect(migration).toContain('Option group does not belong to this product.')
    expect(migration).toContain('Variant does not belong to this product.')
    expect(migration).toContain('An active accessory requires an active variant and at least one media item.')
    expect(migration).toMatch(/returning product\.updated_at into v_updated_at/i)
  })
})
