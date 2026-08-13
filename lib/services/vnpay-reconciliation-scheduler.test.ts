import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scheduleVnPayReconciliation, tryScheduleVnPayReconciliation } from './vnpay-reconciliation-scheduler'

describe('VNPay reconciliation scheduler', () => {
  beforeEach(() => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token')
    vi.stubEnv('QSTASH_URL', 'https://qstash-eu.example/')
    vi.stubEnv('QSTASH_CALLBACK_SECRET', 'callback-secret')
    vi.stubEnv('APP_BASE_URL', 'https://fastlane.example/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('publishes a protected QueryDR job with a 15 minute delay', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ messageId: 'message-1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))

    await scheduleVnPayReconciliation({ attemptId: 'attempt-1', orderKind: 'deposit' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://qstash-eu.example/v2/publish/https://fastlane.example/api/v1/payments/vnpay/reconcile-attempt')
    expect(options?.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer qstash-token',
      'Upstash-Delay': '15m',
      'Upstash-Forward-Authorization': 'Bearer callback-secret',
      'Upstash-Retries': '3',
      'Upstash-Retry-Delay': '300000',
    }))
    expect(options?.body).toBe(JSON.stringify({ attemptId: 'attempt-1', orderKind: 'deposit' }))
  })

  it('does not publish when QStash is not configured', async () => {
    vi.stubEnv('QSTASH_TOKEN', '')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    expect(await scheduleVnPayReconciliation({ attemptId: 'attempt-1', orderKind: 'deposit' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('includes the QStash response body in publish errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid destination', { status: 400 }))
    await expect(scheduleVnPayReconciliation({ attemptId: 'attempt-1', orderKind: 'deposit' }))
      .rejects.toThrow('QStash HTTP 400: invalid destination')
  })

  it('does not block payment when the backup scheduler is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('temporary error', { status: 503 }))
    expect(await tryScheduleVnPayReconciliation({ attemptId: 'attempt-1', orderKind: 'accessory' })).toBeNull()
  })
})
