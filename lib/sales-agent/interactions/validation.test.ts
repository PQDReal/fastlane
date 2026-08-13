import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ snapshots: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../catalog/context', () => ({ getSalesAgentVehicleSnapshots: mocks.snapshots }))

import { validateSalesAgentInteractionProducts, SalesAgentInteractionValidationError } from './validation'

const payload = {
  schemaVersion: '1.0' as const,
  interactionId: 'interaction-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  slot: 'vehicle' as const,
  mode: 'single' as const,
  productType: 'BIKE' as const,
  minSelections: 1,
  maxSelections: 1,
  allowFreeText: false,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  options: { bike: { label: 'Evo Grand', value: 'bike-id', kind: 'product' as const } },
}

describe('sales agent interaction product validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('revalidates active products and their bound type', async () => {
    mocks.snapshots.mockResolvedValue([{ productId: 'bike-id', productType: 'BIKE' }])
    await expect(validateSalesAgentInteractionProducts(payload, [{ value: 'bike-id', kind: 'product' }])).resolves.toBeUndefined()
    expect(mocks.snapshots).toHaveBeenCalledWith(['bike-id'])
  })

  it('rejects a stale or inactive product', async () => {
    mocks.snapshots.mockResolvedValue([])
    await expect(validateSalesAgentInteractionProducts(payload, [{ value: 'bike-id', kind: 'product' }])).rejects.toBeInstanceOf(SalesAgentInteractionValidationError)
  })

  it('rejects a product returned with the wrong type', async () => {
    mocks.snapshots.mockResolvedValue([{ productId: 'bike-id', productType: 'CAR' }])
    await expect(validateSalesAgentInteractionProducts(payload, [{ value: 'bike-id', kind: 'product' }])).rejects.toThrow('không cùng loại')
  })

  it('does not query the catalog for allowlist-only selections', async () => {
    await expect(validateSalesAgentInteractionProducts(payload, [{ value: 'price', kind: 'allowlist' }])).resolves.toBeUndefined()
    expect(mocks.snapshots).not.toHaveBeenCalled()
  })
})
