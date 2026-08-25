import { describe, expect, it } from 'vitest'

import type { ToolResult } from '../contracts'
import { appendRequiredDataCitations } from './canonical-citations'

function successfulResult(tool: ToolResult['tool'], data: unknown): ToolResult {
  const readAt = new Date().toISOString()
  return {
    schemaVersion: '2.0',
    toolCallId: `call-${tool}`,
    tool,
    readAt,
    evidence: [],
    observation: {
      observationId: `obs-${tool}`,
      toolCallId: `call-${tool}`,
      outcome: 'SUCCESS',
      issueCodes: [],
      inputHash: '{}',
      readAt,
    },
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data,
  }
}

describe('required data citations', () => {
  it('appends a missing after-sales anchor without rewriting model markdown', () => {
    const markdown = 'Dạ, xe nên bảo dưỡng sau **12.000 km hoặc 12 tháng**.'
    const result = appendRequiredDataCitations(markdown, [successfulResult('search_after_sales', {
      route: '/after-sales?vehicle=car&tab=maintenance#maintenance-schedule',
    })], {
      afterSalesLookup: { toolName: 'search_after_sales', serviceType: 'maintenance' },
      warrantyKnowledgeLookup: false,
      officialManualLookup: false,
    })

    expect(result.startsWith(markdown)).toBe(true)
    expect(result).toContain('[Xem lịch bảo dưỡng](/after-sales?vehicle=car&tab=maintenance#maintenance-schedule)')
  })

  it('does not duplicate a canonical citation already selected by the model', () => {
    const route = '/after-sales?vehicle=motorbike&tab=warranty#warranty-term'
    const markdown = `[Xem chính sách](${route})`
    const result = appendRequiredDataCitations(markdown, [successfulResult('search_knowledge', {
      snippets: [{ internalUrl: route }],
    })], {
      afterSalesLookup: null,
      warrantyKnowledgeLookup: true,
      officialManualLookup: false,
    })

    expect(result).toBe(markdown)
  })

  it('re-appends a canonical citation when the model emitted an invalid spaced destination', () => {
    const route = '/after-sales?vehicle=motorbike&tab=warranty#warranty-term'
    const markdown = `[Xem chính sách]( ${route} )`
    const result = appendRequiredDataCitations(markdown, [successfulResult('search_knowledge', {
      snippets: [{ internalUrl: route }],
    })], {
      afterSalesLookup: null,
      warrantyKnowledgeLookup: true,
      officialManualLookup: false,
    })

    expect(result).toContain(`[Xem chính sách bảo hành xe máy điện](${route})`)
  })

  it('preserves both the direct official PDF and internal document index', () => {
    const result = appendRequiredDataCitations('FASTLANE có PDF chính thức.', [successfulResult('search_user_manuals', {
      officialDocuments: [{
        label: 'HDSD xe Klara S',
        sourceUrl: 'https://static-cms-prod.vinfastauto.com/klara-s.pdf',
        internalUrl: '/after-sales?vehicle=motorbike&tab=warranty#official-documents',
      }],
    })], {
      afterSalesLookup: null,
      warrantyKnowledgeLookup: false,
      officialManualLookup: true,
    })

    expect(result).toContain('[HDSD xe Klara S](https://static-cms-prod.vinfastauto.com/klara-s.pdf)')
    expect(result).toContain('[Xem danh mục tài liệu chính thức](/after-sales?vehicle=motorbike&tab=warranty#official-documents)')
  })
})
