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
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8', 'BROWSE', 'CAR', {
      slug: 'vf-8',
      thumbnailUrl: '/images/products/vf8.png',
    })

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
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8', 'BROWSE', 'CAR', {
      slug: 'vf-8',
      thumbnailUrl: '/images/products/vf8.png',
    })

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
        { text: 'Tìm hiểu thông số pin VF 8', payload: 'Pin VF 8 có dung lượng và thời gian sạc thế nào?' },
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
    if (response.blocks[0].kind === 'PRODUCT_LIST') {
      expect(response.blocks[0].items[0].thumbnailUrl).toBe('/images/products/vf8.png')
    }
    expect(response.actions.length).toBe(1)
    expect(response.actions[0].actionKey).toBe('OPEN_COMPARE')
    expect(response.suggestions.length).toBe(1)
    expect(response.suggestions[0].label).toBe('Tìm hiểu thông số pin VF 8')
    expect(response.suggestions[0].payload).toBe('Pin VF 8 có dung lượng và thời gian sạc thế nào?')
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

  it('keeps the verified after-sales route from develop', () => {
    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{
          kind: 'ADVICE',
          markdown: '[Dịch vụ hậu mãi](/after-sales) và [trang lạ](/unknown-service).',
        }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence: new EvidenceLedger(),
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-after-sales',
      turnId: 'turn-after-sales',
      messageId: 'msg-after-sales',
    })

    expect(response.answer.markdown).toContain('[Dịch vụ hậu mãi](/after-sales)')
    expect(response.answer.markdown).not.toContain('/unknown-service')
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
    // The clarification form is the only next action; no unrelated chips.
    expect(response.suggestions).toEqual([])
  })

  it('builds ambient chips from the current catalog slice instead of a fixed model pair', () => {
    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'Bạn có thể xem danh mục xe hiện hành.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence: new EvidenceLedger(),
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-catalog-suggestions',
      turnId: 'turn-catalog-suggestions',
      messageId: 'msg-catalog-suggestions',
      catalogProductNames: ['VinFast VF 3', 'VinFast VF 6', 'VinFast Feliz S'],
    })

    expect(response.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Giá VinFast VF 3',
      'So sánh VinFast VF 3 và VinFast VF 6',
      'Thông số VinFast Feliz S',
    ])
    expect(response.suggestions).toHaveLength(3)
  })

  it('uses verified RAG scope for product navigation and contextual suggestions', () => {
    const evidence = new EvidenceLedger()
    const readAt = new Date().toISOString()
    evidence.recordToolResult('call-vf5-guide', {
      schemaVersion: '2.0',
      toolCallId: 'call-vf5-guide',
      tool: 'search_knowledge',
      readAt,
      dataAsOf: readAt,
      evidence: [{
        evidenceId: 'ev-vf5-guide',
        source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
        entity: { kind: 'KNOWLEDGE_SNIPPET', id: 'chunk-vf5-guide' },
        facts: [
          { factRef: 'fact-kb-title-vf5', factPath: 'title', valueHash: 'Hướng dẫn VF 5' },
          { factRef: 'fact-kb-section-vf5', factPath: 'section', valueHash: 'Sử dụng xe' },
        ],
        readAt,
      }],
      observation: {
        observationId: 'obs-vf5-guide',
        toolCallId: 'call-vf5-guide',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt,
      },
      issues: [],
      appliedBindings: [],
      diagnostics: { scope: { vehicleModel: 'VF 5', modelYear: 2024, catalogStatus: 'READY' } },
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: { snippets: [] },
    })

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{
          kind: 'ADVICE',
          markdown: 'Xem [VinFast VF 5](http://localhost:3000/cars/link-tu-model) để biết thêm.',
        }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-vf5-guide',
      turnId: 'turn-vf5-guide',
      messageId: 'msg-vf5-guide',
      catalogProducts: [
        { id: 'vf3-id', name: 'VinFast VF 3', productType: 'CAR', slug: 'vinfast-vf-3' },
        { id: 'vf5-id', name: 'VinFast VF 5 Plus', productType: 'CAR', slug: 'vinfast-vf-5' },
      ],
      catalogStatus: 'SYNCED',
    })

    expect(response.answer.markdown).toContain('[VinFast VF 5](/cars/vf-5)')
    expect(response.answer.markdown).toContain('[Dịch vụ hậu mãi](/after-sales)')
    expect(response.answer.markdown).not.toContain('localhost:3000')
    expect(response.answer.markdown).not.toContain('/user-manual')
    expect(response.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'Thông số VinFast VF 5 Plus',
      'Dự toán trả góp VinFast VF 5 Plus',
      'Đặt lịch lái thử VinFast VF 5 Plus',
    ])
  })

  it('surfaces a canonical warning when general retrieval ran without a scope catalog', () => {
    const evidence = new EvidenceLedger()
    const readAt = new Date().toISOString()
    evidence.recordToolResult('call-scope-warning', {
      schemaVersion: '2.0',
      toolCallId: 'call-scope-warning',
      tool: 'search_knowledge',
      readAt,
      dataAsOf: readAt,
      evidence: [],
      observation: {
        observationId: 'obs-scope-warning',
        toolCallId: 'call-scope-warning',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt,
      },
      issues: [],
      appliedBindings: [],
      diagnostics: { retrieval: { scopePreflightStatus: 'UNAVAILABLE' } },
      outcome: 'SUCCESS',
      completeness: 'PARTIAL',
      data: { snippets: [] },
    })

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'Kết quả chung theo tài liệu hiện có.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-scope-warning',
      turnId: 'turn-scope-warning',
      messageId: 'msg-scope-warning',
    })

    expect(response.grounding.warnings).toContainEqual(expect.objectContaining({ code: 'SCOPE_CATALOG_UNAVAILABLE' }))
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

  it('materializes only approved media explicitly referenced by the answer', () => {
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
      diagramLabels: [
        { marker: '1', description: 'Nút mở cửa khẩn cấp ở tay vịn cửa' },
        { marker: '2', description: 'Nắp che cơ cấu mở cửa' },
      ],
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
        narrative: [{
          kind: 'ADVICE',
          markdown: 'Đây là vị trí mở cửa khẩn cấp theo sổ tay.\n\n1. Mở cửa.\n2. Kéo tay vịn.\n\n[media:1]',
        }],
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
      expect(mediaBlock.items[0].reference).toBe('media:1')
      expect(mediaBlock.items[0].url).toBe(pointer.url)
      expect(mediaBlock.items[0].diagramLabels).toEqual(pointer.diagramLabels)
    }
    expect(response.answer.markdown).toContain('[media:1]')
    expect(response.answer.markdown).not.toContain(pointer.url)
    expect(response.answer.markdown).not.toContain('Chú giải —')
    expect(response.answer.markdown).not.toContain('Nắp che cơ cấu mở cửa')
  })

  it('keeps unreferenced knowledge media out of the customer-facing response', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()
    const pointer = {
      assetId: 'asset-unused',
      annotationId: 'annotation-unused',
      title: 'Ảnh cài đặt của mẫu xe khác',
      summary: 'Ảnh không được dùng trong câu trả lời.',
      alt: 'Ảnh cài đặt',
      url: 'https://om.vinfastauto.com/assets/unused-settings.png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      safetyCritical: false,
      citationId: 'cite:vinfast:other-model:settings',
      diagramLabels: [],
    }
    evidence.recordEvidence([{
      evidenceId: 'ev-kb-media-unused',
      source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
      entity: { kind: 'KNOWLEDGE_SNIPPET', id: 'chunk-media-unused' },
      facts: [
        { factRef: 'fact-kb-title-chunk-media-unused', factPath: 'title', valueHash: 'Sổ tay mẫu khác' },
        { factRef: 'fact-kb-section-chunk-media-unused', factPath: 'section', valueHash: 'Cài đặt' },
        { factRef: 'fact-kb-citation-chunk-media-unused', factPath: 'citationId', valueHash: pointer.citationId },
        { factRef: 'fact-kb-media-unused', factPath: 'mediaPointer', valueHash: JSON.stringify(pointer) },
      ],
      readAt,
    }])

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'Bạn mở Cài đặt rồi chọn Wi-Fi.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities,
      conversationRef: 'conv-no-media',
      turnId: 'turn-no-media',
      messageId: 'msg-no-media',
    })

    expect(response.answer.markdown).not.toContain(pointer.url)
    expect(response.blocks.some((block) => block.kind === 'KNOWLEDGE_MEDIA')).toBe(false)
  })

  it('renders canonical compare_products rows instead of fabricated criteria', () => {
    const evidence = new EvidenceLedger()
    const knownEntities = new KnownEntityLedger()
    const readAt = new Date().toISOString()
    knownEntities.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8', 'DETAILS', 'CAR', { slug: 'vf-8' })
    knownEntities.addEntity('PRODUCT', 'vf9-id', 'VinFast VF 9', 'DETAILS', 'CAR', { slug: 'vf-9' })
    evidence.recordToolResult('call-compare', {
      schemaVersion: '2.0',
      toolCallId: 'call-compare',
      tool: 'compare_products',
      readAt,
      dataAsOf: readAt,
      evidence: [],
      observation: {
        observationId: 'obs-compare',
        toolCallId: 'call-compare',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt,
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: {
        products: [
          { productId: 'vf8-id', name: 'VinFast VF 8', productType: 'CAR', slug: 'vf-8', thumbnailUrl: null, url: '/cars/vf-8', price: 1_000_000_000 },
          { productId: 'vf9-id', name: 'VinFast VF 9', productType: 'CAR', slug: 'vf-9', thumbnailUrl: null, url: '/cars/vf-9', price: 1_500_000_000 },
        ],
        rows: [
          {
            criterion: 'price',
            label: 'Giá khởi điểm',
            values: [
              { productId: 'vf8-id', productName: 'VinFast VF 8', value: '1.000.000.000 VNĐ', factRef: 'price-vf8' },
              { productId: 'vf9-id', productName: 'VinFast VF 9', value: '1.500.000.000 VNĐ', factRef: 'price-vf9' },
            ],
          },
          {
            criterion: 'top_speed_kmh',
            label: 'Tốc độ tối đa',
            values: [
              { productId: 'vf8-id', productName: 'VinFast VF 8', value: '200 km/h', factRef: 'speed-vf8' },
              { productId: 'vf9-id', productName: 'VinFast VF 9', value: '200 km/h', factRef: 'speed-vf9' },
            ],
          },
        ],
        highlights: [],
      },
    })

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'So sánh nhanh VF 8 và VF 9.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities,
      conversationRef: 'conv-compare',
      turnId: 'turn-compare',
      messageId: 'msg-compare',
    })

    const comparison = response.blocks.find((block) => block.kind === 'COMPARISON_TABLE')
    expect(comparison?.kind).toBe('COMPARISON_TABLE')
    if (comparison?.kind === 'COMPARISON_TABLE') {
      expect(comparison.criteria).toEqual(['Giá khởi điểm', 'Tốc độ tối đa'])
      expect(comparison.criteria).not.toContain('Dung lượng pin')
      expect(comparison.products[0].values['Tốc độ tối đa']).toBe('200 km/h')
    }
  })
})
