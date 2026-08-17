import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('./036_cart_item_mutation_rpc_record_fix.sql', import.meta.url),
  'utf8',
)

describe('cart mutation RPC record repair migration', () => {
  it('uses expanded composite columns for typed row variables', () => {
    expect(migration).toContain('select variant.*')
    expect(migration).toContain('select product.*')
    expect(migration).not.toContain('select variant, product')
  })

  it('retains service-role-only mutation execution', () => {
    expect(migration).toMatch(/revoke all on function public\.mutate_accessory_cart_item_v1[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.mutate_accessory_cart_item_v1[\s\S]*to service_role/i)
  })
})
