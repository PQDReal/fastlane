import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('./order-detail-drawer.tsx', import.meta.url), 'utf8')

describe('admin deposit commands', () => {
  it('routes cancellation and delivery through named atomic RPCs', () => {
    expect(source).toContain("rpc('admin_cancel_deposit_order_before_signature'")
    expect(source).toContain("rpc('advance_deposit_order_delivery'")
    expect(source).not.toMatch(/\.update\(\{\s*status:\s*newStatus/)
  })

  it('keeps approval compare-and-set constrained to PENDING_CONFIRMATION', () => {
    expect(source).toMatch(/update\(\{ status: 'CONFIRMED'[\s\S]+eq\('status', 'PENDING_CONFIRMATION'\)/)
  })

  it('routes initial issue and missing-document repair through the issue endpoint', () => {
    expect(drawerSource).toContain("newStatus === 'PENDING_CONTRACT'")
    expect(drawerSource).toContain("/contract/issue")
  })
})
