import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/059_published_motorbike_catalog_rpc.sql'),
  'utf8',
).replace(/\r\n?/g, '\n')

describe('published motorbike catalog RPC migration', () => {
  it('joins publication and sellable-row state in one read model', () => {
    expect(migration).toMatch(/create or replace function public\.list_published_motorbike_catalog\(\)/i)
    expect(migration).toContain('join public.products product')
    expect(migration).toContain('product.is_active = true')
    expect(migration).toContain("product.product_type::text = 'BIKE'")
    expect(migration).toContain('vehicle.is_active = true')
    expect(migration).toContain('revoke all on function public.list_published_motorbike_catalog()')
    expect(migration).toContain('to anon, authenticated, service_role')
    expect(migration).toContain("notify pgrst, 'reload schema'")
  })
})
