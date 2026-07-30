import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '016_deposit_orders.sql'),
  'utf8',
).replace(/\r\n?/g, '\n')

describe('deposit orders migration', () => {
  it('keeps order numbers unique and adds idempotency protection', () => {
    expect(migration).toContain('deposit_orders_order_number_uidx')
    expect(migration).toContain('add column if not exists idempotency_key text')
    expect(migration).toContain('deposit_orders_idempotency_key_uidx')
  })

  it('adds normalized catalog relationships without replacing legacy fields', () => {
    expect(migration).toContain('add column if not exists product_id uuid')
    expect(migration).toContain('add column if not exists variant_id uuid')
    expect(migration).toContain('deposit_orders_product_id_fkey')
    expect(migration).toContain('deposit_orders_variant_id_fkey')
    expect(migration).toContain("vehicle_type is null or vehicle_type in ('car', 'motorbike')")
    expect(migration).toContain('terms_accepted_at timestamptz')
  })

  it('preserves province, ward, interior color, and all existing column constraints', () => {
    expect(migration).toContain('province text not null')
    expect(migration).toContain('ward text not null')
    expect(migration).toContain('interior_color text not null')
    expect(migration).not.toContain('district')
    expect(migration).not.toContain('alter column ward')
    expect(migration).not.toContain('alter column interior_color')
    expect(migration).not.toContain('alter column order_number')
    expect(migration).not.toContain('drop table public.deposit_orders')
  })

  it('keeps writes behind the service role', () => {
    expect(migration).toContain('alter table public.deposit_orders enable row level security')
    expect(migration).toContain('revoke all on public.deposit_orders from anon, authenticated')
    expect(migration).toContain('grant all on public.deposit_orders to service_role')
  })
})