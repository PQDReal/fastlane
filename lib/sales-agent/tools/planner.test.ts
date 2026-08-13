import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolveVehicles: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../catalog/context', () => ({ resolveSalesAgentVehicleReferences: mocks.resolveVehicles }))

import { planSalesAgentTools } from './planner'

describe('sales agent deterministic tool planner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveVehicles.mockResolvedValue([])
  })

  it('does not query catalog for a greeting', async () => {
    await expect(planSalesAgentTools('Bạn là ai?')).resolves.toEqual({ calls: [] })
    expect(mocks.resolveVehicles).not.toHaveBeenCalled()
  })

  it('plans a comparison for two resolved vehicles', async () => {
    mocks.resolveVehicles.mockResolvedValue([
      { id: 'vf7', name: 'VF 7', productType: 'CAR' },
      { id: 'vf8', name: 'VF 8', productType: 'CAR' },
    ])
    await expect(planSalesAgentTools('So sánh pin và tốc độ VF 7 với VF 8')).resolves.toEqual({
      calls: [{ name: 'compare_vehicles', arguments: { productIds: ['vf7', 'vf8'] } }],
    })
  })

  it('does not choose comparison vehicles when the request is ambiguous', async () => {
    await expect(planSalesAgentTools('So sánh pin và tốc độ')).resolves.toEqual({ calls: [] })
  })

  it('keeps raw href outside the plan and creates an entity navigation intent', async () => {
    mocks.resolveVehicles.mockResolvedValue([{ id: 'vf8', name: 'VF 8', productType: 'CAR' }])
    const plan = await planSalesAgentTools('Gửi tôi đường dẫn xem sản phẩm VF 8')
    expect(plan.navigationIntent).toEqual({ actionKey: 'VIEW_PRODUCT', entityId: 'vf8', entityType: 'CAR' })
    expect(JSON.stringify(plan)).not.toContain('/cars/')
  })
})
