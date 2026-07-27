import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '009_order_snapshot_guard_schema_drift.sql',
  ),
  'utf8',
)

describe('order snapshot guard schema drift', () => {
  it('does not dereference an optional legacy showroom column', () => {
    expect(migration).not.toMatch(/\b(?:old|new)\.showroom_id\b/i)
    expect(migration).toMatch(
      /\(to_jsonb\(old\) -> 'showroom_id'\)\s+is distinct from \(to_jsonb\(new\) -> 'showroom_id'\)/i,
    )
  })

  it('retains finalization validation and commercial immutability', () => {
    expect(migration).toContain('ORDER_ITEM_TOTAL_SNAPSHOT_MISMATCH')
    expect(migration).toContain('DIRECT_CHECKOUT_REQUIRES_ONE_VEHICLE_ITEM')
    expect(migration).toContain('CART_CHECKOUT_REQUIRES_ACCESSORY_ITEMS_ONLY')
    expect(migration).toContain('ORDER_SNAPSHOT_IMMUTABLE')
    expect(migration).toMatch(
      /old\.snapshot_finalized_at is null[\s\S]*?new\.snapshot_finalized_at is not null/i,
    )
    expect(migration).toMatch(
      /old\.subtotal is distinct from new\.subtotal[\s\S]*?old\.shipping_address is distinct from new\.shipping_address/i,
    )
  })
})
