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

  it('maps the car root to the supported car workflow', () => {
    expect(productWorkflowCapability(category({ slug: 'o-to-dien', name: 'Ô tô điện' }))).toEqual({
      workflow: 'car',
      status: 'supported',
      label: 'Ô tô điện',
      createTitle: 'Thêm sản phẩm · Ô tô điện',
    })
  })

  it('maps the motorbike root to the supported motorbike workflow', () => {
    expect(productWorkflowCapability(category({ slug: 'xe-may-dien', name: 'Xe máy điện' }))).toEqual({
      workflow: 'motorbike',
      status: 'supported',
      label: 'Xe máy điện',
      createTitle: 'Thêm sản phẩm · Xe máy điện',
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
