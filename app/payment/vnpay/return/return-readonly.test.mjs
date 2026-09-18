import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('VNPAY Return page', () => {
  it('never writes payment state', () => {
    expect(source).toMatch(/processVnPayCallback\([\s\S]+updatePayment:\s*false/)
  })

  it('does not simulate an IPN request from the browser', () => {
    expect(source).not.toMatch(/AutoIpnTrigger|payments\/vnpay\/ipn/)
  })
})
