import { describe, expect, it } from 'vitest'
import {
  browseCatalogInputSchema,
  compareProductsInputSchema,
  createSalesAgentTurnRequestSchema,
  DEFAULT_RUN_BUDGET,
  getAvailableToolContracts,
  getProductDetailsInputSchema,
  searchKnowledgeInputSchema,
  TOOL_CONTRACTS,
  turnViewModelSchema,
} from './index'

describe('Canonical Core Contracts', () => {
  it('validates browseCatalogInputSchema without requiring free-form query', () => {
    const valid = {
      productTypes: ['CAR', 'BIKE'],
      price: { currency: 'VND', min: 100000000, max: 2000000000 },
      sort: { field: 'PRICE', direction: 'ASC' },
      page: { limit: 10 },
    }
    const parsed = browseCatalogInputSchema.safeParse(valid)
    expect(parsed.success).toBe(true)

    // Ensure query is stripped / not accepted
    const invalidQuery = { query: 'gia xe' }
    const res = browseCatalogInputSchema.safeParse(invalidQuery)
    expect(res.success).toBe(true)
    if (res.success) {
      expect((res.data as any).query).toBeUndefined()
    }
  })

  it('validates turn request input schemas', () => {
    const validMessage = {
      clientTurnId: 'turn-123',
      input: {
        kind: 'USER_MESSAGE',
        text: 'Giá xe hiện tại',
      },
    }
    const parsed = createSalesAgentTurnRequestSchema.safeParse(validMessage)
    expect(parsed.success).toBe(true)
  })

  it('validates default run budget constraints', () => {
    expect(DEFAULT_RUN_BUDGET.maxModelSteps).toBe(4)
    expect(DEFAULT_RUN_BUDGET.maxToolCalls).toBe(8)
    expect(DEFAULT_RUN_BUDGET.totalTimeoutMs).toBe(35000)
  })

  it('has valid schemas for all 6 registered runtime data tools', () => {
    expect(Object.keys(TOOL_CONTRACTS).length).toBe(6)
    expect(TOOL_CONTRACTS.browse_catalog).toBeDefined()
    expect(TOOL_CONTRACTS).not.toHaveProperty('resolve_catalog_entities')
    expect(TOOL_CONTRACTS.get_product_details).toBeDefined()
    expect(TOOL_CONTRACTS.compare_products).toBeDefined()
    expect(TOOL_CONTRACTS.get_current_promotions).toBeDefined()
    expect(TOOL_CONTRACTS.discover_accessories).toBeDefined()
    expect(TOOL_CONTRACTS.search_knowledge).toBeDefined()
  })

  it('lets detail and comparison tools accept product names directly', () => {
    expect(getProductDetailsInputSchema.safeParse({ productMentions: ['VF 9'] }).success).toBe(true)
    expect(compareProductsInputSchema.safeParse({ productMentions: ['VF 8', 'VF 9'] }).success).toBe(true)
    expect(compareProductsInputSchema.safeParse({ productMentions: ['VF 9'] }).success).toBe(false)
  })

  it('supports explicit vehicle scope for knowledge retrieval', () => {
    const parsed = searchKnowledgeInputSchema.safeParse({
      query: 'Cách kết nối Wi-Fi',
      vehicleModel: 'VF 9',
      modelYear: 2026,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.topK).toBe(5)
    }
  })

  it('keeps Knowledge RAG out of the model toolset until explicitly enabled', () => {
    expect(getAvailableToolContracts(false).search_knowledge).toBeUndefined()
    expect(getAvailableToolContracts(false).browse_catalog).toBeDefined()
    expect(getAvailableToolContracts(true).search_knowledge).toBeDefined()
  })

  it('validates turn view model structure', () => {
    const validViewModel = {
      schemaVersion: '2.0',
      conversationRef: 'conv-123',
      turnId: 'turn-456',
      messageId: 'msg-789',
      answer: {
        markdown: 'Bảng giá xe VinFast hiện tại.',
        completeness: 'COMPLETE',
      },
      blocks: [],
      actions: [],
      suggestions: [],
      grounding: {
        dataAsOf: new Date().toISOString(),
        warnings: [],
      },
    }
    const res = turnViewModelSchema.safeParse(validViewModel)
    expect(res.success).toBe(true)
  })
})
