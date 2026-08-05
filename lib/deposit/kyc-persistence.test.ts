import { describe, expect, it, vi } from 'vitest'
import { updateDepositOrderWithKycFallback } from './kyc-persistence'

function clientWithResults(results: Array<{ error: any }>) {
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn(async () => results.shift() ?? { error: null }),
    payload,
  }))

  return {
    client: { from: vi.fn(() => ({ update })) },
    update,
  }
}

describe('updateDepositOrderWithKycFallback', () => {
  it('persists the complete KYC snapshot on the migrated schema', async () => {
    const { client, update } = clientWithResults([{ error: null }])
    const payload = { status: 'PENDING_CONTRACT', kyc_status: 'APPROVED' }

    await expect(updateDepositOrderWithKycFallback(client, 'order-1', payload))
      .resolves.toEqual({ error: null })
    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(payload)
  })

  it('retries without KYC columns when migration 036 is not installed', async () => {
    const { client, update } = clientWithResults([
      { error: { code: '42703', message: 'column does not exist' } },
      { error: null },
    ])

    await expect(updateDepositOrderWithKycFallback(client, 'order-1', {
      status: 'PENDING_CONTRACT',
      kyc_status: 'APPROVED',
      kyc_session_id: 'session-1',
      updated_at: '2026-08-05T00:00:00.000Z',
    })).resolves.toEqual({ error: null })

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenLastCalledWith({
      status: 'PENDING_CONTRACT',
      updated_at: '2026-08-05T00:00:00.000Z',
    })
  })

  it('does not hide unrelated database errors', async () => {
    const error = { code: '23514', message: 'constraint violation' }
    const { client, update } = clientWithResults([{ error }])

    await expect(updateDepositOrderWithKycFallback(client, 'order-1', {
      kyc_status: 'REVIEW',
    })).resolves.toEqual({ error })
    expect(update).toHaveBeenCalledOnce()
  })
})
