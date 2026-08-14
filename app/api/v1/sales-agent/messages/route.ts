import { NextResponse } from 'next/server'

import { isSalesAgentEnabled } from '@/lib/sales-agent/core/flags'
import { redactSalesAgentInput } from '@/lib/sales-agent/core/policy'
import {
  limitSalesAgentHistory,
  SalesAgentRequestError,
  parseSalesAgentMessageRequest,
  type SalesAgentTurnInput,
  type TurnViewModel,
} from '@/lib/sales-agent/contracts'
import { consumeSalesAgentInteractionResponse, validateSalesAgentInteractionResponse } from '@/lib/sales-agent/interactions/token'
import { validateSalesAgentInteractionProducts, SalesAgentInteractionValidationError } from '@/lib/sales-agent/interactions/validation'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'
import { runTurn } from '@/lib/sales-agent/orchestrator/run-turn'
import { composeTurnResponse } from '@/lib/sales-agent/response/composer'

export const runtime = 'nodejs'

export type SalesAgentSseEvent =
  | { type: 'meta'; conversationId: string; messageId: string }
  | { type: 'tool_status'; tool: string; status: 'running' | 'complete' | 'not_found' | 'error' | 'OK' }
  | { type: 'text_delta'; delta: string }
  | { type: 'turn_view'; viewModel: TurnViewModel }
  | { type: 'done'; provider: string; model: string; finishReason: 'stop' | 'requires_input' }
  | { type: 'error'; code: string; message: string; retryable: boolean }

function event(value: SalesAgentSseEvent) {
  return `data: ${JSON.stringify(value)}\n\n`
}

function responseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
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
        console.error('Sales Agent request failed', { reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' })
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

    return streamResponse({
      conversationId,
      messageId,
      signal: request.signal,
      run: async (send) => {
        const history = limitSalesAgentHistory(
          (payload.guestHistory ?? []).map((item) => ({
            ...item,
            content: redactSalesAgentInput(item.content),
          })),
        )

        recordSalesAgentDebugEvent('request.accepted', { conversationId, messageId }, {
          message: redactSalesAgentInput(payload.message),
          history,
          pageContext: payload.pageContext,
        })

        const redactedUserText = redactSalesAgentInput(payload.message)

        const turnInput: SalesAgentTurnInput = interactionSelection
          ? {
              kind: 'INTERACTION_SUBMIT',
              interactionId: interactionSelection.payload.slot,
              selectedOptionIds: interactionSelection.selectedOptions.map((o) => o.optionId),
              freeText: interactionSelection.freeText ? redactSalesAgentInput(interactionSelection.freeText) : undefined,
              continuationToken: payload.interactionResponse?.continuationToken || 'valid-token',
            }
          : {
              kind: 'USER_MESSAGE',
              text: redactedUserText,
            }

        const turnResult = await runTurn({
          input: turnInput,
          history: history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          signal: request.signal,
          onToolCall: (toolName) => send({ type: 'tool_status', tool: toolName, status: 'running' }),
          onToolResult: (toolName, res) => {
            const status = res.outcome === 'SUCCESS' ? 'complete' : res.outcome === 'NO_MATCH' ? 'not_found' : 'running'
            send({ type: 'tool_status', tool: toolName, status: status as any })
          },
        })

        const viewModel = composeTurnResponse({
          rawPlan: turnResult.responsePlan,
          evidence: turnResult.evidence,
          knownEntities: turnResult.knownEntities,
          conversationRef: conversationId,
          turnId: messageId,
          messageId,
        })

        recordSalesAgentDebugEvent('turn.completed', { conversationId, messageId }, {
          text: viewModel.answer.markdown,
          toolCallsCount: turnResult.toolCallsCount,
          stepsCount: turnResult.stepsCount,
          blocksCount: viewModel.blocks.length,
          actionsCount: viewModel.actions.length,
          suggestionsCount: viewModel.suggestions.length,
        })

        // Stream structured turn_view event and text_delta
        send({ type: 'turn_view', viewModel })
        send({ type: 'text_delta', delta: viewModel.answer.markdown })
        send({ type: 'done', provider: 'default', model: 'orchestrator', finishReason: 'stop' })
      },
    })
  } catch (error) {
    if (error instanceof SalesAgentRequestError) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 })
    }
    console.error('Sales Agent request setup failed', { reason: error instanceof Error ? error.name : 'UNKNOWN_ERROR' })
    return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Agent tạm thời chưa thể trả lời.' } }, { status: 503 })
  }
}
