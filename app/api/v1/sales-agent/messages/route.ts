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
import { runTurn, type SalesAgentFinishReason } from '@/lib/sales-agent/orchestrator/run-turn'
import { composeTurnResponse } from '@/lib/sales-agent/response/composer'
import { catalogCacheEngine } from '@/lib/sales-agent/cache/catalog-cache'
import { validateSuggestionSelection } from '@/lib/sales-agent/suggestions/validation'
import {
  evaluateInputGuardrails,
  evaluateOutputGuardrails,
  evaluateRateLimit,
} from '@/lib/sales-agent/guardrails'

export const runtime = 'nodejs'

export type SalesAgentSseEvent =
  | { type: 'meta'; conversationId: string; messageId: string }
  | { type: 'tool_status'; tool: string; status: 'running' | 'complete' | 'not_found' | 'error' | 'OK' }
  | { type: 'text_delta'; delta: string }
  | { type: 'turn_view'; viewModel: TurnViewModel }
  | { type: 'done'; provider: string; model: string; finishReason: SalesAgentFinishReason }
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

function fallbackViewModel(conversationId: string, messageId: string, markdown: string): TurnViewModel {
  return {
    schemaVersion: '2.0',
    conversationRef: conversationId,
    turnId: messageId,
    messageId,
    answer: { markdown, completeness: 'NO_EVIDENCE' },
    blocks: [],
    actions: [],
    suggestions: [
      { suggestionId: `retry-${messageId}`, label: 'Thử lại câu hỏi', payload: 'Vui lòng thử lại câu hỏi vừa rồi' },
    ],
    grounding: {
      dataAsOf: new Date().toISOString(),
      warnings: [{ code: 'INTERNAL_FALLBACK', message: 'Hệ thống đã dùng phản hồi dự phòng an toàn.' }],
    },
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
        if (!payload.signal?.aborted) {
          const fallbackText = 'Hệ thống tư vấn AI tạm thời chưa thể hoàn tất câu trả lời. Bạn vui lòng thử lại sau ít phút; FASTLANE sẽ không suy đoán khi chưa có dữ liệu xác minh.'
          const { sanitized } = evaluateOutputGuardrails(fallbackText)
          send({ type: 'tool_status', tool: 'fallback', status: 'error' })
          send({ type: 'text_delta', delta: sanitized })
          send({ type: 'turn_view', viewModel: fallbackViewModel(payload.conversationId, payload.messageId, sanitized) })
          send({ type: 'done', provider: 'fallback', model: 'deterministic', finishReason: 'error' })
        }
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

  // 1. Rate Limiting Guardrail (15 requests/minute per client IP)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anon-client'
  const rateLimit = evaluateRateLimit(clientIp)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau giây lát.' } },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } },
    )
  }

  try {
    const payload = parseSalesAgentMessageRequest(await request.json())
    const conversationId = payload.conversationId || crypto.randomUUID()
    const messageId = crypto.randomUUID()

    if (payload.suggestionSelection) {
      const selectionValidation = validateSuggestionSelection(payload.suggestionSelection, catalogCacheEngine.getSnapshot())
      if (!selectionValidation.valid) {
        recordSalesAgentDebugEvent('suggestion.rejected', { conversationId, messageId }, {
          suggestionId: payload.suggestionSelection.suggestionId,
          reason: selectionValidation.reason,
        })
        return NextResponse.json(
          { error: { code: 'SUGGESTION_STALE', message: 'Gợi ý này đã thay đổi theo danh mục hiện tại. Vui lòng chọn lại.' } },
          { status: 409 },
        )
      }
      if (selectionValidation.staleCatalog) {
        recordSalesAgentDebugEvent('suggestion.revalidated', { conversationId, messageId }, {
          suggestionId: payload.suggestionSelection.suggestionId,
          catalogVersion: payload.suggestionSelection.catalogVersion,
          currentCatalogVersion: catalogCacheEngine.getSnapshot().lastRefreshedAt,
        })
      }
    }

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
        // 2. Pre-LLM Input Guardrails Evaluation (Prompt Injection, Off-Domain, Delimiter Escaping)
        const guardDecision = evaluateInputGuardrails(payload.message, { conversationId, clientKey: clientIp })
        if (guardDecision.action === 'BLOCK' || guardDecision.action === 'REDIRECT_OFF_DOMAIN') {
          const fallbackText =
            guardDecision.fallbackResponse ||
            'Dạ em là Trợ lý tư vấn xe điện FASTLANE. Em chỉ hỗ trợ giải đáp các câu hỏi liên quan đến sản phẩm và dịch vụ của FASTLANE ạ.'

          send({ type: 'tool_status', tool: 'guardrail', status: 'complete' })

          const safeViewModel: TurnViewModel = {
            schemaVersion: '2.0',
            conversationRef: conversationId,
            turnId: messageId,
            messageId,
            answer: { markdown: fallbackText, completeness: 'COMPLETE' },
            blocks: [],
            actions: [],
            suggestions: [
              { suggestionId: 'sug-catalog', label: 'Xem các mẫu xe đang bán', payload: 'Có những mẫu xe nào đang bán?', kind: 'CATALOG_BROWSE' },
              { suggestionId: 'sug-advice', label: 'Tư vấn chọn xe phù hợp', payload: 'Tư vấn chọn xe phù hợp', kind: 'FOLLOW_UP' },
            ],
            grounding: {
              dataAsOf: new Date().toISOString(),
              warnings: [],
            },
          }

          const words = fallbackText.split(/(\s+)/)
          let chunkBuffer = ''
          for (let i = 0; i < words.length; i++) {
            chunkBuffer += words[i]
            if (chunkBuffer.length >= 16 || i === words.length - 1) {
              if (request.signal?.aborted) return
              send({ type: 'text_delta', delta: chunkBuffer })
              chunkBuffer = ''
              await new Promise((resolve) => setTimeout(resolve, 15))
            }
          }
          send({ type: 'turn_view', viewModel: safeViewModel })
          send({ type: 'done', provider: 'guardrail', model: 'defense-pipeline', finishReason: 'stop' })
          return
        }

        const history = limitSalesAgentHistory(
          (payload.guestHistory ?? []).map((item) => ({
            ...item,
            content: redactSalesAgentInput(item.content),
          })),
        )

        recordSalesAgentDebugEvent('request.accepted', { conversationId, messageId }, {
          message: redactSalesAgentInput(payload.message),
          history,
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

        send({ type: 'tool_status', tool: 'thinking', status: 'running' })

        const turnResult = await runTurn({
          input: turnInput,
          history: history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          signal: request.signal,
          context: { conversationId, messageId },
          onToolCall: (toolName) => send({ type: 'tool_status', tool: toolName, status: 'running' }),
          onToolResult: (toolName, res) => {
            const status = res.outcome === 'SUCCESS' || res.outcome === 'NEEDS_INPUT'
              ? 'complete'
              : res.outcome === 'NO_MATCH'
                ? 'not_found'
                : 'error'
            send({ type: 'tool_status', tool: toolName, status })
          },
        })

        const catalogSnapshot = catalogCacheEngine.getSnapshot()
        const catalogProducts = catalogSnapshot.products
          .filter((product) => product.productType !== 'ACCESSORY')
          .map((product) => ({ id: product.id, name: product.name, productType: product.productType }))

        const viewModel = composeTurnResponse({
          rawPlan: turnResult.responsePlan,
          evidence: turnResult.evidence,
          knownEntities: turnResult.knownEntities,
          conversationRef: conversationId,
          turnId: messageId,
          messageId,
          catalogProducts,
          catalogStatus: catalogSnapshot.isSeededFallback ? 'INDEX_ONLY' : 'SYNCED',
          catalogVersion: catalogSnapshot.lastRefreshedAt > 0 ? catalogSnapshot.lastRefreshedAt : undefined,
        })

        recordSalesAgentDebugEvent('suggestion.generated', { conversationId, messageId }, {
          count: viewModel.suggestions.length,
          kinds: viewModel.suggestions.map((suggestion) => suggestion.kind).filter(Boolean),
          entityCount: viewModel.suggestions.reduce((count, suggestion) => count + (suggestion.entityIds?.length ?? 0), 0),
          catalogVersion: catalogSnapshot.lastRefreshedAt > 0 ? catalogSnapshot.lastRefreshedAt : undefined,
        })

        // 3. Post-LLM Output Guardrail (Secret Redaction & PII Solicitation Prevention)
        const { sanitized: safeMarkdown } = evaluateOutputGuardrails(viewModel.answer.markdown)
        viewModel.answer.markdown = safeMarkdown || 'FASTLANE chưa có nội dung đủ an toàn để hiển thị cho lượt này.'

        recordSalesAgentDebugEvent('turn.completed', { conversationId, messageId }, {
          text: viewModel.answer.markdown,
          toolCallsCount: turnResult.toolCallsCount,
          stepsCount: turnResult.stepsCount,
          blocksCount: viewModel.blocks.length,
          actionsCount: viewModel.actions.length,
          suggestionsCount: viewModel.suggestions.length,
          suggestionKinds: viewModel.suggestions.map((suggestion) => suggestion.kind).filter(Boolean),
          suggestionEntityCount: viewModel.suggestions.reduce((count, suggestion) => count + (suggestion.entityIds?.length ?? 0), 0),
          catalogStatus: catalogSnapshot.isSeededFallback ? 'INDEX_ONLY' : 'SYNCED',
          catalogVersion: catalogSnapshot.lastRefreshedAt > 0 ? catalogSnapshot.lastRefreshedAt : undefined,
          usage: turnResult.usage,
        })

        // Buffer first, then expose only the completed attempt after output guardrails.
        send({ type: 'tool_status', tool: 'composing', status: 'running' })
        send({ type: 'text_delta', delta: viewModel.answer.markdown })
        send({ type: 'turn_view', viewModel })
        send({
          type: 'done',
          provider: turnResult.provider,
          model: turnResult.model,
          finishReason: turnResult.finishReason,
        })
      },
    })
  } catch (error) {
    if (error instanceof SalesAgentRequestError) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 })
    }
    console.error('Sales Agent request setup failed', error)
    return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: error instanceof Error ? error.message : 'Agent tạm thời chưa thể trả lời.' } }, { status: 503 })
  }
}
