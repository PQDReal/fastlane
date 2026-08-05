import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { verifyDiditWebhook } from './webhook'

const secret = 'didit-webhook-test-secret'
const timestamp = 1_750_000_000
const rawBody = JSON.stringify({
  webhook_type: 'status.updated',
  status: 'Approved',
  session_id: 'session-1',
  vendor_data: 'order-1',
})
const signature = createHmac('sha256', secret).update(rawBody).digest('hex')

describe('Didit webhook verification', () => {
  it('accepts a valid signature with a fresh timestamp', () => {
    expect(verifyDiditWebhook(
      rawBody,
      signature,
      String(timestamp),
      secret,
      timestamp + 30,
    )).toBe(true)
  })

  it('rejects modified payloads and invalid signatures', () => {
    expect(verifyDiditWebhook(
      `${rawBody} `,
      signature,
      String(timestamp),
      secret,
      timestamp,
    )).toBe(false)
    expect(verifyDiditWebhook(
      rawBody,
      'invalid',
      String(timestamp),
      secret,
      timestamp,
    )).toBe(false)
  })

  it('rejects missing configuration and stale timestamps', () => {
    expect(verifyDiditWebhook(rawBody, signature, String(timestamp), '', timestamp)).toBe(false)
    expect(verifyDiditWebhook(rawBody, signature, null, secret, timestamp)).toBe(false)
    expect(verifyDiditWebhook(
      rawBody,
      signature,
      String(timestamp),
      secret,
      timestamp + 301,
    )).toBe(false)
  })
})
