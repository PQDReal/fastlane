import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../catalog/context', () => ({ searchSalesAgentCatalog: mocks.search }))

import { searchSalesAgentInteraction } from './search'
import { signSalesAgentInteractionToken, verifySalesAgentInteractionToken } from './token'

const payload = {
  schemaVersion: '1.0' as const,
  interactionId: 'interaction-search',
  conversationId: 'conversation-search',
  messageId: 'message-search',
  slot: 'vehicle' as const,
  mode: 'single' as const,
  productType: 'BIKE' as const,
  minSelections: 1,
  maxSelections: 1,
  allowFreeText: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  options: { old: { label: 'VF 0', value: 'old-id', kind: 'product' as const } },
}

describe('sales agent interaction search', () => {
  beforeEach(() => {
    process.env.SALES_AGENT_INTERACTION_SECRET = 'test-search-secret'
    mocks.search.mockResolvedValue([
      { id: 'bike-evo-grand', name: 'VinFast Evo Grand', price: 22000000, isActive: true },
      { id: 'bike-feliz', name: 'VinFast Feliz S', price: 30000000, isActive: true },
    ])
  })

  it('binds query search to the signed product type and rotates the option token', async () => {
    const result = await searchSalesAgentInteraction({ continuationToken: signSalesAgentInteractionToken(payload), conversationId: 'conversation-search', query: 'EvoGrand' })

    expect(mocks.search).toHaveBeenCalledWith({ query: 'EvoGrand', productTypes: ['BIKE'], limit: 4 })
    expect(result.options.map((option) => option.label)).toEqual(['VinFast Evo Grand', 'VinFast Feliz S'])
    expect(verifySalesAgentInteractionToken(result.continuationToken).options).toMatchObject({ [result.options[0].optionId]: { value: 'bike-evo-grand', kind: 'product' } })
  })

  it('keeps selected old options while bounding the rotated token', async () => {
    const result = await searchSalesAgentInteraction({ continuationToken: signSalesAgentInteractionToken(payload), conversationId: 'conversation-search', query: 'Feliz', selectedOptionIds: ['old'] })
    const rotated = verifySalesAgentInteractionToken(result.continuationToken)
    expect(result.options.some((option) => option.optionId === 'old')).toBe(true)
    expect(Object.keys(rotated.options)).toHaveLength(3)
    expect(Object.keys(rotated.options)).toContain('old')
  })

  it('rejects a token from another conversation', async () => {
    await expect(searchSalesAgentInteraction({ continuationToken: signSalesAgentInteractionToken(payload), conversationId: 'other', query: 'Evo' })).rejects.toThrow('không thuộc')
  })
})
