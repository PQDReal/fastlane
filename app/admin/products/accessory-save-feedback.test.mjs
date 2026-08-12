import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const editPage = readFileSync(new URL('./accessories/edit/[productId]/page.tsx', import.meta.url), 'utf8')
const productsPage = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('accessory save feedback', () => {
  it('carries the edit success toast across the products-page navigation', () => {
    expect(editPage).toContain("title: 'Đã cập nhật phụ kiện'")
    expect(editPage).toContain('storeAdminFlashToast(window.sessionStorage')
    expect(editPage.indexOf('storeAdminFlashToast(window.sessionStorage')).toBeLessThan(
      editPage.indexOf("router.push('/admin/products')", editPage.indexOf('storeAdminFlashToast(window.sessionStorage')),
    )
    expect(productsPage).toContain('consumeAdminFlashToast(window.sessionStorage)')
    expect(productsPage).toContain('notify(toast.kind, toast.title, toast.message)')
  })
})
