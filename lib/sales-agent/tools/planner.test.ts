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

  it('combines the current vehicle with a vehicle named in the previous turn', async () => {
    const vf8 = { id: 'vf8', name: 'VF 8', productType: 'CAR' as const }
    const vf7 = { id: 'vf7', name: 'VF 7', productType: 'CAR' as const }
    mocks.resolveVehicles.mockImplementation(async (query: string) => query.includes('VF 8') ? [vf8, vf7] : [vf7])

    await expect(planSalesAgentTools('So sánh với VF 7', [{ role: 'user', content: 'Thông số VF 8' }])).resolves.toEqual({
      calls: [{ name: 'compare_vehicles', arguments: { productIds: ['vf8', 'vf7'] } }],
    })
    expect(mocks.resolveVehicles).toHaveBeenLastCalledWith('Thông số VF 8\nSo sánh với VF 7', 3)
  })

  it('inherits comparison intent for an entity-only follow-up', async () => {
    mocks.resolveVehicles.mockResolvedValue([
      { id: 'vf7', name: 'VF 7', productType: 'CAR' },
      { id: 'vf8', name: 'VF 8', productType: 'CAR' },
    ])

    await expect(planSalesAgentTools('VF7 và VF8', [{ role: 'user', content: 'So sánh pin và tốc độ' }])).resolves.toEqual({
      calls: [{ name: 'compare_vehicles', arguments: { productIds: ['vf7', 'vf8'] } }],
    })
  })

  it('limits generic vehicle recommendations to vehicle product types', async () => {
    await expect(planSalesAgentTools('Tư vấn mẫu xe phù hợp')).resolves.toEqual({
      calls: [{ name: 'search_catalog', arguments: { query: 'Tư vấn mẫu xe phù hợp', productTypes: ['CAR', 'BIKE'], limit: 8 } }],
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
