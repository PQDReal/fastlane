import { NextResponse } from 'next/server'

import { isSalesAgentEnabled } from '@/lib/sales-agent/core/flags'
import { buildSalesAgentProviderInput, redactSalesAgentInput } from '@/lib/sales-agent/core/policy'
import { SalesAgentRequestError, parseSalesAgentMessageRequest, type SalesAgentSseEvent } from '@/lib/sales-agent/contracts/message'
import { completeWithSalesAgentProvider } from '@/lib/sales-agent/providers/registry'
import { executeSalesAgentTools, serializeSalesAgentToolResults } from '@/lib/sales-agent/tools/registry'
import { planSalesAgentTools } from '@/lib/sales-agent/tools/planner'
import { navigationActionMarkdown, resolveSalesAgentNavigation, stripUntrustedNavigation } from '@/lib/sales-agent/navigation/resolver'

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
  run: (send: (value: SalesAgentSseEvent) => void) => Promise<void>
}) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (value: SalesAgentSseEvent) => controller.enqueue(encoder.encode(event(value)))
      send({ type: 'meta', conversationId: payload.conversationId, messageId: payload.messageId })
      try {
        await payload.run(send)
      } catch (error) {
        console.error('Sales Agent provider request failed', { reason: error instanceof Error ? error.name : 'UNKNOWN_ERROR' })
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
    return streamResponse({ conversationId, messageId, run: async (send) => {
      const history = (payload.guestHistory ?? []).map((item) => ({ ...item, content: redactSalesAgentInput(item.content) }))
      // Read-only tools are planned and executed by Fastlane. A slow lookup
      // must not hold the transcript open; the provider then answers without
      // dynamic facts instead of guessing them.
      const plan = await withFallback(planSalesAgentTools(payload.message), TOOL_TIMEOUT_MS, { calls: [] })
      plan.calls.forEach((call) => send({ type: 'tool_status', tool: call.name, status: 'running' }))
      const toolResults = await withFallback(executeSalesAgentTools(plan.calls), TOOL_TIMEOUT_MS, [])
      toolResults.forEach((toolResult) => send({ type: 'tool_status', tool: toolResult.tool, status: toolResult.status }))
      const input = buildSalesAgentProviderInput(redactSalesAgentInput(payload.message), history, payload.pageContext, serializeSalesAgentToolResults(toolResults))
      const result = await completeWithTimeout(input)
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
