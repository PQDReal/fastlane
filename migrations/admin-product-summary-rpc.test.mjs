import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/058_admin_product_summary_rpc.sql'),
  'utf8',
).replace(/\r\n?/g, '\n')

describe('admin product summary RPC follow-up migration', () => {
  it('is additive and does not require rerunning the read-model migration', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain('Follow-up to 057')
    expect(migration).toMatch(/create or replace function public\.get_admin_product_inventory_summary\(/i)
    expect(migration).toContain("'inventoryVariantCount'")
    expect(migration).toContain("'inventoryQuantity'")
    expect(migration).toContain('revoke all on function public.get_admin_product_inventory_summary')
    expect(migration).toContain('grant execute on function public.get_admin_product_inventory_summary')
    expect(migration).toContain("notify pgrst, 'reload schema'")
    expect(migration.trimEnd()).toMatch(/commit;$/)
  })
})
