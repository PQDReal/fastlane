import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'

export type ProductWorkflowKey = 'accessory'
export type ProductCapabilityStatus = 'supported' | 'planned' | 'unavailable'

export type ProductWorkflowCapability = {
  workflow: ProductWorkflowKey | null
  status: ProductCapabilityStatus
  label: string
  createTitle: string | null
}
const PRODUCT_WORKFLOW_CAPABILITIES: Record<string, ProductWorkflowCapability> = {
  'phu-kien': {
    workflow: 'accessory',
    status: 'supported',
    label: 'Phụ kiện',
    createTitle: 'Thêm sản phẩm · Phụ kiện',
  },
  'o-to-dien': {
    workflow: null,
    status: 'planned',
    label: 'Ô tô điện',
    createTitle: null,
  },
  'xe-may-dien': {
    workflow: null,
    status: 'planned',
    label: 'Xe máy điện',
    createTitle: null,
  },
}

export function productWorkflowCapability(category: AdminRootCategory): ProductWorkflowCapability {
  const isActive = category.isActive ?? category.is_active ?? true
  if (!isActive) {
    return { workflow: null, status: 'unavailable', label: category.name, createTitle: null }
  }

  return PRODUCT_WORKFLOW_CAPABILITIES[category.slug] ?? {
    workflow: null,
    status: 'unavailable',
    label: category.name,
    createTitle: null,
  }
}
