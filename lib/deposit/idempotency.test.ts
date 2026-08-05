import { describe, expect, it } from 'vitest'

import { decideDepositReplay } from './idempotency'

describe('deposit idempotency replay', () => {
  it('creates when the customer or guest scope has no matching key', () => {
    expect(decideDepositReplay(undefined, 'hash-a')).toBe('CREATE')
  })

  it('replays the existing order for the same payload hash', () => {
    expect(decideDepositReplay('hash-a', 'hash-a')).toBe('REPLAY')
  })

  it('rejects a reused key carrying a different payload', () => {
    expect(decideDepositReplay('hash-a', 'hash-b')).toBe('CONFLICT')
  })

  it('replays legacy rows that predate request_hash', () => {
    expect(decideDepositReplay(null, 'hash-a')).toBe('REPLAY')
  })
})

