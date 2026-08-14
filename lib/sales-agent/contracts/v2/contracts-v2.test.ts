import { describe, expect, it } from 'vitest'
import {
  browseCatalogInputSchema,
  resolveCatalogEntitiesInputSchema,
  createSalesAgentTurnRequestV2Schema,
  agentResponsePlanV2Schema,
  turnViewModelV2Schema,
  TOOL_CONTRACTS,
} from './index'

describe('Contracts V2 validation', () => {
  it('validates browse_catalog input and rejects query parameter', () => {
    const valid = browseCatalogInputSchema.safeParse({
      productTypes: ['CAR'],
      price: { currency: 'VND', min: 500000000, max: 1000000000 },
      sort: { field: 'PRICE', direction: 'ASC' },
      page: { limit: 10 },
    })
    expect(valid.success).toBe(true)

    // Ensure browse schema does not accept free-form query
    const parsed = browseCatalogInputSchema.parse({
      productTypes: ['CAR'],
      query: 'some text',
    } as any)
    expect((parsed as any).query).toBeUndefined()
  })

  it('validates resolve_catalog_entities input', () => {
    const valid = resolveCatalogEntitiesInputSchema.safeParse({
      references: [
        { clientRef: 'ref-1', mention: 'VF 8', kindHint: 'PRODUCT' },
        { clientRef: 'ref-2', mention: 'Klara S', kindHint: 'PRODUCT' },
      ],
      candidateLimit: 3,
    })
    expect(valid.success).toBe(true)
  })

  it('validates create turn request for USER_MESSAGE', () => {
    const valid = createSalesAgentTurnRequestV2Schema.safeParse({
      schemaVersion: '2.0',
      clientTurnId: 'turn-123',
      conversationRef: 'conv-456',
      input: {
        kind: 'USER_MESSAGE',
        text: 'Giá xe hiện tại',
      },
      locale: 'vi-VN',
    })
    expect(valid.success).toBe(true)
  })

  it('validates AgentResponsePlanV2 with fastlane fact pointer', () => {
    const plan = {
      schemaVersion: '2.0',
      outcome: 'ANSWER',
      narrative: [
        {
          kind: 'FASTLANE_FACT',
          presentationKey: 'FACT_SENTENCE',
          facts: [
            {
              factRef: 'fact-1',
              evidenceId: 'ev-1',
              entityKind: 'PRODUCT',
              entityId: 'vf8-id',
              factPath: 'pricing.from',
            },
          ],
        },
        {
          kind: 'ADVICE',
          markdown: 'VF 8 là dòng SUV điện phân khúc D phù hợp cho gia đình.',
        },
      ],
      views: [
        {
          kind: 'PRODUCT_DETAILS',
          source: {
            toolCallId: 'call-1',
            resultRef: 'res-1',
            projection: 'PRODUCT_DETAILS',
          },
        },
      ],
      suggestionIntents: [
        { text: 'So sánh VF 8 với VF 9' },
      ],
      actionIntents: [
        { actionKey: 'VIEW_PRODUCT', entityId: 'vf8-id' },
      ],
    }
    const valid = agentResponsePlanV2Schema.safeParse(plan)
    expect(valid.success).toBe(true)
  })

  it('contains complete TOOL_CONTRACTS definitions for all data tools', () => {
    expect(TOOL_CONTRACTS.browse_catalog).toBeDefined()
    expect(TOOL_CONTRACTS.resolve_catalog_entities).toBeDefined()
    expect(TOOL_CONTRACTS.get_product_details).toBeDefined()
    expect(TOOL_CONTRACTS.compare_products).toBeDefined()
    expect(TOOL_CONTRACTS.get_current_promotions).toBeDefined()
    expect(TOOL_CONTRACTS.discover_accessories).toBeDefined()
    expect(TOOL_CONTRACTS.search_knowledge).toBeDefined()
  })
})
