import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../../../.github/workflows/deposit-contract-expiry.yml', import.meta.url),
  'utf8',
)

describe('unsigned document expiry schedule', () => {
  it('invokes the protected mutation endpoint every five minutes', () => {
    expect(workflow).toContain("cron: '*/5 * * * *'")
    expect(workflow).toContain('--request POST')
    expect(workflow).toContain('Authorization: Bearer $CRON_SECRET')
    expect(workflow).toContain('/api/v1/deposit-orders/expire-contracts')
  })
})
