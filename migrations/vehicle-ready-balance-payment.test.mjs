import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./041_vehicle_ready_balance_payment_deadline.sql', import.meta.url),
  'utf8',
)
const reconciliationSql = readFileSync(
  new URL('./042_reconcile_legacy_balance_payment_states.sql', import.meta.url),
  'utf8',
)

describe('vehicle-ready balance payment migration', () => {
  it('adds a separate waiting-for-vehicle state and projection', () => {
    expect(sql).toContain("'WAITING_VEHICLE'")
    expect(sql).toContain('vehicle_ready_notified_at')
    expect(sql).toContain('balance_payment_due_at')
    expect(sql).toContain('deposit_orders_balance_payment_state_check')
  })

  it('calculates a versioned business-day deadline instead of calendar hours', () => {
    expect(sql).toContain('add_business_days')
    expect(sql).toContain('VN_WEEKDAY_V1')
    expect(sql).not.toMatch(/interval\s+'7 days'/i)
    expect(sql).not.toMatch(/168\s*hours/i)
  })

  it('gates the transition behind an admin, signed document, and paid deposit', () => {
    expect(sql).toContain('VEHICLE_READY_ADMIN_REQUIRED')
    expect(sql).toContain('VEHICLE_READY_SIGNED_DOCUMENT_REQUIRED')
    expect(sql).toContain('VEHICLE_READY_DEPOSIT_NOT_PAID')
    expect(sql).toContain("p_payment_mode is distinct from 'DIRECT'")
  })

  it('keeps idempotent audit, notification, and overdue commands server-only', () => {
    expect(sql).toContain('VEHICLE_READY_NOTIFIED')
    expect(sql).toContain('BALANCE_PAYMENT_OVERDUE')
    expect(sql).toContain('on conflict (event_key) do nothing')
    expect(sql).toContain('grant execute on function public.notify_deposit_order_vehicle_ready')
    expect(sql).toContain('grant execute on function public.mark_due_deposit_balance_payments')
  })

  it('only reconciles legacy rows with signed evidence and a paid deposit', () => {
    expect(reconciliationSql).toContain("d.status = 'PENDING_PAYMENT'")
    expect(reconciliationSql).toContain('d.balance_payment_due_at is null')
    expect(reconciliationSql).toContain("doc.status = 'SIGNED'")
    expect(reconciliationSql).toContain("attempt.status = 'PAID'")
    expect(reconciliationSql).toContain("status = 'WAITING_VEHICLE'")
  })
})
