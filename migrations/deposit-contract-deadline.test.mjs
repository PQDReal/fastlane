import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./039_deposit_contract_deadline_and_cancellation.sql', import.meta.url),
  'utf8',
)

describe('deposit contract deadline migration', () => {
  it('uses the live document type and never cascades legal evidence deletion', () => {
    expect(sql).toContain("<> 'CAR_SALES_CONTRACT'")
    expect(sql).not.toContain('CAR_PURCHASE_AGREEMENT')
    expect(sql).not.toMatch(/deposit_order_documents[\s\S]{0,500}on delete cascade/i)
    expect(sql).toContain('on delete restrict')
  })

  it('adds constrained workflow projections and immutable document evidence', () => {
    expect(sql).toContain('contract_signature_expired_at')
    expect(sql).toContain('cancellation_reason_code')
    expect(sql).toContain('FASTLANE_JSON_V1')
    expect(sql).toContain('guard_deposit_order_document_update')
    expect(sql).toContain("content_hash ~ '^[0-9a-f]{64}$'")
  })

  it('records idempotent append-only events', () => {
    expect(sql).toContain('create table if not exists public.deposit_order_events')
    expect(sql).toContain('uq_deposit_order_events_event_key')
    expect(sql).toContain('reject_deposit_order_event_mutation')
    expect(sql).toContain('p_event_key text')
  })

  it('supports idempotent contract notifications without weakening status notifications', () => {
    expect(sql).toContain('add column if not exists event_key text')
    expect(sql).toContain("'CONTRACT_ISSUED'")
    expect(sql).toContain('uq_customer_notifications_event_key')
    expect(sql).toContain("where notification_type = 'ORDER_STATUS_CHANGED'")
  })

  it('expires contracts in bounded skip-locked batches', () => {
    expect(sql).toContain('expire_due_deposit_order_contracts')
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('p_limit > 500')
  })

  it('keeps browser roles away from legal tables and transition RPCs', () => {
    expect(sql).toMatch(/revoke all on table public\.deposit_order_documents from public, anon, authenticated/i)
    expect(sql).toMatch(/revoke all on table public\.deposit_order_events from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.sign_deposit_order_contract[\s\S]+to service_role/i)
  })
})
