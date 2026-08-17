import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '005_accessory_checkout_option_snapshot.sql'),
  'utf8',
)

describe('accessory checkout option snapshot migration', () => {
  it('uses variant IDs for every selected cart-item boundary', () => {
    expect(migration).not.toMatch(/\bcart_item\.id\b/i)
    expect(migration.match(/cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\)/gi))
      .toHaveLength(8)

    for (const statement of [
      /select count\(\*\)[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\);/i,
      /perform inventory\.variant_id[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\)[\s\S]*?for update of inventory;/i,
      /select coalesce\([\s\S]*?into v_subtotal[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\);/i,
      /insert into public\.order_items[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\);/i,
      /update public\.inventory_items[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\)/i,
      /delete from public\.cart_items[\s\S]*?cart_item\.variant_id\s*=\s*any\(p_cart_item_ids\);/i,
    ]) {
      expect(migration).toMatch(statement)
    }
  })

  it('preserves idempotency before mutation and partial-checkout cart handling', () => {
    const idempotencyLookup = migration.indexOf('into v_existing_order')
    const cartLock = migration.indexOf('into v_cart')
    const orderInsert = migration.indexOf('insert into public.orders')

    expect(idempotencyLookup).toBeGreaterThan(-1)
    expect(idempotencyLookup).toBeLessThan(cartLock)
    expect(cartLock).toBeLessThan(orderInsert)
    expect(migration).toMatch(/if found then[\s\S]*?IDEMPOTENCY_KEY_REUSED[\s\S]*?return jsonb_build_object\('orderId', v_existing_order\.id\);/i)
    expect(migration).toMatch(
      /delete from public\.cart_items[\s\S]*?where cart_item\.cart_id = v_cart\.id[\s\S]*?cart_item\.variant_id = any\(p_cart_item_ids\);[\s\S]*?if exists \(select 1 from public\.cart_items where cart_id = v_cart\.id\) then[\s\S]*?set updated_at = clock_timestamp\(\)[\s\S]*?else[\s\S]*?set status = 'CONVERTED'/i,
    )
  })
})
