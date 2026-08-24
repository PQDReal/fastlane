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

  it('rewrites guessed product links to catalog URLs and removes unknown routes', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    knownEntities.addEntity('PRODUCT', 'vf3-id', 'VinFast VF 3', 'BROWSE', 'CAR', {
      slug: 'vf-3-canonical',
    })

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{
          kind: 'ADVICE',
          markdown: '[VinFast VF 3](/cars/url-tu-bia) và [trang không tồn tại](/financing).',
        }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities,
      conversationRef: 'conv-links',
      turnId: 'turn-links',
      messageId: 'msg-links',
    })

    expect(response.answer.markdown).toContain('[VinFast VF 3](/cars/vf-3-canonical)')
    expect(response.answer.markdown).toContain('trang không tồn tại')
    expect(response.answer.markdown).not.toContain('/cars/url-tu-bia')
    expect(response.answer.markdown).not.toContain('/financing')
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

  it('keeps knowledge citations when the same answer also contains product cards', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8', 'BROWSE', 'CAR')
    evidence.recordEvidence([
      {
        evidenceId: 'ev-kb-1',
        source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
        entity: { kind: 'KNOWLEDGE_SNIPPET', id: 'chunk-1' },
        facts: [
          { factRef: 'fact-kb-title-chunk-1', factPath: 'title', valueHash: 'Sổ tay VF 8' },
          { factRef: 'fact-kb-section-chunk-1', factPath: 'section', valueHash: 'Bảo hành pin' },
          { factRef: 'fact-kb-citation-chunk-1', factPath: 'citationId', valueHash: 'cite:vinfast:VF8:2025:vi-VN:v1:bao_hanh_pin' },
        ],
        readAt,
      },
    ])

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'Thông tin VF 8 theo cẩm nang.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities,
      conversationRef: 'conv-123',
      turnId: 'turn-456',
      messageId: 'msg-789',
    })

    expect(response.blocks.some((block) => block.kind === 'PRODUCT_LIST')).toBe(true)
    const citationBlock = response.blocks.find((block) => block.kind === 'FACT_SUMMARY')
    expect(citationBlock?.kind).toBe('FACT_SUMMARY')
    if (citationBlock?.kind === 'FACT_SUMMARY') {
      expect(citationBlock.facts[0].citationId).toContain('cite:vinfast:VF8')
    }
  })

  it('materializes deduplicated approved media pointers with their source citation', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()
    const pointer = {
      assetId: 'asset-1',
      annotationId: 'annotation-approved-1',
      title: 'Vị trí nút mở cửa khẩn cấp',
      summary: 'Sơ đồ chỉ vị trí nút mở cửa khẩn cấp trên xe.',
      alt: 'Vị trí nút mở cửa khẩn cấp — DIAGRAM',
      url: 'https://om.vinfastauto.com/assets/emergency-door.png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      safetyCritical: true,
      citationId: 'cite:vinfast:VF8:2025:vi-VN:v1:emergency_door',
    }
    evidence.recordEvidence([{
      evidenceId: 'ev-kb-media-1',
      source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
      entity: { kind: 'KNOWLEDGE_SNIPPET', id: 'chunk-media-1' },
      facts: [
        { factRef: 'fact-kb-title-chunk-media-1', factPath: 'title', valueHash: 'Sổ tay VF 8' },
        { factRef: 'fact-kb-section-chunk-media-1', factPath: 'section', valueHash: 'Thoát hiểm' },
        { factRef: 'fact-kb-citation-chunk-media-1', factPath: 'citationId', valueHash: pointer.citationId },
        { factRef: 'fact-kb-media-chunk-media-1-asset-1', factPath: 'mediaPointer', valueHash: JSON.stringify(pointer) },
        { factRef: 'fact-kb-media-chunk-media-1-asset-1-duplicate', factPath: 'mediaPointer', valueHash: JSON.stringify(pointer) },
      ],
      readAt,
    }])

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'Đây là vị trí mở cửa khẩn cấp theo sổ tay.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities,
      conversationRef: 'conv-media',
      turnId: 'turn-media',
      messageId: 'msg-media',
    })

    const mediaBlock = response.blocks.find((block) => block.kind === 'KNOWLEDGE_MEDIA')
    expect(mediaBlock?.kind).toBe('KNOWLEDGE_MEDIA')
    if (mediaBlock?.kind === 'KNOWLEDGE_MEDIA') {
      expect(mediaBlock.items).toHaveLength(1)
      expect(mediaBlock.items[0].annotationId).toBe('annotation-approved-1')
      expect(mediaBlock.items[0].citationId).toBe(pointer.citationId)
      expect(mediaBlock.items[0].safetyCritical).toBe(true)
    }
  })
})
