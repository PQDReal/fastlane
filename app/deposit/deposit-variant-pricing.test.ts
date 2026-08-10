import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const client = fs.readFileSync(new URL('./DepositClient.tsx', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const api = fs.readFileSync(
  new URL('../api/v1/vehicle-variants/route.ts', import.meta.url),
  'utf8',
)

describe('deposit vehicle variant price ownership', () => {
  it('passes the canonical motorbike product id to the client', () => {
    expect(page).toContain('product_id: motorbike.productId')
  })

  it('prefers product_id and clears stale variants while changing models', () => {
    expect(client).toContain('currentCarObj.product_id')
    expect(client).toContain('setDbVariants([])')
    expect(client).toContain('controller.abort()')
  })

  it('matches the canonical name from a short display name safely', () => {
    expect(api).toContain(".ilike('product_name', `%${normalized}%`)")
    expect(api).toContain("replace(/[%_]/g, '')")
    expect(api).not.toContain('`%${productName}%`')
  })
})
