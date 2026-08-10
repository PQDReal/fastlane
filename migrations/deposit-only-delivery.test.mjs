import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./043_deposit_only_vehicle_delivery_workflow.sql', import.meta.url),
  'utf8',
)
const paymentService = readFileSync(
  new URL('../lib/services/vnpay-payment-service.ts', import.meta.url),
  'utf8',
)
const profile = readFileSync(new URL('../app/profile/page.tsx', import.meta.url), 'utf8')

describe('deposit-only delivery workflow', () => {
  it('removes balance states from the authoritative order constraint', () => {
    const statusConstraint = sql.match(/add constraint deposit_orders_status_check[\s\S]*?\)\),/i)?.[0] ?? ''
    expect(statusConstraint).not.toContain("'PENDING_PAYMENT'")
    expect(statusConstraint).not.toContain("'PAID'")
    expect(statusConstraint).toContain("'WAITING_VEHICLE'")
    expect(statusConstraint).toContain("'PREPARING_DELIVERY'")
  })

  it('retires balance RPCs and write access while retaining audit data', () => {
    expect(sql).toContain('drop function if exists public.notify_deposit_order_vehicle_ready')
    expect(sql).toContain('drop function if exists public.mark_due_deposit_balance_payments')
    expect(sql).toContain('Historical audit only')
    expect(sql).toContain('revoke insert, update, delete, truncate')
  })

  it('moves signed orders directly into the vehicle waiting stage', () => {
    expect(sql).toContain("set status = 'WAITING_VEHICLE', contract_signed_at")
    expect(sql).toContain("return query select v_document.id, 'WAITING_VEHICLE'::text")
  })

  it('vehicle-ready command prepares delivery without creating a payment deadline', () => {
    expect(sql).toContain("set status = 'PREPARING_DELIVERY'")
    expect(sql).toContain("'VEHICLE_READY_FOR_DELIVERY'")
    const command = sql.slice(sql.indexOf('create or replace function public.mark_deposit_order_vehicle_ready'))
    expect(command).not.toContain('add_business_days')
    expect(command).not.toContain("'PENDING_PAYMENT'")
  })

  it('contains no customer balance-payment capability', () => {
    expect(paymentService).not.toContain('createOrReuseVnPayVehicleBalancePayment')
    expect(paymentService).not.toContain("orderKind: 'vehicle_balance'")
    expect(profile).not.toContain('payVehicleBalance')
    expect(profile).not.toContain('Thanh toán phần còn lại')
    expect(profile).not.toContain('Thanh toán toàn bộ đơn xe')
  })
})
