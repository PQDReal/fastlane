import 'server-only'

import { generateText, isStepCount, tool, type LanguageModel, type ToolSet } from 'ai'
import { z } from 'zod'

import { limitSalesAgentHistory, type SalesAgentMessage } from '../contracts/message'
import { SALES_AGENT_COMPARE_CRITERIA } from '../contracts/criteria'
import { classifySalesAgentProductType } from '../catalog/product-type'
import {
  type SalesAgentToolName,
  type SalesAgentToolResult,
  type SalesAgentToolStatus,
} from '../contracts/tool'
import { redactSalesAgentInput, SALES_AGENT_SYSTEM_PROMPT } from '../core/policy'
import { recordSalesAgentDebugEvent } from '../debug-log'
import { salesAgentBudgetConstraint } from '../interactions/budget'
import { buildSalesAgentInteraction } from '../interactions/builder'
import { isSalesAgentInternalUrl } from '../navigation/paths'
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

const NO_DATA_RESPONSE = 'Mình có thể tiếp tục tư vấn theo catalog đang bán. Bạn đang quan tâm ô tô điện, xe máy điện hay phụ kiện?'

function interactionPrompt(slot: 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage') {
  if (slot === 'vehicles') return 'Hãy chọn các mẫu xe bạn muốn so sánh.'
  if (slot === 'vehicle') return 'Hãy chọn mẫu xe bạn quan tâm.'
  if (slot === 'criteria') return 'Hãy chọn tiêu chí bạn ưu tiên.'
  if (slot === 'budget') return 'Hãy chọn khoảng ngân sách phù hợp.'
  return 'Hãy chọn nhu cầu sử dụng xe chính của bạn.'
}

const productTypeSchema = z.enum(['CAR', 'BIKE', 'ACCESSORY'])
const textSchema = z.string().trim().min(1).max(300)
const idSchema = z.string().trim().min(1).max(120)
const CANONICAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    productType?: 'CAR' | 'BIKE' | 'ACCESSORY'
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
  allowedNavigationHrefs: string[]
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
  allowedNavigationHrefs: Set<string>
  debugContext: { conversationId?: string; messageId?: string }
  catalogConstraint?: {
    productType?: 'CAR' | 'BIKE' | 'ACCESSORY'
    minPrice?: number
    maxPrice?: number
    clearNameQuery?: boolean
  }
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

function latestExplicitProductType(message: string, history: SalesAgentMessage[]) {
  const messages = [message, ...history.filter((item) => item.role === 'user').map((item) => item.content).reverse()]
  for (const content of messages) {
    const type = classifySalesAgentProductType(content).type
    if (type) return type
  }
  return undefined
}

export function validatedCatalogConstraint(
  message: string,
  history: SalesAgentMessage[],
  selection: SalesAgentHarnessOptions['interactionSelection'],
) {
  const selectedBudget = selection?.slot === 'budget'
    ? selection.options.find((option) => option.kind === 'allowlist')
    : undefined
  const budget = selectedBudget ? salesAgentBudgetConstraint(selectedBudget.value) : null
  const productType = selection?.productType
    ?? latestExplicitProductType(message, history)
    ?? budget?.productType
  if (!productType && !budget) return undefined
  return {
    ...(productType ? { productType } : {}),
    ...(budget?.minPrice !== undefined ? { minPrice: budget.minPrice } : {}),
    ...(budget?.maxPrice !== undefined ? { maxPrice: budget.maxPrice } : {}),
    ...(budget ? { clearNameQuery: true } : {}),
  }
}

function constrainedToolInput(name: SalesAgentToolName, input: unknown, state: ToolRunState) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  if (name !== 'search_catalog' && name !== 'discover_accessories') return input
  const source = input as Record<string, unknown>
  const constrained: Record<string, unknown> = {
    ...source,
    ...(name === 'search_catalog' && state.catalogConstraint?.productType
      ? { productTypes: [state.catalogConstraint.productType] }
      : {}),
    ...(state.catalogConstraint?.minPrice !== undefined ? { minPrice: state.catalogConstraint.minPrice } : {}),
    ...(state.catalogConstraint?.maxPrice !== undefined ? { maxPrice: state.catalogConstraint.maxPrice } : {}),
  }
  if (state.catalogConstraint?.clearNameQuery) delete constrained.query
  if (constrained.minPrice === 0 && state.catalogConstraint?.minPrice === undefined) delete constrained.minPrice
  if (constrained.maxPrice === 0 && state.catalogConstraint?.maxPrice === undefined) delete constrained.maxPrice
  // `vehicleProductId` is an optional narrowing hint. Models sometimes emit
  // prose sentinels such as "general" for a general accessory browse; treating
  // that as absent preserves the useful catalog read without trusting a fake ID.
  if (name === 'discover_accessories' && typeof constrained.vehicleProductId === 'string' && !CANONICAL_ID_PATTERN.test(constrained.vehicleProductId)) {
    delete constrained.vehicleProductId
  }
  return constrained
}

function collectAllowedNavigationHrefs(value: unknown, target: Set<string>, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return
  if (typeof value === 'string') {
    if (isSalesAgentInternalUrl(value)) target.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAllowedNavigationHrefs(item, target, depth + 1))
    return
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectAllowedNavigationHrefs(item, target, depth + 1))
  }
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
    const effectiveInput = constrainedToolInput(name, input, state)
    const callFingerprint = fingerprint(name, effectiveInput)
    recordSalesAgentDebugEvent('tool.requested', state.debugContext, { tool: name, input: effectiveInput })

    if (state.totalToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCalls) {
      const result = guardrailResult(name, 'TOOL_BUDGET_EXCEEDED', 'Agent đã đạt giới hạn số lần gọi tool trong một lượt.')
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.blocked', state.debugContext, { tool: name, input: effectiveInput, result })
      return result
    }
    if (state.stepToolCalls >= SALES_AGENT_HARNESS_LIMITS.maxToolCallsPerStep) {
      const result = guardrailResult(name, 'STEP_TOOL_BUDGET_EXCEEDED', 'Agent đã đạt giới hạn số tool trong một bước suy luận.')
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.blocked', state.debugContext, { tool: name, input: effectiveInput, result })
      return result
    }
    if (state.fingerprints.has(callFingerprint)) {
      const result = guardrailResult(name, 'DUPLICATE_TOOL_CALL', 'Tool call trùng với một lần gọi trước trong cùng lượt.')
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.blocked', state.debugContext, { tool: name, input: effectiveInput, result })
      return result
    }

    // A resolver result is only available to the model on the next step. This
    // prevents a speculative same-step compare/details call from consuming a
    // made-up or not-yet-resolved identifier.
    if ((name === 'compare_vehicles' || name === 'get_vehicle_details') && state.resolvedAtStep === state.currentStep) {
      const result = guardrailResult(name, 'RESOLUTION_BARRIER', 'Cần chờ kết quả resolve mẫu xe ở bước tiếp theo trước khi đọc thông số.')
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.blocked', state.debugContext, { tool: name, input: effectiveInput, result })
      return result
    }

    state.fingerprints.add(callFingerprint)
    state.totalToolCalls += 1
    state.stepToolCalls += 1
    state.toolNames.push(name)
    if (name === 'resolve_vehicle_references') state.resolvedAtStep = state.currentStep
    state.onToolStatus?.({ tool: name, status: 'running' })
    const startedAt = Date.now()

    try {
      const result = capToolResult(await state.limiter.run(() => withTimeout(() => executeSalesAgentTool(name, effectiveInput), SALES_AGENT_HARNESS_LIMITS.toolTimeoutMs, callSignal)))
      collectAllowedNavigationHrefs(result, state.allowedNavigationHrefs)
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.completed', state.debugContext, { tool: name, input: effectiveInput, durationMs: Date.now() - startedAt, result })
      return result
    } catch (error) {
      const result = guardrailResult(name, 'TOOL_EXECUTION_FAILED', error instanceof Error ? error.message : 'Tool tạm thời không khả dụng.')
      state.onToolStatus?.({ tool: name, status: result.status })
      recordSalesAgentDebugEvent('tool.failed', state.debugContext, { tool: name, input: effectiveInput, durationMs: Date.now() - startedAt, result })
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
        recordSalesAgentDebugEvent('tool.requested', state.debugContext, { tool: 'request_user_choice', input })
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
        recordSalesAgentDebugEvent('tool.completed', state.debugContext, { tool: 'request_user_choice', input, result })
        return result
      },
    }),
    search_catalog: tool({
      description: 'Tìm sản phẩm đang bán trong catalog theo tên hoặc ngân sách. Chỉ truyền query khi cần khớp tên sản phẩm; với tư vấn/browse theo nhu cầu, dùng productTypes và bộ lọc giá.',
      inputSchema: z.object({
        query: textSchema.optional(),
        productTypes: z.array(productTypeSchema).max(3).optional(),
        minPrice: z.number().finite().min(0).optional(),
        maxPrice: z.number().finite().min(0).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }).strict(),
      execute: (input, options) => execute('search_catalog', input, options.abortSignal),
    }),
    get_vehicle_details: tool({
      description: 'Đọc trạng thái đang bán, giá, URL, phiên bản và thông số cấp mẫu xe bằng product ID canonical đã được resolve.',
      inputSchema: z.object({ productId: idSchema }).strict(),
      execute: (input, options) => execute('get_vehicle_details', input, options.abortSignal),
    }),
    compare_vehicles: tool({
      description: 'So sánh từ hai đến ba mẫu xe bằng product ID canonical đã được resolve; giữ lại các tiêu chí người dùng yêu cầu và nêu rõ trường còn thiếu.',
      inputSchema: z.object({
        productIds: z.array(idSchema).min(2).max(3),
        criteria: z.array(z.enum(SALES_AGENT_COMPARE_CRITERIA)).min(1).max(SALES_AGENT_COMPARE_CRITERIA.length).optional(),
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
        vehicleProductId: idSchema.optional().describe('Chỉ truyền UUID canonical đã resolve; bỏ field này khi tư vấn phụ kiện chung.'),
        minPrice: z.number().finite().min(0).optional(),
        maxPrice: z.number().finite().min(0).optional(),
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
  const budget = selection.slot === 'budget'
    ? salesAgentBudgetConstraint(selection.options.find((option) => option.kind === 'allowlist')?.value ?? '')
    : null
  return `\nSERVER_VALIDATED_INTERACTION (đã được kiểm tra từ continuation token; không in option ID/value kỹ thuật ra câu trả lời): slot=${selection.slot}${selection.productType ? `; productType=${selection.productType}` : ''}; selections=${JSON.stringify(selection.options.map((option) => ({ optionId: option.optionId, label: option.label, value: option.value, kind: option.kind })))}${budget ? `; priceConstraint=${JSON.stringify({ minPrice: budget.minPrice, maxPrice: budget.maxPrice })}` : ''}${selection.freeText ? `; freeText=${JSON.stringify(selection.freeText)}` : ''}`
}

function buildSystemPrompt() {
  return [
    SALES_AGENT_SYSTEM_PROMPT,
    'Bạn đang chạy trong một model-native tool loop. Hãy dùng tool khi câu hỏi cần giá, trạng thái đang bán, URL, thông số hoặc dữ liệu catalog live. Bạn được phép đưa ra tư vấn định tính hữu ích từ các fact đã có và kiến thức phổ quát, nhưng phải phân biệt đó là nhận định tư vấn chứ không phải dữ liệu Fastlane.',
    'Nếu người dùng tiếp tục bằng một câu ngắn chỉ có tên xe, hãy đọc lịch sử để kế thừa ý định và tiêu chí của lượt trước. Ví dụ sau câu “so sánh pin và tốc độ”, câu “VF7 và VF8” vẫn là yêu cầu compare_vehicles.',
    'Nếu cần nhiều mẫu xe, gọi resolve_vehicle_references một lần với nguyên cụm tên xe; sau khi nhận kết quả mới gọi compare_vehicles hoặc get_vehicle_details bằng các ID trong kết quả. Không tự tạo UUID.',
    'Nếu prompt có SERVER_VALIDATED_INTERACTION, các value loại product là ID canonical do server xác thực và priceConstraint là bộ lọc bắt buộc. Dùng trực tiếp chúng; không resolve lại và không gọi request_user_choice cho slot đã được điền.',
    'Chỉ hỏi phiên bản/năm khi tool trả về dữ liệu hoặc ambiguity chứng minh có nhiều dữ liệu theo phiên bản/năm. Nếu database chỉ có dữ liệu cấp mẫu xe, trả lời ở cấp mẫu xe.',
    'Ngân sách, nhu cầu sử dụng và mẫu xe cụ thể không phải lúc nào cũng bắt buộc. Nếu catalog đã đủ để đưa ra 3–4 gợi ý hợp lý, hãy tư vấn ngay rồi hỏi tối đa một câu tùy chọn; chỉ gọi request_user_choice khi thiếu lựa chọn làm thay đổi đáng kể kết quả.',
    'Với yêu cầu gợi ý phụ kiện chung, gọi discover_accessories ngay mà không bắt buộc hỏi mẫu xe hoặc loại xe. Chỉ hỏi thêm khi người dùng yêu cầu xác nhận tương thích với một mẫu cụ thể.',
    'Agent không đánh giá số lượng tồn kho. isActive=true nghĩa là sản phẩm đang được bán; nếu người dùng hỏi số lượng còn hàng, giải thích ngắn rằng dữ liệu này không thuộc phạm vi tư vấn hiện tại và vẫn tiếp tục bằng thông tin sản phẩm đang bán.',
    'Tool có thể cung cấp url nội bộ do server tạo. Khi hữu ích, dùng đúng URL đó trong Markdown link; không sửa slug, không tự tạo và không dùng URL ngoài danh sách tool.',
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
  const history = limitSalesAgentHistory(options.history ?? [])
  const debugContext = {
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    ...(options.messageId ? { messageId: options.messageId } : {}),
  }
  const startedAt = Date.now()
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
    allowedNavigationHrefs: new Set(),
    debugContext,
    catalogConstraint: validatedCatalogConstraint(options.message, history, options.interactionSelection),
    fulfilledInteractionSlot: options.interactionSelection?.slot,
    interactionRequest: undefined,
  }
  recordSalesAgentDebugEvent('run.started', debugContext, {
    message: options.message,
    history,
    pageContext: options.pageContext,
    interactionSelection: options.interactionSelection,
    catalogConstraint: state.catalogConstraint,
    provider: provider.provider,
    model: provider.modelId,
  })

  try {
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

    const harnessResult: SalesAgentHarnessResult = {
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
      allowedNavigationHrefs: [...state.allowedNavigationHrefs],
      ...(state.interactionRequest ? {
        interaction: await buildSalesAgentInteraction(state.interactionRequest, {
          conversationId: options.conversationId ?? 'guest',
          messageId: options.messageId ?? 'message',
        }),
      } : {}),
    }
    recordSalesAgentDebugEvent('run.completed', debugContext, {
      durationMs: Date.now() - startedAt,
      text: harnessResult.text,
      finishReason: harnessResult.finishReason,
      steps: harnessResult.steps,
      toolCalls: harnessResult.toolCalls,
      toolNames: harnessResult.toolNames,
      usage: harnessResult.usage,
      allowedNavigationHrefs: harnessResult.allowedNavigationHrefs,
      interaction: harnessResult.interaction,
    })
    return harnessResult
  } catch (error) {
    recordSalesAgentDebugEvent('run.failed', debugContext, {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      toolCalls: state.totalToolCalls,
      toolNames: state.toolNames,
    })
    throw error
  } finally {
    runSignal.cleanup()
  }
}

export { NO_DATA_RESPONSE }
