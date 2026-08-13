import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModel: vi.fn(),
  executeTool: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('ai', () => ({
  generateText: mocks.generateText,
  isStepCount: vi.fn(() => vi.fn()),
  tool: vi.fn((definition) => definition),
}))
vi.mock('../providers/registry', () => ({ getSalesAgentLanguageModel: mocks.getModel }))
vi.mock('../tools/registry', () => ({ executeSalesAgentTool: mocks.executeTool }))

import { runSalesAgentHarness } from './harness'

const vehicleIds = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
]

function toolResult(tool: string, status: 'OK' | 'AMBIGUOUS' = 'OK') {
  return { tool, schemaVersion: '1.0', status, data: status === 'OK' ? { vehicles: vehicleIds.map((id) => ({ id, name: id })) } : null, readAt: '2026-08-13T00:00:00.000Z', dataAsOf: '2026-08-13T00:00:00.000Z', evidence: [], warnings: [] }
}

describe('sales agent model-native harness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getModel.mockResolvedValue({ model: { modelId: 'fake-model' }, provider: 'openai', modelId: 'fake-model' })
    mocks.executeTool.mockImplementation(async (name: string) => toolResult(name))
  })

  it('keeps resolver and dependent compare calls in separate model steps', async () => {
    mocks.generateText.mockImplementation(async (input: any) => {
      input.prepareStep?.({ stepNumber: 0 })
      const resolved = await input.tools.resolve_vehicle_references.execute({ query: 'VF7 và VF8' }, { abortSignal: new AbortController().signal })
      const blocked = await input.tools.compare_vehicles.execute({ productIds: vehicleIds }, { abortSignal: new AbortController().signal })

      input.prepareStep?.({ stepNumber: 1 })
      const compared = await input.tools.compare_vehicles.execute({ productIds: vehicleIds }, { abortSignal: new AbortController().signal })
      return {
        text: 'Đã so sánh VF7 và VF8.',
        finishReason: 'stop',
        steps: [{}, {}],
        usage: { inputTokens: 10, outputTokens: 20 },
        toolCalls: [],
        toolResults: [resolved, blocked, compared],
      }
    })

    const statuses: string[] = []
    const result = await runSalesAgentHarness({ message: 'VF7 và VF8', onToolStatus: ({ tool, status }) => statuses.push(`${tool}:${status}`) })

    expect(result.toolNames).toEqual(['resolve_vehicle_references', 'compare_vehicles'])
    expect(result.steps).toBe(2)
    expect(statuses).toContain('compare_vehicles:AMBIGUOUS')
    expect(statuses).toContain('compare_vehicles:OK')
    expect(mocks.executeTool).toHaveBeenCalledTimes(2)
  })

  it('deduplicates identical calls and enforces the total tool budget', async () => {
    mocks.generateText.mockImplementation(async (input: any) => {
      for (let step = 0; step < 2; step += 1) {
        input.prepareStep?.({ stepNumber: step })
        for (let index = 0; index < 4; index += 1) {
          await input.tools.search_catalog.execute({ query: `VF ${step}-${index}` }, { abortSignal: new AbortController().signal })
        }
      }
      await input.tools.search_catalog.execute({ query: 'VF 0' }, { abortSignal: new AbortController().signal })
      return { text: 'Đã kiểm tra.', finishReason: 'stop', steps: [{}, {}], usage: {}, toolCalls: [], toolResults: [] }
    })

    const result = await runSalesAgentHarness({ message: 'Tìm xe' })

    expect(result.toolCalls).toBe(8)
    expect(mocks.executeTool).toHaveBeenCalledTimes(8)
  })

  it('does not request an interaction slot that the continuation already filled', async () => {
    mocks.generateText.mockImplementation(async (input: any) => {
      input.prepareStep?.({ stepNumber: 0 })
      const repeatedInteraction = await input.tools.request_user_choice.execute({
        slot: 'vehicles',
        mode: 'multiple',
        minSelections: 2,
        maxSelections: 3,
      })
      const compared = await input.tools.compare_vehicles.execute({ productIds: vehicleIds }, { abortSignal: new AbortController().signal })
      return {
        text: 'Đã so sánh VF7 và VF8.',
        finishReason: 'stop',
        steps: [{}],
        usage: {},
        toolCalls: [],
        toolResults: [repeatedInteraction, compared],
      }
    })

    const result = await runSalesAgentHarness({
      message: 'VF7 và VF8',
      interactionSelection: {
        slot: 'vehicles',
        options: [
          { optionId: 'a', label: 'VF 7', value: vehicleIds[0], kind: 'product' },
          { optionId: 'b', label: 'VF 8', value: vehicleIds[1], kind: 'product' },
        ],
      },
    })

    expect(result.interaction).toBeUndefined()
    expect(result.toolNames).toEqual(['compare_vehicles'])
    expect(mocks.executeTool).toHaveBeenCalledOnce()
  })

  it('falls back to text clarification when structured interactions are disabled', async () => {
    mocks.generateText.mockImplementation(async (input: any) => {
      input.prepareStep?.({ stepNumber: 0 })
      const interactionResult = await input.tools.request_user_choice.execute({
        slot: 'vehicles',
        mode: 'multiple',
        minSelections: 2,
        maxSelections: 3,
      })
      return { text: 'Bạn muốn so sánh hai mẫu xe nào?', finishReason: 'stop', steps: [{}], usage: {}, toolCalls: [], toolResults: [interactionResult] }
    })

    const result = await runSalesAgentHarness({ message: 'So sánh pin và tốc độ', interactionsEnabled: false })

    expect(result.interaction).toBeUndefined()
    expect(result.toolCalls).toBe(0)
    expect(result.text).toContain('hai mẫu xe nào')
  })
})
