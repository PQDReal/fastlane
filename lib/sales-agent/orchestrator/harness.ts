import 'server-only'

import { generateText, isStepCount, tool, type LanguageModel, type ToolSet } from 'ai'
import { z } from 'zod'

import { limitSalesAgentHistory, type SalesAgentMessage } from '../contracts/message'
import { SALES_AGENT_COMPARE_CRITERIA } from '../contracts/criteria'
import {
  type SalesAgentToolName,
  type SalesAgentToolResult,
  type SalesAgentToolStatus,
} from '../contracts/tool'
import { redactSalesAgentInput, SALES_AGENT_SYSTEM_PROMPT } from '../core/policy'
import { buildSalesAgentInteraction } from '../interactions/builder'
import { getSalesAgentLanguageModel } from '../providers/registry'
import type { SalesAgentProviderId } from '../providers/types'
import { executeSalesAgentTool } from '../tools/registry'

export const SALES_AGENT_HARNESS_LIMITS = {
  maxModelSteps: 4,
  maxToolCalls: 8,
  maxToolCallsPerStep: 4,
  maxConcurrentTools: 2,
  totalTimeoutMs: 35_000,
  modelStepTimeoutMs: 25_000,
  toolTimeoutMs: 8_000,
} as const

const NO_DATA_RESPONSE = 'Mình chưa có đủ dữ liệu xác thực để trả lời chính xác. Bạn có thể cho mình biết rõ mẫu xe hoặc tiêu chí cần kiểm tra không?'

function interactionPrompt(slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage') {
  if (slot === 'vehicles') return 'Hãy chọn các mẫu xe bạn muốn so sánh.'
  if (slot === 'vehicle') return 'Hãy chọn mẫu xe bạn quan tâm.'
  if (slot === 'criteria') return 'Hãy chọn tiêu chí bạn ưu tiên.'
  if (slot === 'budget') return 'Hãy chọn khoảng ngân sách phù hợp.'
  return 'Hãy chọn nhu cầu sử dụng xe chính của bạn.'
}

const productTypeSchema = z.enum(['CAR', 'BIKE', 'ACCESSORY'])
const stockFilterSchema = z.enum(['ALL', 'IN_STOCK'])
const textSchema = z.string().trim().min(1).max(300)
const idSchema = z.string().trim().min(1).max(120)

export type SalesAgentHarnessToolEvent = {
  tool: SalesAgentToolName
  status: 'running' | SalesAgentToolStatus
}

export type SalesAgentHarnessOptions = {
  message: string
  history?: SalesAgentMessage[]
  pageContext?: { routeKey: string; entityId?: string }
  selectedProvider?: SalesAgentProviderId
  signal?: AbortSignal
  interactionsEnabled?: boolean
  conversationId?: string
  messageId?: string
  interactionSelection?: {
    slot: string
    options: Array<{ optionId: string; label: string; value: string; kind: 'product' | 'allowlist' }>
    freeText?: string
  }
  onToolStatus?: (event: SalesAgentHarnessToolEvent) => void
}

export type SalesAgentHarnessResult = {
  text: string
  provider: SalesAgentProviderId
  model: string
  finishReason: string
  steps: number
  toolCalls: number
  toolNames: SalesAgentToolName[]
  usage: { inputTokens?: number; outputTokens?: number }
  interaction?: import('../contracts/interaction').SalesAgentInteraction
}

type ToolRunState = {
  currentStep: number
  stepToolCalls: number
  totalToolCalls: number
  fingerprints: Set<string>
  toolNames: SalesAgentToolName[]
  resolvedAtStep: number | null
  signal: AbortSignal
  onToolStatus?: (event: SalesAgentHarnessToolEvent) => void
  limiter: AsyncLimiter
  interactionsEnabled: boolean
  fulfilledInteractionSlot?: string
  interactionRequest?: {
    slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage'
    mode: 'single' | 'multiple'
    minSelections: number
    maxSelections: number
    allowFreeText?: boolean
    productType?: 'CAR' | 'BIKE' | 'ACCESSORY'
  }
}

class AsyncLimiter {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly capacity: number) {}

  async run<T>(operation: () => Promise<T>) {
    if (this.active >= this.capacity) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active += 1
    try {
      return await operation()
    } finally {
      this.active -= 1
      this.queue.shift()?.()
    }
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

function fingerprint(name: SalesAgentToolName, input: unknown) {
  return `${name}:${JSON.stringify(stableValue(input))}`
}

function timeoutError(label: string) {
  return new Error(`${label} timed out.`)
}

async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Sales Agent run aborted.')

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(timeoutError('Tool'))
    }, timeoutMs)
    const abort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('Sales Agent run aborted.'))
    }
    signal.addEventListener('abort', abort, { once: true })

    operation().then((value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(value)
    }).catch((error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(error)
    })
  })
}

function guardrailResult(name: SalesAgentToolName, code: string, message: string): SalesAgentToolResult {
  return {
    tool: name,
    schemaVersion: '1.0',
    status: 'AMBIGUOUS',
    data: null,
    readAt: new Date().toISOString(),
    dataAsOf: null,
    evidence: [],
    warnings: [{ code, message }],
  }
}

function capToolResult(result: SalesAgentToolResult) {
  const serialized = JSON.stringify(result)
  if (serialized.length <= 24_000) return result
  return {
    ...result,
    data: null,
    status: 'PARTIAL' as const,
    warnings: [...result.warnings, { code: 'RESULT_TRUNCATED', message: 'Kết quả tool vượt giới hạn hiển thị và đã được rút gọn.' }],
  }
}

function createToolSet(state: ToolRunState): ToolSet {
  const execute = async (name: SalesAgentToolName, input: unknown, signal?: AbortSignal) => {
    const callSignal = signal ?? state.signal
    const callFingerprint = fingerprint(name, input)

    if (state.totalToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCalls) {
      const result = guardrailResult(name, 'TOOL_BUDGET_EXCEEDED', 'Agent đã đạt giới hạn số lần gọi tool trong một lượt.')
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    }
    if (state.stepToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCallsPerStep) {
      const result = guardrailResult(name, 'STEP_TOOL_BUDGET_EXCEEDED', 'Agent đã đạt giới hạn số tool trong một bước suy luận.')
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    }
    if (state.fingerprints.has(callFingerprint)) {
      const result = guardrailResult(name, 'DUPLICATE_TOOL_CALL', 'Tool call trùng với một lần gọi trước trong cùng lượt.')
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    }

    // A resolver result is only available to the model on the next step. This
    // prevents a speculative same-step compare/details call from consuming a
    // made-up or not-yet-resolved identifier.
    if ((name === 'compare_vehicles' || name === 'get_vehicle_details') && state.resolvedAtStep === state.currentStep) {
      const result = guardrailResult(name, 'RESOLUTION_BARRIER', 'Cần chờ kết quả resolve mẫu xe ở bước tiếp theo trước khi đọc thông số.')
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    }

    state.fingerprints.add(callFingerprint)
    state.totalToolCalls += 1
    state.stepToolCalls += 1
    state.toolNames.push(name)
    if (name === 'resolve_vehicle_references') state.resolvedAtStep = state.currentStep
    state.onToolStatus?.({ tool: name, status: 'running' })

    try {
      const result = capToolResult(await state.limiter.run(() => withTimeout(() => executeSalesAgentTool(name, input), SALES_AGENT_HARNESS_LIMITS.toolTimeoutMs, callSignal)))
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    } catch (error) {
      const result = guardrailResult(name, 'TOOL_EXECUTION_FAILED', error instanceof Error ? error.message : 'Tool tạm thời không khả dụng.')
      state.onToolStatus?.({ tool: name, status: result.status })
      return result
    }
  }

  return {
    resolve_vehicle_references: tool({
      description: 'Xác định tên một hoặc nhiều mẫu xe thành product ID canonical từ catalog active. Gọi tool này trước khi cần thông số, giá hoặc so sánh mà chưa có ID tin cậy.',
      inputSchema: z.object({ query: textSchema, limit: z.number().int().min(1).max(3).optional() }).strict(),
      execute: (input, options) => execute('resolve_vehicle_references', input, options.abortSignal),
    }),
    request_user_choice: tool({
      description: 'Yêu cầu giao diện hiển thị lựa chọn có cấu trúc cho slot còn thiếu. Chỉ gọi khi đã biết chính xác slot cần hỏi và không thể tiếp tục bằng tool đọc dữ liệu.',
      inputSchema: z.object({
        slot: z.enum(['vehicles', 'vehicle', 'criteria', 'budget', 'usage']),
        mode: z.enum(['single', 'multiple']),
        minSelections: z.number().int().min(0).max(8),
        maxSelections: z.number().int().min(1).max(8),
        allowFreeText: z.boolean().optional(),
        productType: productTypeSchema.optional(),
      }).strict(),
      execute: async (input) => {
        if (!state.interactionsEnabled) return guardrailResult('request_user_choice', 'INTERACTIONS_DISABLED', 'Tương tác có cấu trúc đang tắt; hãy hỏi làm rõ bằng văn bản ngắn gọn.')
        if (state.totalToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCalls || state.stepToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCallsPerStep) return guardrailResult('request_user_choice', 'TOOL_BUDGET_EXCEEDED', 'Agent đã đạt giới hạn số lần gọi tool trong một lượt.')
        if (state.fulfilledInteractionSlot === input.slot) return guardrailResult('request_user_choice', 'INTERACTION_SLOT_ALREADY_FILLED', 'Người dùng đã trả lời slot này bằng continuation token hợp lệ; hãy dùng lựa chọn đã xác thực để tiếp tục.')
        if (state.interactionRequest) return guardrailResult('request_user_choice', 'DUPLICATE_INTERACTION', 'Chỉ tạo một interaction trong một lượt.')
        if (input.mode === 'single' && (input.minSelections !== 1 || input.maxSelections !== 1)) return guardrailResult('request_user_choice', 'INVALID_INTERACTION', 'single phải có đúng một lựa chọn.')
        state.totalToolCalls += 1
        state.stepToolCalls += 1
        state.toolNames.push('request_user_choice')
        state.onToolStatus?.({ tool: 'request_user_choice', status: 'running' })
        state.interactionRequest = input
        const result = {
          kind: 'requires_input' as const,
          slot: input.slot,
          mode: input.mode,
          minSelections: input.minSelections,
          maxSelections: input.maxSelections,
          allowFreeText: input.allowFreeText === true,
          productType: input.productType,
        }
        state.onToolStatus?.({ tool: 'request_user_choice', status: 'AMBIGUOUS' })
        return result
      },
    }),
    search_catalog: tool({
      description: 'Tìm sản phẩm active trong catalog theo tên, nhu cầu, ngân sách và tồn kho.',
      inputSchema: z.object({
        query: textSchema.optional(),
        productTypes: z.array(productTypeSchema).max(3).optional(),
        minPrice: z.number().finite().min(0).optional(),
        maxPrice: z.number().finite().min(0).optional(),
        stockFilter: stockFilterSchema.optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }).strict(),
      execute: (input, options) => execute('search_catalog', input, options.abortSignal),
    }),
    get_vehicle_details: tool({
      description: 'Đọc giá, tồn kho, phiên bản và thông số cấp mẫu xe bằng product ID canonical đã được resolve.',
      inputSchema: z.object({ productId: idSchema }).strict(),
      execute: (input, options) => execute('get_vehicle_details', input, options.abortSignal),
    }),
    compare_vehicles: tool({
      description: 'So sánh từ hai đến ba mẫu xe bằng product ID canonical đã được resolve; giữ lại các tiêu chí người dùng yêu cầu và nêu rõ trường còn thiếu.',
      inputSchema: z.object({
        productIds: z.array(idSchema).min(2).max(3),
        criteria: z.array(z.enum(SALES_AGENT_COMPARE_CRITERIA)).min(1).max(6).optional(),
      }).strict(),
      execute: (input, options) => execute('compare_vehicles', input, options.abortSignal),
    }),
    get_current_promotions: tool({
      description: 'Đọc khuyến mãi công khai đang hiệu lực theo loại sản phẩm.',
      inputSchema: z.object({ productType: productTypeSchema.optional() }).strict(),
      execute: (input, options) => execute('get_current_promotions', input, options.abortSignal),
    }),
    discover_accessories: tool({
      description: 'Tìm phụ kiện active theo catalog association; kết quả không tự chứng minh tương thích kỹ thuật.',
      inputSchema: z.object({
        query: textSchema.optional(),
        vehicleProductId: idSchema.optional(),
        minPrice: z.number().finite().min(0).optional(),
        maxPrice: z.number().finite().min(0).optional(),
        stockFilter: stockFilterSchema.optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }).strict(),
      execute: (input, options) => execute('discover_accessories', input, options.abortSignal),
    }),
  }
}

function buildUserPrompt(message: string, pageContext?: { routeKey: string; entityId?: string }) {
  const context = pageContext?.routeKey
    ? `\nNgữ cảnh trang hiện tại: ${pageContext.routeKey}${pageContext.entityId ? ` (${pageContext.entityId})` : ''}.`
    : ''
  return `${redactSalesAgentInput(message)}${context}`
}

function buildInteractionContext(selection: SalesAgentHarnessOptions['interactionSelection']) {
  if (!selection) return ''
  return `\nSERVER_VALIDATED_INTERACTION (đã được kiểm tra từ continuation token; không in option ID/value kỹ thuật ra câu trả lời): slot=${selection.slot}; selections=${JSON.stringify(selection.options.map((option) => ({ optionId: option.optionId, label: option.label, value: option.value, kind: option.kind })))}${selection.freeText ? `; freeText=${JSON.stringify(selection.freeText)}` : ''}`
}

function buildSystemPrompt() {
  return [
    SALES_AGENT_SYSTEM_PROMPT,
    'Bạn đang chạy trong một model-native tool loop. Hãy dùng tool khi câu hỏi cần dữ liệu catalog live; không tự suy diễn từ trí nhớ.',
    'Nếu người dùng tiếp tục bằng một câu ngắn chỉ có tên xe, hãy đọc lịch sử để kế thừa ý định và tiêu chí của lượt trước. Ví dụ sau câu “so sánh pin và tốc độ”, câu “VF7 và VF8” vẫn là yêu cầu compare_vehicles.',
    'Nếu cần nhiều mẫu xe, gọi resolve_vehicle_references một lần với nguyên cụm tên xe; sau khi nhận kết quả mới gọi compare_vehicles hoặc get_vehicle_details bằng các ID trong kết quả. Không tự tạo UUID.',
    'Nếu prompt có SERVER_VALIDATED_INTERACTION, các value loại product là ID canonical do server xác thực. Dùng trực tiếp các ID này cho tool đọc dữ liệu; không resolve lại và không gọi request_user_choice cho slot đã được điền.',
    'Chỉ hỏi phiên bản/năm khi tool trả về dữ liệu hoặc ambiguity chứng minh có nhiều dữ liệu theo phiên bản/năm. Nếu database chỉ có dữ liệu cấp mẫu xe, trả lời ở cấp mẫu xe.',
    'Nếu còn thiếu mẫu xe/tiêu chí/ngân sách/sử dụng và có thể đưa ra danh sách option grounded, gọi request_user_choice; không tự liệt kê option trong prose như thể UI đã xác nhận.',
  ].join('\n')
}

function createRunSignal(parentSignal?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(timeoutError('Sales Agent run')), SALES_AGENT_HARNESS_LIMITS.totalTimeoutMs)
  const abortParent = () => controller.abort(parentSignal?.reason ?? new Error('Sales Agent request aborted.'))
  if (parentSignal?.aborted) abortParent()
  else parentSignal?.addEventListener('abort', abortParent, { once: true })
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abortParent)
    },
  }
}

export async function runSalesAgentHarness(options: SalesAgentHarnessOptions): Promise<SalesAgentHarnessResult> {
  const provider = await getSalesAgentLanguageModel(options.selectedProvider)
  const runSignal = createRunSignal(options.signal)
  const state: ToolRunState = {
    currentStep: 0,
    stepToolCalls: 0,
    totalToolCalls: 0,
    fingerprints: new Set(),
    toolNames: [],
    resolvedAtStep: null,
    signal: runSignal.signal,
    onToolStatus: options.onToolStatus,
    limiter: new AsyncLimiter(SALES_AGENT_HARNESS_LIMITS.maxConcurrentTools),
    interactionsEnabled: options.interactionsEnabled !== false,
    fulfilledInteractionSlot: options.interactionSelection?.slot,
    interactionRequest: undefined,
  }

  try {
    const history = limitSalesAgentHistory(options.history ?? [])
    const messages = [
      ...history.map((item) => ({ role: item.role, content: redactSalesAgentInput(item.content) } as const)),
      { role: 'user' as const, content: `${buildUserPrompt(options.message, options.pageContext)}${buildInteractionContext(options.interactionSelection)}` },
    ]
    const result = await generateText({
      model: provider.model as LanguageModel,
      system: buildSystemPrompt(),
      messages,
      tools: createToolSet(state),
      toolChoice: 'auto',
      stopWhen: [
        isStepCount(SALES_AGENT_HARNESS_LIMITS.maxModelSteps),
        () => Boolean(state.interactionRequest),
      ],
      maxRetries: 0,
      temperature: 0.2,
      maxOutputTokens: 900,
      abortSignal: runSignal.signal,
      timeout: {
        totalMs: SALES_AGENT_HARNESS_LIMITS.totalTimeoutMs,
        stepMs: SALES_AGENT_HARNESS_LIMITS.modelStepTimeoutMs,
        toolMs: SALES_AGENT_HARNESS_LIMITS.toolTimeoutMs,
      },
      telemetry: { isEnabled: false },
      prepareStep: ({ stepNumber }) => {
        state.currentStep = stepNumber
        state.stepToolCalls = 0
        return undefined
      },
    })

    return {
      text: state.interactionRequest
        ? interactionPrompt(state.interactionRequest.slot)
        : result.text.trim() || NO_DATA_RESPONSE,
      provider: provider.provider,
      model: provider.modelId,
      finishReason: result.finishReason,
      steps: result.steps.length,
      toolCalls: state.totalToolCalls,
      toolNames: [...state.toolNames],
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      ...(state.interactionRequest ? {
        interaction: await buildSalesAgentInteraction(state.interactionRequest, {
          conversationId: options.conversationId ?? 'guest',
          messageId: options.messageId ?? 'message',
        }),
      } : {}),
    }
  } finally {
    runSignal.cleanup()
  }
}

export { NO_DATA_RESPONSE }
