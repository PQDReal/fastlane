import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./031_admin_accessory_sku_media_required.sql', import.meta.url), 'utf8')

describe('admin accessory SKU-only media migration', () => {
  it('preflights every variant before delegating to the aggregate writer', () => {
    expect(migration).toContain('function public.save_admin_accessory_product_v3(')
    expect(migration).toContain("jsonb_array_length(v_image_urls) < 1")
    expect(migration).toContain("jsonb_array_length(v_image_urls) > 20")
    expect(migration).toContain("'^https?://")
    expect(migration).toContain('public.save_admin_accessory_product_v2(')
  })

  it('restricts execution to service_role', () => {
    expect(migration).toMatch(/revoke all on function public\.save_admin_accessory_product_v3[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.save_admin_accessory_product_v3[\s\S]*to service_role/i)
  })
})
