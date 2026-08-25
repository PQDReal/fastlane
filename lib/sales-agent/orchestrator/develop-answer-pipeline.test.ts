import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  executeDataTool: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('ai', () => ({
  isStepCount: () => () => false,
  tool: (definition: unknown) => definition,
  streamText: mocks.streamText,
}))

vi.mock('../providers/registry', () => ({
  getSalesAgentLanguageModel: vi.fn(async () => ({
    provider: 'openai',
    config: { apiKeyEnv: 'OPENAI_API_KEY' },
    model: { id: 'develop-behavior-model' },
    usedApiKey: 'test-key',
  })),
  getAvailableFallbackLanguageModels: vi.fn(async () => []),
}))

vi.mock('../providers/key-pool', () => ({
  apiKeyPoolManager: {
    parseKeysFromEnv: vi.fn(() => ['test-key']),
    markKeySuccess: vi.fn(),
    markKeyError: vi.fn(),
  },
}))

vi.mock('../providers/ai-sdk', () => ({
  createSalesAgentLanguageModel: vi.fn(),
}))

vi.mock('../prompt/manifest', () => ({
  getSalesAgentSystemPrompt: vi.fn(() => 'develop behavior prompt'),
}))

vi.mock('../tools/definitions', () => ({
  executeDataTool: mocks.executeDataTool,
}))

import { runTurn } from './run-turn'

describe('develop answer pipeline', () => {
  beforeEach(() => {
    mocks.executeDataTool.mockReset()
    mocks.streamText.mockReset()
  })

  it('grounds after-sales first, then lets the model stream a formatted answer with an image', async () => {
    const readAt = new Date().toISOString()
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-after-sales',
      tool: 'search_after_sales',
      readAt,
      evidence: [{
        evidenceId: 'ev-maintenance',
        source: { system: 'SUPABASE', resource: 'after_sales_published_facts' },
        entity: { kind: 'AFTER_SALES_FACT', id: 'maintenance-vf8' },
        facts: [{ factRef: 'fact-maintenance-vf8', factPath: 'interval', valueHash: '12.000 km hoặc hàng năm' }],
        readAt,
      }],
      observation: {
        observationId: 'obs-maintenance',
        toolCallId: 'call-after-sales',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt,
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: { groups: [{ summary: '12.000 km hoặc hàng năm' }] },
    })

    const modelAnswer = [
      '### Lịch bảo dưỡng VF 8',
      '',
      '| Mốc | Thời gian |',
      '|---|---|',
      '| 12.000 km | Hàng năm |',
      '',
      '![Minh họa bảo dưỡng](https://static-cms-prod.vinfastauto.com/maintenance.png)',
      '',
      '[{"label":"Xem lịch chi tiết","intent":"Xem lịch bảo dưỡng VF 8"}]',
    ].join('\n')

    mocks.streamText.mockImplementation((options: any) => ({
      textStream: (async function* () {
        const firstStep = options.prepareStep({ stepNumber: 0 })
        const selectedTool = firstStep.toolChoice.toolName
        await options.tools[selectedTool].execute({ serviceType: 'repair', query: 'khác' })
        yield modelAnswer.slice(0, 48)
        yield modelAnswer.slice(48)
      })(),
      steps: Promise.resolve([{ type: 'tool-result' }, { type: 'text' }]),
      finishReason: Promise.resolve('stop'),
    }))

    const deltas: string[] = []
    const result = await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'VF 8 2024 cần bảo dưỡng định kỳ sau bao lâu?' },
      onTextDelta: (delta) => deltas.push(delta),
    })

    expect(mocks.executeDataTool).toHaveBeenCalledWith(
      'search_after_sales',
      expect.objectContaining({
        serviceType: 'maintenance',
        vehicleType: 'car',
        model: 'VF 8',
        query: 'VF 8 2024 cần bảo dưỡng định kỳ sau bao lâu?',
      }),
      expect.any(String),
    )
    expect(deltas.join('')).toBe(modelAnswer)
    const advice = result.responsePlan.narrative.find((item) => item.kind === 'ADVICE')
    expect(advice?.kind === 'ADVICE' ? advice.markdown : '').toContain('| 12.000 km | Hàng năm |')
    expect(advice?.kind === 'ADVICE' ? advice.markdown : '').toContain('![Minh họa bảo dưỡng]')
    expect(result.responsePlan.suggestionIntents).toEqual([
      { text: 'Xem lịch chi tiết', payload: 'Xem lịch bảo dưỡng VF 8' },
    ])
  })

  it('adds turn-scoped routing for a known link-only PDF without replacing model composition', async () => {
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-official-manual',
      tool: 'search_user_manuals',
      readAt: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-official-manual',
        toolCallId: 'call-official-manual',
        outcome: 'SUCCESS',
        issueCodes: ['OFFICIAL_DOCUMENT_LINK_ONLY'],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'PARTIAL',
      data: { officialDocuments: [{ label: 'HDSD xe Klara S' }] },
    })

    const modelAnswer = 'PDF chính thức chưa được hệ thống trích xuất.'
    mocks.streamText.mockImplementation((options: any) => {
      expect(options.system).toContain('HDSD xe Klara S')
      expect(options.system).toContain('không hỏi lại đời xe')
      return {
        textStream: (async function* () {
          const firstStep = options.prepareStep({ stepNumber: 0 })
          expect(firstStep.toolChoice.toolName).toBe('search_user_manuals')
          await options.tools.search_user_manuals.execute({ query: 'khác' })
          yield modelAnswer
        })(),
        steps: Promise.resolve([{ type: 'tool-result' }, { type: 'text' }]),
        finishReason: Promise.resolve('stop'),
      }
    })

    const result = await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'Hướng dẫn sử dụng xe Klara S' },
    })

    expect(result.text).toBe(modelAnswer)
    expect(mocks.executeDataTool).toHaveBeenCalledWith(
      'search_user_manuals',
      expect.objectContaining({ query: 'Hướng dẫn sử dụng xe Klara S' }),
      expect.any(String),
    )
  })
})
