import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('./037_cart_mutation_session_identity_guard.sql', import.meta.url),
  'utf8',
)

describe('cart mutation session identity guard migration', () => {
  it('keeps the existing v1 signature and checks live user authorization', () => {
    expect(migration).toContain('create or replace function public.mutate_accessory_cart_item_v1')
    expect(migration).toContain('v_user public.users%rowtype')
    expect(migration).toContain('for share')
    expect(migration).toContain("v_user.status::text <> 'ACTIVE'")
    expect(migration).toContain("v_user.role::text not in ('CUSTOMER', 'ADMIN')")
    expect(migration).toContain("message = 'INSUFFICIENT_PERMISSION'")
    expect(migration).toContain('p_customer_id uuid')
    expect(migration).toContain('p_variant_id uuid')
    expect(migration).toContain('p_operation text')
    expect(migration).toContain('p_quantity integer default null')
  })

  it('keeps service-role-only execution and atomic mutation behavior', () => {
    expect(migration).toMatch(/revoke all on function public\.mutate_accessory_cart_item_v1[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.mutate_accessory_cart_item_v1[\s\S]*to service_role/i)
    expect(migration).toContain('for update;')
    expect(migration).toContain('return public.build_accessory_cart_snapshot_v1(v_cart.id)')
  })
})
