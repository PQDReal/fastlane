import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_WEBHOOK_AGE_SECONDS = 300

export function verifyDiditWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret = process.env.DIDIT_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!secret || !signature || !timestamp) return false

  const sentAt = Number(timestamp)
  if (
    !Number.isInteger(sentAt)
    || Math.abs(nowSeconds - sentAt) > MAX_WEBHOOK_AGE_SECONDS
  ) {
    return false
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const expected = Buffer.from(expectedSignature, 'utf8')
  const provided = Buffer.from(signature, 'utf8')

  return expected.length === provided.length && timingSafeEqual(expected, provided)
}
