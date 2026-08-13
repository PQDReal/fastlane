import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scheduleVnPayReconciliation } from './vnpay-reconciliation-scheduler'

describe('VNPay reconciliation scheduler', () => {
  beforeEach(() => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token')
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
    expect(String(url)).toContain('qstash.upstash.io/v2/publish/')
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
})
