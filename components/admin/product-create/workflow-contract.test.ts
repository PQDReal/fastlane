import { describe, expect, it } from 'vitest'

import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import { productWorkflowCapability } from './workflow-contract'

function category(patch: Partial<AdminRootCategory> = {}): AdminRootCategory {
  return {
    id: 'category-1',
    name: 'Phụ kiện',
    slug: 'phu-kien',
    ...patch,
  }
}

describe('productWorkflowCapability', () => {
  it('maps the accessory root to the supported accessory workflow', () => {
    expect(productWorkflowCapability(category())).toEqual({
      workflow: 'accessory',
      status: 'supported',
      label: 'Phụ kiện',
      createTitle: 'Thêm sản phẩm · Phụ kiện',
    })
  })

  it.each([
    ['o-to-dien', 'Ô tô điện'],
    ['xe-may-dien', 'Xe máy điện'],
  ])('marks %s as planned without falling back to accessory', (slug, name) => {
    expect(productWorkflowCapability(category({ slug, name }))).toMatchObject({
      workflow: null,
      status: 'planned',
    })
  })

  it('marks unknown roots unavailable', () => {
    expect(productWorkflowCapability(category({ slug: 'unknown', name: 'Khác' }))).toEqual({
      workflow: null,
      status: 'unavailable',
      label: 'Khác',
      createTitle: null,
    })
  })

  it('does not expose an inactive accessory category', () => {
    expect(productWorkflowCapability(category({ isActive: false }))).toMatchObject({
      workflow: null,
      status: 'unavailable',
    })
  })
})
