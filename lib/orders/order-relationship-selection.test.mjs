import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const serverSource = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')
const adminPageSource = readFileSync(
  new URL('../../app/admin/accessory-orders/page.tsx', import.meta.url),
  'utf8',
)

describe('orders customer relationship selection', () => {
  it.each([serverSource, adminPageSource])(
    'selects the orders customer foreign key explicitly',
    (source) => {
      expect(source).toContain('customer:users!orders_customer_id_fkey!inner')
      expect(source).not.toContain('customer:users!inner')
    },
  )
})
