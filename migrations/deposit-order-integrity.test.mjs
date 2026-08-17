import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '022_deposit_order_integrity.sql'),
  'utf8',
)

describe('deposit order integrity migration', () => {
  it('adds snapshots without replacing the legacy deposit table', () => {
    expect(migration).toContain('add column if not exists province_code text')
    expect(migration).toContain('add column if not exists promotion_id uuid')
    expect(migration).toContain('add column if not exists request_hash text')
    expect(migration).toContain('add column if not exists promotion_code text')
    expect(migration).toContain('btrim(new.promotion_code)')
    expect(migration).not.toContain('add column if not exists promotion_code_snapshot')
    expect(migration).not.toContain('drop table public.deposit_orders')
  })

  it('enforces catalog pairs, promotion snapshots and validated new rows', () => {
    expect(migration).toContain('deposit_orders_product_variant_pair_fkey')
    expect(migration).toContain('references public.product_variants(product_id, id)')
    expect(migration).toContain('deposit_orders_promotion_id_fkey')
    expect(migration).toContain('deposit_orders_quote_amounts')
    expect(migration).toContain('deposit_orders_identity_by_customer_type')
    expect(migration).toContain('deposit_orders_customer_identity')
    expect(migration).toContain('deposit_orders_location_names')
    expect(migration).toContain('is_valid_vietnam_tax_id')
    expect(migration).toContain('is_valid_deposit_personal_id')
    expect(migration).toContain('consume_deposit_promotion')
    expect(migration).toContain('for update')
    expect(migration).toContain('set used_count = used_count + 1')
    expect(migration).toContain('not valid')
  })
})
