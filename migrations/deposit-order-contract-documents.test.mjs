import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(
  new URL('./035_preserve_deposit_orders_add_contract_documents.sql', import.meta.url),
  'utf8',
)

describe('lossless deposit order contract migration', () => {
  it('retires only the obsolete product variant foreign key', () => {
    expect(sql).toMatch(/drop constraint if exists deposit_orders_variant_id_fkey/i)
    expect(sql).toMatch(/comment on column public\.deposit_orders\.variant_id[\s\S]*DEPRECATED, READ-ONLY/i)
    expect(sql).not.toMatch(/drop column(?: if exists)? variant_id/i)
  })

  it('aborts when any original order value changes', () => {
    expect(sql).toContain('before_snapshot jsonb')
    expect(sql).toContain('after_snapshot jsonb')
    expect(sql).toMatch(/before_snapshot is distinct from after_snapshot/i)
    expect(sql).toMatch(/raise exception[\s\S]*lossless snapshot/i)
    expect(sql).not.toMatch(/create temporary table/i)
  })

  it('does not add obsolete battery-rental columns', () => {
    expect(sql).not.toMatch(/add column if not exists battery_/i)
    expect(sql).not.toMatch(/battery_monthly_fee_snapshot/i)
    expect(sql).not.toMatch(/battery_security_deposit_snapshot/i)
  })

  it('supports versioned sale documents per order', () => {
    expect(sql).toContain('create table if not exists public.deposit_order_documents')
    expect(sql).toContain("'MOTORBIKE_SALES_CONTRACT'")
    expect(sql).not.toContain("'MOTORBIKE_BATTERY_RENTAL_CONTRACT'")
    expect(sql).toMatch(/unique \(deposit_order_id, document_type, document_version\)/i)
  })
})
