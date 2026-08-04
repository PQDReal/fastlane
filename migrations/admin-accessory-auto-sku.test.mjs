import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./032_admin_accessory_auto_sku.sql', import.meta.url), 'utf8')

describe('admin accessory auto SKU migration', () => {
  it('creates an ACS sequence after the largest existing ACS code', () => {
    expect(migration).toContain('create sequence if not exists public.accessory_sku_sequence')
    expect(migration).toContain("substring(variant.sku from '^ACS([0-9]{8})$')")
    expect(migration).toContain("'ACS' || lpad(v_sequence_value::text, 8, '0')")
  })

  it('preserves existing IDs and rejects client-provided SKU values', () => {
    expect(migration).toContain("if v_variant ? 'sku' then")
    expect(migration).toContain("select variant.sku into v_existing_sku")
    expect(migration).toContain("v_variant || jsonb_build_object('sku', v_generated_sku)")
  })

  it('keeps the writer restricted to service_role', () => {
    expect(migration).toMatch(/revoke all on function public\.save_admin_accessory_product_v3[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.save_admin_accessory_product_v3[\s\S]*to service_role/i)
  })
})
