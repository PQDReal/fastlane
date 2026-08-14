import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./035_customer_order_notifications.sql', import.meta.url), 'utf8')

describe('customer order notifications migration', () => {
  it('creates private, indexed and idempotent notifications', () => {
    expect(migration).toContain('create table if not exists public.customer_notifications')
    expect(migration).toContain('customer_notifications_order_status_unique')
    expect(migration).toContain('where read_at is null')
    expect(migration).toContain('enable row level security')
    expect(migration).toMatch(/revoke all on table public\.customer_notifications from public, anon, authenticated/i)
  })

  it('covers accessory and deposit status changes without duplicate events', () => {
    expect(migration).toContain('after update of status on public.orders')
    expect(migration).toContain('after update of status on public.deposit_orders')
    expect(migration).toMatch(/old\.status is not distinct from new\.status/i)
    expect(migration).toMatch(/on conflict \(customer_id, order_type, order_id, current_status\) do nothing/i)
  })
})
