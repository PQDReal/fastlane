import { describe, expect, it, vi } from 'vitest'

import { claimGuestDepositOrder } from './order-ownership'

describe('claimGuestDepositOrder', () => {
  it('does not call the database for an already-owned order', async () => {
    const rpc = vi.fn()
    const claimed = await claimGuestDepositOrder(
      { rpc } as any,
      { id: 'order-1', customer_id: 'customer-1', email: 'a@example.com' },
      { id: 'customer-1', email: 'a@example.com' },
    )
    expect(claimed).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('claims an unowned guest order only when account email matches', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const claimed = await claimGuestDepositOrder(
      { rpc } as any,
      { id: 'order-1', customer_id: null, email: 'A@Example.com ' },
      { id: 'customer-1', email: 'a@example.com' },
    )
    expect(claimed).toBe(true)
    expect(rpc).toHaveBeenCalledWith('claim_guest_deposit_order', expect.objectContaining({
      p_order_id: 'order-1',
      p_customer_id: 'customer-1',
    }))
  })

  it('rejects an email mismatch before invoking the privileged command', async () => {
    const rpc = vi.fn()
    await expect(claimGuestDepositOrder(
      { rpc } as any,
      { id: 'order-1', customer_id: null, email: 'owner@example.com' },
      { id: 'customer-1', email: 'other@example.com' },
    )).rejects.toThrow('DEPOSIT_CLAIM_FORBIDDEN')
    expect(rpc).not.toHaveBeenCalled()
  })
})
