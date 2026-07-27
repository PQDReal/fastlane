import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '008_finalize_order_snapshot_after_items.sql',
  ),
  'utf8',
)

describe('accessory checkout snapshot finalization order', () => {
  it('inserts item snapshots before finalizing the parent order', () => {
    const orderInsert = migration.indexOf('insert into public.orders')
    const itemInsert = migration.indexOf('insert into public.order_items')
    const finalizeOrder = migration.indexOf(
      'set snapshot_finalized_at = clock_timestamp()',
    )

    expect(orderInsert).toBeGreaterThan(-1)
    expect(itemInsert).toBeGreaterThan(orderInsert)
    expect(finalizeOrder).toBeGreaterThan(itemInsert)

    const orderInsertSql = migration.slice(orderInsert, itemInsert)
    expect(orderInsertSql).not.toContain('snapshot_finalized_at')
    expect(migration).toMatch(
      /update public\.orders\s+set snapshot_finalized_at = clock_timestamp\(\),\s+updated_at = clock_timestamp\(\)\s+where id = v_order\.id\s+returning \* into v_order;/i,
    )
  })

  it('retains selected-item predicates, option snapshots, and RPC grants', () => {
    expect(migration).not.toMatch(/\bcart_item\.id\b/i)
    expect(migration.match(
      /cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\)/gi,
    )).toHaveLength(8)
    expect(migration).toContain('selected_options_snapshot')
    expect(migration).toMatch(
      /revoke all on function public\.checkout_accessory_cart[\s\S]*?from public, anon, authenticated;/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.checkout_accessory_cart[\s\S]*?to service_role;/i,
    )
  })
})
