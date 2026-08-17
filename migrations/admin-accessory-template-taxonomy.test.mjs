import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/030_admin_accessory_templates_multicategory.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('admin accessory template and multi-category migration', () => {
  it('adds backward-compatible template provenance and a guarded v2 writer', () => {
    expect(migration).toContain('accessory_template_code')
    expect(migration).toContain('accessory_template_version')
    expect(migration).toContain('products_accessory_template_pair_check')
    expect(migration).toContain('function public.save_admin_accessory_product_v2(')
    expect(migration).toContain('public.save_admin_accessory_product(')
    expect(migration).toMatch(/grant execute on function public\.save_admin_accessory_product_v2[\s\S]*to service_role/i)
  })

  it('keeps ALL_MODELS as metadata rather than expanding model memberships', () => {
    expect(migration).toContain("'compatibilityMode'")
    expect(migration).toContain("v_mode = 'SELECTED_MODELS'")
    expect(migration).toContain("v_mode = 'ALL_MODELS'")
    expect(migration).toContain("v_mode <> 'NOT_APPLICABLE'")
    expect(migration).toMatch(/is_primary = false/i)
  })
})
