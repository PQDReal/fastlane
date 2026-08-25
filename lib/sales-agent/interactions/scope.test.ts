import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { buildSalesAgentScopeInteraction } from './scope'
import { verifySalesAgentInteractionToken, validateSalesAgentInteractionResponse } from './token'
import { validateSalesAgentScopeInteraction } from './validation'

const result = {
  schemaVersion: '2.0' as const,
  toolCallId: 'call-scope',
  tool: 'search_knowledge',
  readAt: new Date().toISOString(),
  evidence: [],
  observation: {
    observationId: 'obs-scope',
    toolCallId: 'call-scope',
    outcome: 'NEEDS_INPUT' as const,
    issueCodes: ['AMBIGUOUS_REFERENCE'],
    inputHash: '{}',
    readAt: new Date().toISOString(),
  },
  issues: [],
  appliedBindings: [],
  outcome: 'NEEDS_INPUT' as const,
  data: {
    kind: 'KNOWLEDGE_SCOPE',
    field: 'vehicleModel' as const,
    question: 'Chọn phạm vi',
    candidates: [],
    matchedScopes: [],
    fields: [
      {
        field: 'vehicleModel' as const,
        label: 'Dòng xe',
        required: true,
        options: [
          { optionId: 'model-vf8', label: 'VF 8', field: 'vehicleModel' as const, value: 'VF 8' },
          { optionId: 'model-vf9', label: 'VF 9', field: 'vehicleModel' as const, value: 'VF 9' },
        ],
      },
      {
        field: 'modelYear' as const,
        label: 'Năm áp dụng',
        required: true,
        dependsOn: 'vehicleModel' as const,
        options: [
          { optionId: 'year-vf8-2025', label: '2025 — VF 8', field: 'modelYear' as const, value: '2025', metadata: { vehicleModel: 'VF 8' } },
          { optionId: 'year-vf8-2026', label: '2026 — VF 8', field: 'modelYear' as const, value: '2026', metadata: { vehicleModel: 'VF 8' } },
          { optionId: 'year-vf9-2026', label: '2026 — VF 9', field: 'modelYear' as const, value: '2026', metadata: { vehicleModel: 'VF 9' } },
        ],
      },
    ],
  },
}

describe('signed scope interaction', () => {
  beforeEach(() => {
    process.env.SALES_AGENT_INTERACTION_SECRET = 'scope-test-secret'
  })

  it('materializes linked fields and signs every field value', () => {
    const interaction = buildSalesAgentScopeInteraction(result as any, { conversationId: 'conversation-scope', messageId: 'message-scope' })!
    expect(interaction.fields).toHaveLength(2)
    const payload = verifySalesAgentInteractionToken(interaction.continuationToken)
    expect(payload.interactionId).toBe(interaction.interactionId)
    expect(payload.options['year-vf8-2026']).toMatchObject({ field: 'modelYear', value: '2026' })
    expect(payload.requiredFields).toEqual(['vehicleModel', 'modelYear'])
  })

  it('materializes an interactive year picker from degraded ambiguity candidates', () => {
    const degradedResult = {
      ...result,
      data: {
        kind: 'KNOWLEDGE_SCOPE',
        field: 'modelYear',
        question: 'Xe của bạn thuộc đời nào?',
        matchedScopes: [],
        fields: [],
        candidates: [2023, 2024, 2025, 2026].map((year) => ({
          vehicleModel: 'VF 5',
          modelYearFrom: year,
          modelYearTo: year,
          label: `VF 5 ${year}`,
        })),
      },
    }

    const interaction = buildSalesAgentScopeInteraction(degradedResult as any, {
      conversationId: 'conversation-degraded-scope',
      messageId: 'message-degraded-scope',
    })!

    expect(interaction).not.toBeNull()
    expect(interaction.fields?.[0].options.map((option) => option.value)).toEqual(['VF 5'])
    expect(interaction.fields?.[1].options.map((option) => option.value)).toEqual(['2023', '2024', '2025', '2026'])
    const payload = verifySalesAgentInteractionToken(interaction.continuationToken)
    expect(payload.options['scope-year-vf-5-2026']).toMatchObject({ field: 'modelYear', value: '2026' })
  })

  it('rejects a missing linked field and accepts a valid pair', () => {
    const interaction = buildSalesAgentScopeInteraction(result as any, { conversationId: 'conversation-scope-2', messageId: 'message-scope-2' })!
    expect(() => validateSalesAgentInteractionResponse({
      interactionId: interaction.interactionId,
      selectedOptionIds: ['model-vf8'],
      continuationToken: interaction.continuationToken,
    }, 'conversation-scope-2')).toThrow()
    const selection = validateSalesAgentInteractionResponse({
      interactionId: interaction.interactionId,
      selectedOptionIds: ['model-vf8', 'year-vf8-2026'],
      continuationToken: interaction.continuationToken,
    }, 'conversation-scope-2')
    const binding = validateSalesAgentScopeInteraction(selection.payload, selection.selectedOptions, {
      status: 'READY',
      entries: [
        { documentId: 'vf8', documentKey: 'vf8', vehicleModel: 'VF 8', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'v8', versionNo: 1 },
      ],
      refreshedAt: Date.now(),
    })
    expect(binding).toMatchObject({ vehicleModel: 'VF 8', modelYear: 2026 })
  })
})
