import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('./035_cart_item_mutation_rpc.sql', import.meta.url),
  'utf8',
)

describe('cart item mutation RPC migration', () => {
  it('keeps the checkout-compatible cart version while introducing one RPC path', () => {
    expect(migration).toContain('build_accessory_cart_snapshot_v1')
    expect(migration).toContain('mutate_accessory_cart_item_v1')
    expect(migration).toContain("floor(extract(epoch from v_cart.updated_at) * 1000)::bigint")
    expect(migration).toContain('on conflict (customer_id) where status = \'ACTIVE\'::public.cart_status')
  })

  it('serializes the cart and validates variant, inventory and quantity in the transaction', () => {
    expect(migration).toContain('for update;')
    expect(migration).toContain("message = 'OUT_OF_STOCK'")
    expect(migration).toContain("message = 'RESOURCE_NOT_FOUND'")
    expect(migration).toContain("product_type <> 'ACCESSORY'")
    expect(migration).toContain("p_quantity < 1 or p_quantity > 99")
  })

  it('allows removal of stale catalog rows and returns direct variant media only', () => {
    expect(migration).toContain("v_operation = 'REMOVE'")
    expect(migration).toContain("message = 'RESOURCE_NOT_FOUND'")
    expect(migration).toContain('media.variant_id = variant.id')
    expect(migration).not.toContain("coalesce(media.url, product.thumbnail_url)")
  })

  it('restricts the public mutation surface to service_role', () => {
    expect(migration).toMatch(/revoke all on function public\.mutate_accessory_cart_item_v1[\s\S]*from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.mutate_accessory_cart_item_v1[\s\S]*to service_role/i)
  })
})
