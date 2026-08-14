import { NextResponse } from 'next/server'

import { isSalesAgentEnabled, isSalesAgentHarnessEnabled, isSalesAgentInteractionsEnabled } from '@/lib/sales-agent/core/flags'
import { buildSalesAgentProviderInput, redactSalesAgentInput } from '@/lib/sales-agent/core/policy'
import { limitSalesAgentHistory, SalesAgentRequestError, parseSalesAgentMessageRequest, type SalesAgentSseEvent } from '@/lib/sales-agent/contracts/message'
import { runSalesAgentHarness } from '@/lib/sales-agent/orchestrator/harness'
import { consumeSalesAgentInteractionResponse, validateSalesAgentInteractionResponse } from '@/lib/sales-agent/interactions/token'
import { validateSalesAgentInteractionProducts, SalesAgentInteractionValidationError } from '@/lib/sales-agent/interactions/validation'
import { completeWithSalesAgentProvider } from '@/lib/sales-agent/providers/registry'
import { executeSalesAgentTools, serializeSalesAgentToolResults } from '@/lib/sales-agent/tools/registry'
import { planSalesAgentTools } from '@/lib/sales-agent/tools/planner'
import { navigationActionMarkdown, resolveSalesAgentNavigation, stripUntrustedNavigation } from '@/lib/sales-agent/navigation/resolver'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

export const runtime = 'nodejs'

function event(value: SalesAgentSseEvent) {
  return `data: ${JSON.stringify(value)}\n\n`
}

const TOOL_TIMEOUT_MS = 8_000
const PROVIDER_TIMEOUT_MS = 30_000

function responseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  }
}

async function withFallback<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } catch {
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function completeWithTimeout(input: Parameters<typeof completeWithSalesAgentProvider>[0]) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      completeWithSalesAgentProvider({ ...input, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Provider request timed out.'))
        }, PROVIDER_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function streamResponse(payload: {
  conversationId: string
  messageId: string
  signal?: AbortSignal
  run: (send: (value: SalesAgentSseEvent) => void) => Promise<void>
}) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (value: SalesAgentSseEvent) => controller.enqueue(encoder.encode(event(value)))
      send({ type: 'meta', conversationId: payload.conversationId, messageId: payload.messageId })
      try {
        if (payload.signal?.aborted) return
        await payload.run(send)
      } catch (error) {
        console.error('Sales Agent provider request failed', { reason: error instanceof Error ? error.name : 'UNKNOWN_ERROR' })
        recordSalesAgentDebugEvent('stream.failed', { conversationId: payload.conversationId, messageId: payload.messageId }, {
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        send({ type: 'error', code: 'PROVIDER_UNAVAILABLE', message: 'Agent tạm thời chưa thể trả lời. Bạn thử lại sau nhé.', retryable: true })
      } finally {
        controller.close()
      }
    },
  }), { headers: responseHeaders() })
}

export async function POST(request: Request) {
  if (!isSalesAgentEnabled()) {
    return NextResponse.json({ error: { code: 'SALES_AGENT_DISABLED', message: 'Sales Agent hiện chưa được bật.' } }, { status: 503 })
  }

  try {
    const payload = parseSalesAgentMessageRequest(await request.json())
    const conversationId = payload.conversationId || crypto.randomUUID()
    const messageId = crypto.randomUUID()
    let interactionSelection: Awaited<ReturnType<typeof consumeSalesAgentInteractionResponse>> | undefined
    if (payload.interactionResponse) {
      let validatedSelection: ReturnType<typeof validateSalesAgentInteractionResponse>
      try {
        validatedSelection = validateSalesAgentInteractionResponse(payload.interactionResponse, conversationId)
      } catch (error) {
        return NextResponse.json({ error: { code: 'INVALID_INTERACTION', message: error instanceof Error ? error.message : 'Lựa chọn tương tác không hợp lệ.' } }, { status: 400 })
      }
      try {
        await validateSalesAgentInteractionProducts(validatedSelection.payload, validatedSelection.selectedOptions)
      } catch (error) {
        if (error instanceof SalesAgentInteractionValidationError) {
          return NextResponse.json({ error: { code: 'INVALID_INTERACTION', message: error.message } }, { status: 400 })
        }
        throw error
      }
      try {
        interactionSelection = consumeSalesAgentInteractionResponse(payload.interactionResponse, conversationId)
      } catch (error) {
        return NextResponse.json({ error: { code: 'INVALID_INTERACTION', message: error instanceof Error ? error.message : 'Lựa chọn tương tác không hợp lệ.' } }, { status: 400 })
      }
    }
    return streamResponse({ conversationId, messageId, signal: request.signal, run: async (send) => {
      const history = limitSalesAgentHistory((payload.guestHistory ?? []).map((item) => ({ ...item, content: redactSalesAgentInput(item.content) })))
      recordSalesAgentDebugEvent('request.accepted', { conversationId, messageId }, {
        message: redactSalesAgentInput(payload.message),
        history,
        pageContext: payload.pageContext,
        harnessEnabled: isSalesAgentHarnessEnabled(),
        interactionsEnabled: isSalesAgentInteractionsEnabled(),
        interaction: interactionSelection ? {
          slot: interactionSelection.payload.slot,
          productType: interactionSelection.payload.productType,
          options: interactionSelection.selectedOptions,
          freeText: interactionSelection.freeText,
        } : undefined,
      })
      if (isSalesAgentHarnessEnabled()) {
        const result = await runSalesAgentHarness({
          message: payload.message,
          history,
          pageContext: payload.pageContext,
          conversationId,
          messageId,
          signal: request.signal,
          interactionsEnabled: isSalesAgentInteractionsEnabled(),
          interactionSelection: interactionSelection ? {
            slot: interactionSelection.payload.slot,
            productType: interactionSelection.payload.productType,
            options: interactionSelection.selectedOptions,
            freeText: interactionSelection.freeText,
          } : undefined,
          onToolStatus: ({ tool, status }) => send({ type: 'tool_status', tool, status }),
        })
        send({ type: 'text_delta', delta: stripUntrustedNavigation(result.text, result.allowedNavigationHrefs ?? []) })
        if (result.interaction) send({ type: 'interaction', interaction: result.interaction })
        send({ type: 'done', provider: result.provider, model: result.model, finishReason: result.interaction ? 'requires_input' : 'stop' })
        return
      }

      // Read-only tools are planned and executed by Fastlane. A slow lookup
      // must not hold the transcript open; the provider then answers without
      // dynamic facts instead of guessing them.
      const plan = await withFallback(planSalesAgentTools(payload.message, history), TOOL_TIMEOUT_MS, { calls: [] })
      recordSalesAgentDebugEvent('fallback.plan.completed', { conversationId, messageId }, plan)
      plan.calls.forEach((call) => send({ type: 'tool_status', tool: call.name, status: 'running' }))
      const toolResults = await withFallback(executeSalesAgentTools(plan.calls), TOOL_TIMEOUT_MS, [])
      recordSalesAgentDebugEvent('fallback.tools.completed', { conversationId, messageId }, toolResults)
      toolResults.forEach((toolResult) => send({ type: 'tool_status', tool: toolResult.tool, status: toolResult.status }))
      const input = buildSalesAgentProviderInput(redactSalesAgentInput(payload.message), history, payload.pageContext, serializeSalesAgentToolResults(toolResults))
      const result = await completeWithTimeout(input)
      recordSalesAgentDebugEvent('fallback.run.completed', { conversationId, messageId }, { provider: result.provider, model: result.model, text: result.text })
      const navigation = plan.navigationIntent
        ? await withFallback(resolveSalesAgentNavigation(plan.navigationIntent), TOOL_TIMEOUT_MS, null)
        : null
      const safeText = stripUntrustedNavigation(result.text)
      const text = navigation ? `${safeText}\n\n${navigationActionMarkdown(navigation)}` : safeText
      send({ type: 'text_delta', delta: text })
      send({ type: 'done', provider: result.provider, model: result.model, finishReason: 'stop' })
    } })
  } catch (error) {
    if (error instanceof SalesAgentRequestError) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 })
    console.error('Sales Agent request setup failed', { reason: error instanceof Error ? error.name : 'UNKNOWN_ERROR' })
    return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Agent tạm thời chưa thể trả lời.' } }, { status: 503 })
  }
}
