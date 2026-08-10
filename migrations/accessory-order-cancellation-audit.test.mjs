import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./049_accessory_order_cancellation_audit.sql', import.meta.url),
  'utf8',
)
const actorIndexesSql = readFileSync(
  new URL('./050_accessory_cancellation_actor_indexes.sql', import.meta.url),
  'utf8',
)
const customerRoute = readFileSync(
  new URL('../app/api/v1/orders/[orderId]/route.ts', import.meta.url),
  'utf8',
)
const adminRoute = readFileSync(
  new URL('../app/api/v1/admin/orders/[orderId]/actions/[action]/route.ts', import.meta.url),
  'utf8',
)
const vehicleAdminPage = readFileSync(
  new URL('../app/admin/orders/page.tsx', import.meta.url),
  'utf8',
)
const vehicleCustomerRoute = readFileSync(
  new URL('../app/api/v1/deposit-orders/[orderId]/route.ts', import.meta.url),
  'utf8',
)

describe('accessory order cancellation audit migration', () => {
  it('stores a queryable projection and an append-only event', () => {
    expect(sql).toContain('cancelled_by_user_id uuid')
    expect(sql).toContain('cancellation_reason_code text')
    expect(sql).toContain('cancellation_audit_version smallint')
    expect(sql).toContain('create table if not exists public.accessory_order_events')
    expect(sql).toContain('ACCESSORY_ORDER_EVENT_IMMUTABLE')
    expect(sql).toMatch(/before update or delete on public\.accessory_order_events/i)
  })

  it('indexes both actor foreign keys used for cancellation tracing', () => {
    expect(actorIndexesSql).toMatch(/public\.orders\(cancelled_by_user_id\)/i)
    expect(actorIndexesSql).toMatch(/public\.accessory_order_events\(actor_user_id, occurred_at desc\)/i)
    expect(actorIndexesSql).toMatch(/where cancelled_by_user_id is not null/i)
    expect(actorIndexesSql).toMatch(/where actor_user_id is not null/i)
  })

  it('marks legacy inference without fabricating an admin identity or timestamp source', () => {
    expect(sql).toContain("when cancellation_reason = 'ADMIN_CANCELLED' then 'ADMIN'")
    expect(sql).toContain("when cancellation_reason = 'Khách hàng yêu cầu hủy đơn' then customer_id")
    expect(sql).toContain("else 'UNKNOWN'")
    expect(sql).toContain("'actorIdentityKnown', order_record.cancelled_by_user_id is not null")
    expect(sql).toContain("'occurredAtSource', 'orders.updated_at'")
    expect(sql).toMatch(/cancellation_audit_version = 1/i)
  })

  it('uses an identity-verified, idempotent cancellation command', () => {
    expect(sql).toContain('cancel_accessory_order_audited')
    expect(sql).toContain("actor.role::text = p_actor_type")
    expect(sql).toContain("actor.status::text = 'ACTIVE'")
    expect(sql).toContain('v_order.customer_id is distinct from p_actor_user_id')
    expect(sql).toContain('IDEMPOTENCY_KEY_CONFLICT')
    expect(sql).toMatch(/from public\.orders[\s\S]+for update/i)
    expect(sql).toContain('perform public.cancel_accessory_order(')
    expect(sql).toContain('ACCESSORY_ORDER_MUST_NOT_START_CANCELLED')
    expect(sql).toMatch(/before insert or update on public\.orders/i)
    expect(sql).toMatch(/revoke all on function public\.cancel_accessory_order\(uuid,uuid,text\)[\s\S]+service_role/i)
  })

  it('passes the real customer and administrator identities from both APIs', () => {
    expect(customerRoute).toContain("rpc('cancel_accessory_order_audited'")
    expect(customerRoute).toContain("p_actor_type: 'CUSTOMER'")
    expect(customerRoute).toContain('p_actor_user_id: customer.id')
    expect(adminRoute).toContain("rpc('cancel_accessory_order_audited'")
    expect(adminRoute).toContain("p_actor_type: 'ADMIN'")
    expect(adminRoute).toContain('p_actor_user_id: admin.id')
    expect(adminRoute).not.toContain("rpc('cancel_accessory_order',")
  })

  it('reads the existing vehicle cancellation event trail for admin display', () => {
    expect(vehicleAdminPage).toContain(".from('deposit_order_events')")
    expect(vehicleAdminPage).toContain(".in('event_type', ['DEPOSIT_CANCELLED', 'CONTRACT_EXPIRED'])")
    expect(vehicleAdminPage).toContain('actorEmailById')
    expect(vehicleAdminPage).toContain('cancellationAudit')
  })

  it('lets a vehicle cancellation request replay without duplicating its notification', () => {
    expect(vehicleCustomerRoute).toMatch(/ALLOWED_CANCEL_STATUSES[^\n]+CANCELLED/)
    expect(vehicleCustomerRoute).toContain('if (!cancelled.replayed)')
    expect(vehicleCustomerRoute).toContain('cancellation_reason_code')
  })
})
