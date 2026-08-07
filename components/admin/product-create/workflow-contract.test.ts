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
    ['o-to-dien', 'Ô tô điện', 'car'],
    ['xe-may-dien', 'Xe máy điện', 'motorbike'],
  ] as const)('maps %s to its supported product workflow', (slug, name, workflow) => {
    expect(productWorkflowCapability(category({ slug, name }))).toEqual({
      workflow,
      status: 'supported',
      label: name,
      createTitle: `Thêm sản phẩm · ${name}`,
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
