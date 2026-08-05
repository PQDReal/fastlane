import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(
  new URL('./034_scope_deposit_idempotency.sql', import.meta.url),
  'utf8',
)

describe('deposit idempotency ownership scope', () => {
  it('scopes authenticated keys by customer', () => {
    expect(sql).toMatch(/\(customer_id, idempotency_key\)[\s\S]*customer_id is not null/i)
  })

  it('scopes guest keys by normalized email', () => {
    expect(sql).toMatch(/\(lower\(email\), idempotency_key\)[\s\S]*customer_id is null/i)
  })
})
