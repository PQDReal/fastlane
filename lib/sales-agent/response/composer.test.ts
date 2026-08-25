import { describe, expect, it } from 'vitest'
import { EvidenceLedger } from '../orchestrator/ledgers/evidence'
import { KnownEntityLedger } from '../orchestrator/ledgers/known-entities'
import { composeTurnResponse } from './composer'
import { validateResponsePlan } from './plan-validator'

describe('Canonical Response Composer', () => {
  it('validates response plan and keeps valid fact pointers', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()

    evidence.recordEvidence([
      {
        evidenceId: 'ev-1',
        source: { system: 'SUPABASE', resource: 'products' },
        entity: { kind: 'PRODUCT', id: 'vf8-id' },
        facts: [
          { factRef: 'fact-price-vf8', factPath: 'pricing.from', valueHash: '1090000000' },
        ],
        readAt,
      },
    ])
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8')

    const rawPlan = {
      schemaVersion: '2.0',
      outcome: 'ANSWER',
      narrative: [
        {
          kind: 'FASTLANE_FACT',
          presentationKey: 'FACT_SENTENCE',
          facts: [
            {
              factRef: 'fact-price-vf8',
              evidenceId: 'ev-1',
              entityKind: 'PRODUCT',
              entityId: 'vf8-id',
              factPath: 'pricing.from',
            },
          ],
        },
        {
          kind: 'ADVICE',
          markdown: 'VF 8 là dòng xe SUV điện mạnh mẽ.',
        },
      ],
      views: [],
      suggestionIntents: [],
      actionIntents: [],
    }

    const { valid, plan, warnings } = validateResponsePlan(rawPlan, evidence, knownEntities)
    expect(valid).toBe(true)
    expect(warnings.length).toBe(0)
    expect(plan.narrative.length).toBe(2)
  })

  it('filters out forged fact pointers and logs warnings', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()

    const rawPlan = {
      schemaVersion: '2.0',
      outcome: 'ANSWER',
      narrative: [
        {
          kind: 'FASTLANE_FACT',
          presentationKey: 'FACT_SENTENCE',
          facts: [
            {
              factRef: 'fact-forged',
              evidenceId: 'ev-nonexistent',
              entityKind: 'PRODUCT',
              entityId: 'vf8-id',
              factPath: 'pricing.from',
            },
          ],
        },
        {
          kind: 'ADVICE',
          markdown: 'Lời khuyên tham khảo.',
        },
      ],
      views: [],
      suggestionIntents: [],
      actionIntents: [],
    }

    const { valid, plan, warnings } = validateResponsePlan(rawPlan, evidence, knownEntities)
    expect(valid).toBe(false)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].code).toBe('INVALID_FACT_POINTER')
  })

  it('composes TurnViewModel with blocks, actions and suggestions', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8')

    const rawPlan = {
      schemaVersion: '2.0',
      outcome: 'ANSWER',
      narrative: [
        {
          kind: 'ADVICE',
          markdown: 'Giá xe VinFast VF 8 hiện tại từ 1.090.000.000 VNĐ.',
        },
      ],
      views: [],
      suggestionIntents: [
        { text: 'Tìm hiểu thông số pin VF 8' },
      ],
      actionIntents: [
        { actionKey: 'OPEN_COMPARE' },
      ],
    }

    const response = composeTurnResponse({
      rawPlan,
      evidence,
      knownEntities,
      conversationRef: 'conv-123',
      turnId: 'turn-456',
      messageId: 'msg-789',
    })

    expect(response.schemaVersion).toBe('2.0')
    expect(response.answer.markdown).toContain('Giá xe VinFast VF 8')
    expect(response.answer.completeness).toBe('COMPLETE')
    expect(response.blocks.length).toBe(1)
    expect(response.blocks[0].kind).toBe('PRODUCT_LIST')
    expect(response.actions.length).toBe(1)
    expect(response.actions[0].actionKey).toBe('OPEN_COMPARE')
    expect(response.suggestions.length).toBe(1)
    expect(response.suggestions[0].label).toBe('Tìm hiểu thông số pin VF 8')
  })

  it('omits product cards during clarification turns and provides comparison pair chips', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    knownEntities.addEntity('PRODUCT', 'amio-id', 'Amio S', 'BROWSE', 'BIKE')

    const rawPlan = {
      schemaVersion: '2.0',
      outcome: 'NEEDS_INPUT',
      narrative: [
        {
          kind: 'ADVICE',
          markdown: 'Bạn muốn so sánh pin và tốc độ của những mẫu nào? Ví dụ: VF 3 vs VF 5, VF 8 vs VF 9...',
        },
      ],
      views: [],
      suggestionIntents: [],
      actionIntents: [],
    }

    const response = composeTurnResponse({
      rawPlan,
      evidence,
      knownEntities,
      conversationRef: 'conv-123',
      turnId: 'turn-456',
      messageId: 'msg-789',
    })

    // During clarification, no unprompted card dump!
    expect(response.blocks.length).toBe(0)
    // Suggestion chips should offer quick comparison pairs
    expect(response.suggestions.length).toBeGreaterThanOrEqual(3)
    expect(response.suggestions.some((s) => s.label.includes('VF 8 vs VF 9'))).toBe(true)
  })

  it('propagates a link-only data boundary without changing answer composition', () => {
    const evidence = new EvidenceLedger()
    const readAt = new Date().toISOString()
    evidence.recordToolResult('call-link-only', {
      schemaVersion: '2.0',
      toolCallId: 'call-link-only',
      tool: 'search_user_manuals',
      readAt,
      evidence: [],
      observation: {
        observationId: 'obs-link-only',
        toolCallId: 'call-link-only',
        outcome: 'SUCCESS',
        issueCodes: ['OFFICIAL_DOCUMENT_LINK_ONLY'],
        inputHash: '{}',
        readAt,
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'PARTIAL',
      data: { officialDocuments: [] },
    })

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'PDF chính thức hiện ở mức liên kết.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-link-only',
      turnId: 'turn-link-only',
      messageId: 'msg-link-only',
    })

    expect(response.answer.markdown).toBe('PDF chính thức hiện ở mức liên kết.')
    expect(response.answer.completeness).toBe('PARTIAL')
  })
})
