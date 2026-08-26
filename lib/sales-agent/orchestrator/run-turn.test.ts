import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  executeDataTool: vi.fn(),
  isKnowledgeEnabled: vi.fn(),
  markKeySuccess: vi.fn(),
  markKeyError: vi.fn(),
  recordSalesAgentDebugEvent: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('ai', () => ({
  tool: (definition: unknown) => definition,
  isStepCount: () => () => false,
  streamText: mocks.streamText,
  generateText: mocks.generateText,
}))
vi.mock('../providers/registry', () => ({
  getSalesAgentLanguageModel: vi.fn(async () => ({
    model: { modelId: 'test-model' },
    provider: 'openai',
    modelId: 'test-model',
    config: { provider: 'openai', apiKeyEnv: 'OPENAI_API_KEY' },
    usedApiKey: 'test-key',
  })),
  getAvailableFallbackLanguageModels: vi.fn(async () => []),
}))
vi.mock('../providers/key-pool', () => ({
  apiKeyPoolManager: {
    parseKeysFromEnv: vi.fn(() => ['test-key']),
    markKeySuccess: mocks.markKeySuccess,
    markKeyError: mocks.markKeyError,
  },
}))
vi.mock('../providers/ai-sdk', () => ({
  createSalesAgentLanguageModel: vi.fn(),
}))
vi.mock('../tools/definitions', () => ({ executeDataTool: mocks.executeDataTool }))
vi.mock('../core/flags', () => ({
  isSalesAgentKnowledgeRagEnabled: mocks.isKnowledgeEnabled,
}))
vi.mock('../debug-log', () => ({ recordSalesAgentDebugEvent: mocks.recordSalesAgentDebugEvent }))

import { DEFAULT_RUN_BUDGET } from '../contracts'
import { runTurn } from './run-turn'

function completedStream(text = 'Câu trả lời hoàn chỉnh.') {
  return {
    text: Promise.resolve(text),
    steps: Promise.resolve([{ usage: { outputTokens: 120 } }]),
    finishReason: Promise.resolve('stop'),
  }
}

describe('runTurn budgets and finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isKnowledgeEnabled.mockReturnValue(false)
    mocks.streamText.mockImplementation(() => completedStream())
    mocks.generateText.mockResolvedValue({
      text: 'Câu trả lời từ finalizer.',
      finishReason: 'stop',
      steps: [{ usage: { outputTokens: 200 } }],
    })
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-data',
      tool: 'browse_catalog',
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-data',
        toolCallId: 'call-data',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: { items: [] },
    })
  })

  it('reserves the last model step for a no-tool final answer and wires all timeouts', async () => {
    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Tư vấn VF 8' } })

    const options = mocks.streamText.mock.calls[0][0]
    const finalStep = options.prepareStep({ stepNumber: DEFAULT_RUN_BUDGET.maxModelSteps - 1, steps: [] })

    expect(finalStep.activeTools).toEqual([])
    expect(finalStep.toolChoice).toBe('none')
    expect(finalStep.instructions).toContain('Giai đoạn tra cứu đã kết thúc')
    expect(options.timeout.stepMs).toBe(DEFAULT_RUN_BUDGET.stepTimeoutMs)
    expect(options.timeout.toolMs).toBe(DEFAULT_RUN_BUDGET.toolTimeoutMs)
    expect(options.timeout.totalMs).toBeLessThanOrEqual(DEFAULT_RUN_BUDGET.totalTimeoutMs)
    expect(options.maxRetries).toBe(0)
  })

  it('returns and logs input/output usage, including cache input when reported', async () => {
    mocks.streamText.mockReturnValue({
      text: Promise.resolve('CÃ¢u tráº£ lá»i cÃ³ usage.'),
      steps: Promise.resolve([
        {
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            totalTokens: 120,
            inputTokenDetails: { cacheReadTokens: 12 },
          },
        },
        {
          usage: {
            inputTokenDetails: { noCacheTokens: 3, cacheReadTokens: 7 },
            outputTokens: 4,
          },
        },
      ]),
      finishReason: Promise.resolve('stop'),
    })

    const result = await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Token usage' } })

    expect(result.usage).toEqual({
      inputTokens: 110,
      outputTokens: 24,
      totalTokens: 134,
      cachedInputTokens: 19,
    })
    const completedEvent = mocks.recordSalesAgentDebugEvent.mock.calls
      .find(([event]) => event === 'run.completed')
    expect(completedEvent?.[2]).toMatchObject({ usage: result.usage })
  })

  it('uses the provider aggregate usage when the SDK exposes it', async () => {
    mocks.streamText.mockReturnValue({
      text: Promise.resolve('CÃ¢u tráº£ lá»i.'),
      steps: Promise.resolve([]),
      usage: Promise.resolve({
        inputTokens: 42,
        outputTokens: 8,
        totalTokens: 50,
        inputTokenDetails: { cacheReadTokens: 6 },
      }),
      finishReason: Promise.resolve('stop'),
    })

    const result = await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Aggregate usage' } })

    expect(result.usage).toEqual({
      inputTokens: 42,
      outputTokens: 8,
      totalTokens: 50,
      cachedInputTokens: 6,
    })
  })

  it('exposes six runtime data tools and keeps entity resolution internal', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)

    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Tư vấn VF 8' } })

    const toolNames = Object.keys(mocks.streamText.mock.calls[0][0].tools).sort()
    expect(toolNames).toEqual([
      'browse_catalog',
      'compare_products',
      'discover_accessories',
      'get_current_promotions',
      'get_product_details',
      'search_knowledge',
    ])
    expect(toolNames).not.toContain('resolve_catalog_entities')
  })

  it('gives the model compact media references without exposing approved URLs', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)
    const mediaUrl = 'https://om.vinfastauto.com/assets/wifi-settings.png'
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-knowledge',
      tool: 'search_knowledge',
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-knowledge',
        toolCallId: 'call-knowledge',
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
        snippets: [{
          title: 'Cài đặt Wi-Fi',
          content: 'Chọn Cài đặt rồi chọn Wi-Fi.',
          category: 'TECHNICAL_GUIDE',
          citationPointer: 'cite:wifi',
          contentSafety: 'SAFE',
          media: [{
            assetId: 'asset-wifi',
            annotationId: 'annotation-wifi',
            title: 'Màn hình Wi-Fi',
            summary: 'Ảnh chụp màn hình cài đặt Wi-Fi trên xe VF 5. Phần hiển thị khác không liên quan đến thao tác.',
            alt: 'Màn hình Wi-Fi',
            url: mediaUrl,
            mimeType: 'image/png',
            width: 640,
            height: 480,
            safetyCritical: false,
            citationId: 'cite:wifi',
            diagramLabels: [{ marker: '1', description: 'Biểu tượng Wi-Fi trên thanh điều hướng' }],
          }],
        }],
      },
    })

    let modelToolResult: unknown
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        modelToolResult = await options.tools.search_knowledge.execute({ query: 'Cách kết nối Wi-Fi VF 5' })
        return 'Mở Cài đặt rồi chọn Wi-Fi.\n\n[media:1]'
      })(),
    }))

    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Cách kết nối Wi-Fi VF 5' } })

    expect(modelToolResult).toMatchObject({
      outcome: 'SUCCESS',
      data: {
        snippets: [{ media: [{
          reference: 'media:1',
          title: 'Màn hình Wi-Fi',
          visualDescription: 'Ảnh chụp màn hình cài đặt Wi-Fi trên xe VF 5.',
          usageHint: expect.stringContaining('[media:1]'),
          diagramLabels: [{ marker: '1', description: 'Biểu tượng Wi-Fi trên thanh điều hướng' }],
        }] }],
      },
    })
    expect(JSON.stringify(modelToolResult)).not.toContain(mediaUrl)
    expect(JSON.stringify(modelToolResult)).not.toContain('Phần hiển thị khác không liên quan')
  })

  it('keeps large catalog payloads compact in the model-facing tool result', async () => {
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-product-details',
      tool: 'get_product_details',
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-product-details',
        toolCallId: 'call-product-details',
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
        products: [{
          productId: 'prod-vf8',
          name: 'VinFast VF 8',
          productType: 'CAR',
          description: 'Mô tả dài không cần đưa nguyên văn vào prompt.',
          pricing: { from: 898000000, to: 1091000000, currency: 'VND' },
          specs: {
            battery_capacity_kwh: { displayValue: '87.7 kWh', rawValue: '87.7 kWh', factRef: 'fact-secret' },
          },
          variants: [{ id: 'variant-1', name: 'VF 8 Eco', sku: 'CAR-1', price: 898000000, isActive: true }],
        }],
      },
    })

    let modelToolResult: unknown
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        modelToolResult = await options.tools.get_product_details.execute({ productIds: ['prod-vf8'] })
        return 'Giá VF 8 hiện có trong dữ liệu đã xác minh.'
      })(),
    }))

    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Giá VinFast VF 8' } })

    expect(modelToolResult).toMatchObject({
      outcome: 'SUCCESS',
      data: {
        products: [{
          id: 'prod-vf8',
          name: 'VinFast VF 8',
          pricing: { from: 898000000, to: 1091000000, currency: 'VND' },
          specs: { battery_capacity_kwh: '87.7 kWh' },
          variantCount: 1,
          variants: [{ name: 'VF 8 Eco', code: 'CAR-1', price: 898000000 }],
        }],
      },
    })
    expect(JSON.stringify(modelToolResult)).not.toContain('fact-secret')
    expect(JSON.stringify(modelToolResult)).not.toContain('Mô tả dài')
  })

  it('removes redundant unavailable comparison rows from the model-facing tool result', async () => {
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-compare-products',
      tool: 'compare_products',
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-compare-products',
        toolCallId: 'call-compare-products',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: {
        products: [
          { productId: 'vf6', name: 'VinFast VF 6', productType: 'CAR', price: 646000000 },
          { productId: 'vf7', name: 'VinFast VF 7', productType: 'CAR', price: 740000000 },
        ],
        rows: [
          {
            criterion: 'price',
            label: 'Giá khởi điểm',
            unit: 'VNĐ',
            values: [
              { productId: 'vf6', productName: 'VinFast VF 6', value: '646.000.000 VNĐ', factRef: 'fact-price-vf6' },
              { productId: 'vf7', productName: 'VinFast VF 7', value: '740.000.000 VNĐ', factRef: 'fact-price-vf7' },
            ],
          },
          {
            criterion: 'range',
            label: 'Tầm hoạt động',
            values: [
              { productId: 'vf6', productName: 'VinFast VF 6', value: 'Chưa cập nhật', factRef: 'fact-range-vf6' },
              { productId: 'vf7', productName: 'VinFast VF 7', value: 'Chưa cập nhật', factRef: 'fact-range-vf7' },
            ],
          },
        ],
        highlights: [],
      },
    })

    let modelToolResult: any
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        modelToolResult = await options.tools.compare_products.execute({
          productMentions: ['VinFast VF 6', 'VinFast VF 7'],
          criteria: ['Giá bán', 'Tầm hoạt động'],
        })
        return 'Đã tổng hợp so sánh.'
      })(),
    }))

    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'So sánh VF 6 và VF 7' } })

    expect(modelToolResult).toMatchObject({
      outcome: 'SUCCESS',
      data: {
        rows: [{
          criterion: 'price',
          values: [{ productId: 'vf6' }, { productId: 'vf7' }],
        }],
        unavailableCriteria: ['Tầm hoạt động'],
      },
    })
    expect(modelToolResult.data.rows[0].values[0]).not.toHaveProperty('productName')
  })

  it('logs retrieval phase diagnostics without exposing them to the model', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)
    mocks.executeDataTool.mockResolvedValue({
      schemaVersion: '2.0',
      toolCallId: 'call-knowledge-diagnostics',
      tool: 'search_knowledge',
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: 'obs-knowledge-diagnostics',
        toolCallId: 'call-knowledge-diagnostics',
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      diagnostics: {
        retrieval: {
          runtimeStateLatencyMs: 2.1,
          ftsLatencyMs: 12.4,
          embeddingLatencyMs: 830.5,
          vectorSearchLatencyMs: 18.2,
          fusionLatencyMs: 0.2,
          rerankLatencyMs: 0.04,
          hierarchyLoadLatencyMs: 6.7,
          expansionLatencyMs: 0.1,
          contextBuildLatencyMs: 0.3,
          totalLatencyMs: 870.6,
        },
        visualLookup: { enabled: true, latencyMs: 4.2, pointerCount: 1 },
      },
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: { snippets: [{ title: 'Wi-Fi', content: 'Chọn Wi-Fi.' }] },
    })

    let modelToolResult: unknown
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        modelToolResult = await options.tools.search_knowledge.execute({ query: 'Cách kết nối Wi-Fi VF 5' })
        return 'Mở Cài đặt rồi chọn Wi-Fi.'
      })(),
    }))

    await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Cách kết nối Wi-Fi VF 5' } })

    const completedEvent = mocks.recordSalesAgentDebugEvent.mock.calls.find(([event, _context, data]) => (
      event === 'tool.completed' && (data as any)?.tool === 'search_knowledge'
    ))
    expect(completedEvent?.[2]).toMatchObject({
      diagnostics: {
        retrieval: {
          ftsLatencyMs: 12.4,
          embeddingLatencyMs: 830.5,
          vectorSearchLatencyMs: 18.2,
          contextBuildLatencyMs: 0.3,
        },
      },
    })
    expect(JSON.stringify(modelToolResult)).not.toContain('embeddingLatencyMs')
  })

  it('rejects tool calls beyond maxToolCalls without executing the repository again', async () => {
    let rejectedResult: unknown
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        await options.tools.browse_catalog.execute({})
        rejectedResult = await options.tools.browse_catalog.execute({})
        return 'Đã tổng hợp dữ liệu hiện có.'
      })(),
    }))

    const result = await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'Các mẫu xe hiện có' },
      budget: { ...DEFAULT_RUN_BUDGET, maxToolCalls: 1 },
    })

    expect(mocks.executeDataTool).toHaveBeenCalledTimes(1)
    expect(result.toolCallsCount).toBe(1)
    expect(rejectedResult).toMatchObject({ outcome: 'REJECTED' })
    expect(result.evidence.getAllToolResults()).toHaveLength(2)
  })

  it('recovers a length-truncated attempt with a separate no-tool finalizer', async () => {
    mocks.streamText.mockReturnValue({
      text: Promise.resolve('Bản nháp bị cắt'),
      steps: Promise.resolve([{ usage: { outputTokens: 800 } }]),
      finishReason: Promise.resolve('length'),
    })

    const result = await runTurn({ input: { kind: 'USER_MESSAGE', text: 'So sánh xe' } })

    expect(result.text).toBe('Câu trả lời từ finalizer.')
    expect(result.finishReason).toBe('stop')
    expect(mocks.generateText).toHaveBeenCalledOnce()
    expect(mocks.generateText.mock.calls[0][0]).toMatchObject({
      activeTools: [],
      toolChoice: 'none',
      maxOutputTokens: 400,
    })
  })

  it('uses ordinary chat history without page context enrichment', async () => {
    await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'Các thao tác xung quanh cửa là gì?' },
      history: [
        { role: 'user', content: 'VF 9 thì sao?' },
        { role: 'assistant', content: 'Với VF 9, bạn thao tác như sau.' },
      ],
    })

    const messages = mocks.streamText.mock.calls[0][0].messages
    expect(messages).toEqual([
      { role: 'user', content: 'VF 9 thì sao?' },
      { role: 'assistant', content: 'Với VF 9, bạn thao tác như sau.' },
      { role: 'user', content: 'Các thao tác xung quanh cửa là gì?' },
    ])
    expect(JSON.stringify(messages)).not.toContain('page_context')
  })

  it('executes search_knowledge at most once per turn', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)
    mocks.executeDataTool.mockImplementation(async (toolName, _input, toolCallId) => ({
      schemaVersion: '2.0',
      toolCallId,
      tool: toolName,
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'SUCCESS',
        issueCodes: [],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [],
      appliedBindings: [],
      outcome: 'SUCCESS',
      completeness: 'FULL',
      data: { snippets: [] },
    }))
    let duplicateResult: unknown
    mocks.streamText.mockImplementation((options) => ({
      ...completedStream(),
      text: (async () => {
        await options.tools.search_knowledge.execute({ query: 'Kết nối Wi-Fi' })
        duplicateResult = await options.tools.search_knowledge.execute({ query: 'Cài đặt Wi-Fi' })
        return 'Bạn mở Cài đặt rồi chọn Wi-Fi.'
      })(),
    }))

    const result = await runTurn({ input: { kind: 'USER_MESSAGE', text: 'Cách kết nối Wi-Fi' } })

    expect(mocks.executeDataTool).toHaveBeenCalledTimes(1)
    expect(result.toolCallsCount).toBe(1)
    expect(duplicateResult).toMatchObject({ outcome: 'REJECTED' })
    expect(result.evidence.getAllToolResults()).toHaveLength(1)
  })

  it('turns grounded knowledge into an actionable fallback instead of a retrieval status', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)
    mocks.executeDataTool.mockImplementation(async (toolName, _input, toolCallId) => ({
      schemaVersion: '2.0',
      toolCallId,
      tool: toolName,
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: `obs-${toolCallId}`,
        toolCallId,
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
        snippets: [{
          title: 'Sổ tay hướng dẫn VinFast VF 8 - Cài đặt Wi-Fi',
          content: [
            '### Cài đặt Wi-Fi',
            'Nhấn vào Thư viện ứng dụng rồi chọn Cài đặt Wi-Fi.',
            '- Bật Wi-Fi.',
            '- Chọn mạng khả dụng từ danh sách.',
            '- Nhập mật khẩu mạng nếu được yêu cầu.',
          ].join('\n'),
        }],
      },
    }))
    mocks.streamText.mockImplementation((options) => ({
      text: (async () => {
        await options.tools.search_knowledge.execute({ query: 'Kết nối Wi-Fi' })
        return ''
      })(),
      steps: Promise.resolve([]),
      finishReason: Promise.resolve('error'),
    }))
    mocks.generateText.mockRejectedValueOnce(new Error('provider timeout'))

    const result = await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'Cách kết nối Wi-Fi' },
    })

    expect(result.finishReason).toBe('error')
    expect(result.text).toContain('Bạn có thể thử')
    expect(result.text).toContain('Chọn mạng khả dụng')
    expect(result.text).toContain('Bạn có thể thử theo hướng dẫn sau')
    expect(result.text).not.toContain('VF 5')
    expect(result.text).not.toContain('đã tìm thấy tài liệu')
  })

  it('preserves a structured NEEDS_INPUT question when model finalization times out', async () => {
    mocks.isKnowledgeEnabled.mockReturnValue(true)
    mocks.executeDataTool.mockImplementation(async (toolName, _input, toolCallId) => ({
      schemaVersion: '2.0',
      toolCallId,
      tool: toolName,
      readAt: new Date().toISOString(),
      dataAsOf: new Date().toISOString(),
      evidence: [],
      observation: {
        observationId: `obs-${toolCallId}`,
        toolCallId,
        outcome: 'NEEDS_INPUT',
        issueCodes: ['AMBIGUOUS_REFERENCE'],
        inputHash: '{}',
        readAt: new Date().toISOString(),
      },
      issues: [{
        code: 'AMBIGUOUS_REFERENCE',
        message: 'Bạn đang hỏi dòng xe nào: VF 3, VF 8, VF 9?',
        field: 'vehicleModel',
      }],
      appliedBindings: [],
      outcome: 'NEEDS_INPUT',
      data: {
        field: 'vehicleModel',
        question: 'Bạn đang hỏi dòng xe nào: VF 3, VF 8, VF 9?',
        candidates: [
          { vehicleModel: 'VF 3', label: 'VF 3' },
          { vehicleModel: 'VF 8', label: 'VF 8' },
          { vehicleModel: 'VF 9', label: 'VF 9' },
        ],
      },
    }))
    mocks.streamText.mockImplementation((options) => ({
      text: (async () => {
        await options.tools.search_knowledge.execute({ query: 'Cách kết nối Wi-Fi' })
        return ''
      })(),
      steps: Promise.resolve([]),
      finishReason: Promise.resolve('error'),
    }))
    mocks.generateText.mockRejectedValueOnce(new Error('provider timeout'))

    const result = await runTurn({
      input: { kind: 'USER_MESSAGE', text: 'Cách kết nối Wi-Fi' },
    })

    expect(result.text).toBe('Bạn đang hỏi dòng xe nào: VF 3, VF 8, VF 9?')
    expect(result.text).not.toContain('Hệ thống tư vấn AI đang bận')
  })
})
