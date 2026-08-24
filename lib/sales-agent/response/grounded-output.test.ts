import { describe, expect, it } from 'vitest'

import type { ToolObservationRef } from '../contracts'
import {
  appendCanonicalManualReference,
  buildDeterministicToolMarkdown,
  buildNoEvidenceMarkdown,
  extractEmbeddedSuggestions,
} from './grounded-output'

describe('grounded model output', () => {
  it('extracts canonical object suggestions without leaking JSON into markdown', () => {
    const result = extractEmbeddedSuggestions(`Thông tin đã được xác minh.\n\n[{"label":"Xem lịch bảo dưỡng","intent":"Lịch bảo dưỡng VF 8"}]`)

    expect(result.markdown).toBe('Thông tin đã được xác minh.')
    expect(result.suggestions).toEqual([
      { text: 'Xem lịch bảo dưỡng', payload: 'Lịch bảo dưỡng VF 8' },
    ])
  })

  it('accepts the observed suggestionIntents string-array variant', () => {
    const result = extractEmbeddedSuggestions('Câu trả lời.\n\nsuggestionIntents: ["Xem HDSD", "Tìm xưởng dịch vụ"]')

    expect(result.markdown).toBe('Câu trả lời.')
    expect(result.suggestions.map((item) => item.text)).toEqual(['Xem HDSD', 'Tìm xưởng dịch vụ'])
  })

  it('does not strip a normal bracket expression from prose', () => {
    const input = 'Áp suất khuyến nghị nằm trong khoảng [2, 3] bar.'
    expect(extractEmbeddedSuggestions(input)).toEqual({ markdown: input, suggestions: [] })
  })

  it('replaces an LLM manual route with the evidence-derived route', () => {
    const markdown = appendCanonicalManualReference(
      'Xem thêm [Hướng dẫn](/user-manual/sai/route).',
      [
        {
          factRef: 'fact-manual-articleId-chunk-1',
          evidenceId: 'ev-1',
          entityKind: 'KNOWLEDGE_SNIPPET',
          entityId: 'chunk-1',
          factPath: 'article_id',
          valueHash: '1150069',
        },
        {
          factRef: 'fact-manual-modelId-chunk-1',
          evidenceId: 'ev-1',
          entityKind: 'KNOWLEDGE_SNIPPET',
          entityId: 'chunk-1',
          factPath: 'model_id',
          valueHash: 'VF 8_2024',
        },
      ],
    )

    expect(markdown).not.toContain('/user-manual/sai/route')
    expect(markdown).toContain('/user-manual/VF%208_2024/1150069')
  })

  it('returns a non-speculative manual response when evidence is unavailable', () => {
    const observation: ToolObservationRef = {
      observationId: 'obs-1',
      toolCallId: 'call-1',
      outcome: 'UNAVAILABLE',
      issueCodes: ['RESOURCE_UNAVAILABLE'],
      inputHash: '{}',
      readAt: new Date().toISOString(),
    }
    const markdown = buildNoEvidenceMarkdown(new Set(['search_user_manuals']), [observation])

    expect(markdown).toContain('nguồn dữ liệu tạm thời chưa phản hồi')
    expect(markdown).toContain('sẽ không suy đoán')
  })

  it('renders approved after-sales groups even when the model returns no prose', () => {
    const markdown = buildDeterministicToolMarkdown([{
      schemaVersion: '2.0',
      toolCallId: 'call-maintenance',
      tool: 'search_after_sales',
      readAt: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-maintenance',
        toolCallId: 'call-maintenance',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: {
        groups: [{ summary: 'Bảo dưỡng xe điện: 12.000 km hoặc hàng năm.' }],
        route: '/after-sales?vehicle=car&tab=maintenance#maintenance-schedule',
      },
    }])

    expect(markdown).toContain('12.000 km hoặc hàng năm')
    expect(markdown).toContain('/after-sales?vehicle=car&tab=maintenance#maintenance-schedule')
  })

  it('renders every returned service location with total count and hours', () => {
    const markdown = buildDeterministicToolMarkdown([{
      schemaVersion: '2.0',
      toolCallId: 'call-workshops',
      tool: 'find_service_locations',
      readAt: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-workshops',
        toolCallId: 'call-workshops',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: {
        totalMatches: 5,
        hasMore: false,
        route: '/after-sales?vehicle=motorbike&tab=workshop',
        locations: [{
          name: 'VinFast Thảo Điền',
          address: { fullAddress: 'TP. Hồ Chí Minh' },
          operatingHours: { opensAt: '08h00', closesAt: '21h00' },
        }],
      },
    }])

    expect(markdown).toContain('5 xưởng dịch vụ')
    expect(markdown).toContain('08h00–21h00')
    expect(markdown).toContain('/after-sales?vehicle=motorbike&tab=workshop')
  })
})
