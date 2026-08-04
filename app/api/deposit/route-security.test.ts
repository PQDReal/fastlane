import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('deposit route safety contract', () => {
  it('scopes authenticated idempotency lookups to customer_id', () => {
    expect(source).toContain("query.eq('customer_id', customerId)")
  })

  it('keeps guest idempotency lookups separate from authenticated users', () => {
    expect(source).toContain("query.is('customer_id', null)")
    expect(source).toContain(".ilike('email', guestEmail)")
  })

  it('compares request hashes after a concurrent unique-key conflict', () => {
    expect(source).toMatch(/error\.code === '23505'[\s\S]*decideDepositReplay\(replay\.request_hash, hash\)/)
  })
})
