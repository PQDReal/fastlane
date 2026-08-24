import { NextResponse } from 'next/server'

import { isSalesAgentEnabled, isSalesAgentProvisionalStreamEnabled, isSalesAgentScopeInteractionEnabled } from '@/lib/sales-agent/core/flags'
import { redactSalesAgentInput } from '@/lib/sales-agent/core/policy'
import {
  limitSalesAgentHistory,
  SalesAgentRequestError,
  parseSalesAgentMessageRequest,
  type SalesAgentTurnInput,
  type TurnViewModel,
} from '@/lib/sales-agent/contracts'
import { consumeSalesAgentInteractionResponse, validateSalesAgentInteractionResponse } from '@/lib/sales-agent/interactions/token'
import { validateSalesAgentInteractionProducts, validateSalesAgentScopeInteraction, SalesAgentInteractionValidationError } from '@/lib/sales-agent/interactions/validation'
import { buildSalesAgentScopeInteraction } from '@/lib/sales-agent/interactions/scope'
import { knowledgeScopeCatalogEngine } from '@/lib/sales-agent/knowledge/scope-catalog'
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
  | { type: 'text_delta'; delta: string; provisional?: boolean; attempt?: number }
  | { type: 'text_reset'; reason: 'retry' | 'final_reconciliation' }
  | { type: 'turn_view'; viewModel: TurnViewModel }
  | { type: 'done'; provider: string; model: string; finishReason: SalesAgentFinishReason }
  | { type: 'error'; code: string; message: string; retryable: boolean }

function event(value: SalesAgentSseEvent) {
  return `data: ${JSON.stringify(value)}\n\n`
}

function responseHeaders(requestId?: string) {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(requestId ? { 'X-Sales-Agent-Request-Id': requestId } : {}),
  }
}

function jsonWithRequestId(body: unknown, requestId: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Sales-Agent-Request-Id', requestId)
  return NextResponse.json(body, { ...init, headers })
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
  requestId: string
  conversationId: string
  messageId: string
  signal?: AbortSignal
  run: (send: (value: SalesAgentSseEvent) => void) => Promise<void>
}) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    async start(controller) {
      const streamStartedAt = Date.now()
      const send = (value: SalesAgentSseEvent) => {
        if (payload.signal?.aborted) return
        controller.enqueue(encoder.encode(event(value)))
      }
      send({ type: 'meta', conversationId: payload.conversationId, messageId: payload.messageId })
      try {
        if (payload.signal?.aborted) return
        await payload.run(send)
      } catch (error) {
        const aborted = Boolean(payload.signal?.aborted)
        const fallbackSent = !aborted
        console.error('Sales Agent request failed', { reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' })
        recordSalesAgentDebugEvent('stream.failed', {
          requestId: payload.requestId,
          conversationId: payload.conversationId,
          messageId: payload.messageId,
        }, {
          phase: 'stream',
          reasonCode: aborted ? 'CLIENT_ABORTED' : 'STREAM_ERROR',
          aborted,
          fallbackSent,
          elapsedMs: Date.now() - streamStartedAt,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        if (fallbackSent) {
          const fallbackText = 'Hệ thống tư vấn AI tạm thời chưa thể hoàn tất câu trả lời. Bạn vui lòng thử lại sau ít phút; FASTLANE sẽ không suy đoán khi chưa có dữ liệu xác minh.'
          const { sanitized } = evaluateOutputGuardrails(fallbackText)
          send({ type: 'tool_status', tool: 'fallback', status: 'error' })
          send({ type: 'text_delta', delta: sanitized, provisional: false })
          send({ type: 'turn_view', viewModel: fallbackViewModel(payload.conversationId, payload.messageId, sanitized) })
          send({ type: 'done', provider: 'fallback', model: 'deterministic', finishReason: 'error' })
        }
      } finally {
        controller.close()
      }
    },
  }), { headers: responseHeaders(payload.requestId) })
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const requestStartedAt = Date.now()
  if (!isSalesAgentEnabled()) {
    recordSalesAgentDebugEvent('request.rejected', { requestId }, {
      phase: 'feature_gate',
      reasonCode: 'SALES_AGENT_DISABLED',
      elapsedMs: Date.now() - requestStartedAt,
    })
    return jsonWithRequestId({ error: { code: 'SALES_AGENT_DISABLED', message: 'Sales Agent hiện chưa được bật.' } }, requestId, { status: 503 })
  }

  // 1. Rate Limiting Guardrail (15 requests/minute per client IP)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anon-client'
  const rateLimitStartedAt = Date.now()
  const rateLimit = evaluateRateLimit(clientIp)
  recordSalesAgentDebugEvent('guardrail.rate_limit.evaluated', { requestId }, {
    allowed: rateLimit.allowed,
    remaining: rateLimit.remaining,
    resetInSeconds: rateLimit.resetInSeconds,
    elapsedMs: Date.now() - rateLimitStartedAt,
  })
  if (!rateLimit.allowed) {
    recordSalesAgentDebugEvent('request.rejected', { requestId }, {
      phase: 'rate_limit',
      reasonCode: 'RATE_LIMITED',
      remaining: rateLimit.remaining,
      resetInSeconds: rateLimit.resetInSeconds,
      elapsedMs: Date.now() - requestStartedAt,
    })
    return jsonWithRequestId(
      { error: { code: 'RATE_LIMITED', message: 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau giây lát.' } },
      requestId,
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } },
    )
  }

  try {
    const payload = parseSalesAgentMessageRequest(await request.json())
    const conversationId = payload.conversationId || crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const debugContext = { requestId, conversationId, messageId }

    if (payload.suggestionSelection) {
      const selectionValidation = validateSuggestionSelection(payload.suggestionSelection, catalogCacheEngine.getSnapshot())
      if (!selectionValidation.valid) {
        recordSalesAgentDebugEvent('suggestion.rejected', debugContext, {
          suggestionId: payload.suggestionSelection.suggestionId,
          reason: selectionValidation.reason,
        })
        return jsonWithRequestId(
          { error: { code: 'SUGGESTION_STALE', message: 'Gợi ý này đã thay đổi theo danh mục hiện tại. Vui lòng chọn lại.' } },
          requestId,
          { status: 409 },
        )
      }
      if (selectionValidation.staleCatalog) {
        recordSalesAgentDebugEvent('suggestion.revalidated', debugContext, {
          suggestionId: payload.suggestionSelection.suggestionId,
          catalogVersion: payload.suggestionSelection.catalogVersion,
          currentCatalogVersion: catalogCacheEngine.getSnapshot().lastRefreshedAt,
        })
      }
    }

    let interactionSelection: Awaited<ReturnType<typeof consumeSalesAgentInteractionResponse>> | undefined
    let trustedScope: Awaited<ReturnType<typeof validateSalesAgentScopeInteraction>> | undefined

    if (payload.interactionResponse) {
      let validatedSelection: ReturnType<typeof validateSalesAgentInteractionResponse>
      try {
        validatedSelection = validateSalesAgentInteractionResponse(payload.interactionResponse, conversationId)
      } catch (error) {
        recordSalesAgentDebugEvent('interaction.rejected', debugContext, {
          phase: 'token_validation',
          reasonCode: 'INVALID_INTERACTION',
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        return jsonWithRequestId({ error: { code: 'INVALID_INTERACTION', message: error instanceof Error ? error.message : 'Lựa chọn tương tác không hợp lệ.' } }, requestId, { status: 400 })
      }
      try {
        if (validatedSelection.payload.slot === 'knowledge_scope') {
          trustedScope = validateSalesAgentScopeInteraction(
            validatedSelection.payload,
            validatedSelection.selectedOptions,
            await knowledgeScopeCatalogEngine.getSnapshotAsync(),
          )
        } else {
          await validateSalesAgentInteractionProducts(validatedSelection.payload, validatedSelection.selectedOptions)
        }
      } catch (error) {
        if (error instanceof SalesAgentInteractionValidationError) {
          recordSalesAgentDebugEvent('interaction.rejected', debugContext, {
            phase: 'catalog_validation',
            reasonCode: 'INVALID_INTERACTION',
            error: { name: error.name, message: error.message },
          })
          return jsonWithRequestId({ error: { code: 'INVALID_INTERACTION', message: error.message } }, requestId, { status: 400 })
        }
        throw error
      }
      try {
        interactionSelection = consumeSalesAgentInteractionResponse(payload.interactionResponse, conversationId)
      } catch (error) {
        recordSalesAgentDebugEvent('interaction.rejected', debugContext, {
          phase: 'token_consume',
          reasonCode: 'INVALID_INTERACTION',
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        })
        return jsonWithRequestId({ error: { code: 'INVALID_INTERACTION', message: error instanceof Error ? error.message : 'Lựa chọn tương tác không hợp lệ.' } }, requestId, { status: 400 })
      }
    }

    return streamResponse({
      requestId,
      conversationId,
      messageId,
      signal: request.signal,
      run: async (send) => {
        const streamStartedAt = Date.now()
        let provisionalDeltaCount = 0
        let resetCount = 0
        let firstProvisionalDeltaMs: number | undefined
        let firstFinalDeltaMs: number | undefined
        // 2. Pre-LLM Input Guardrails Evaluation (Prompt Injection, Off-Domain, Delimiter Escaping)
        const guardrailStartedAt = Date.now()
        const guardDecision = evaluateInputGuardrails(payload.message, { conversationId, clientKey: clientIp })
        recordSalesAgentDebugEvent('guardrail.input.evaluated', debugContext, {
          action: guardDecision.action,
          reasonCode: guardDecision.reasonCode,
          riskVector: {
            injectionRisk: guardDecision.riskVector.injectionRisk,
            dataExfiltrationRisk: guardDecision.riskVector.dataExfiltrationRisk,
            obfuscationRisk: guardDecision.riskVector.obfuscationRisk,
            domainRelevance: guardDecision.riskVector.domainRelevance,
            detectedTechniques: guardDecision.riskVector.detectedTechniques,
          },
          elapsedMs: Date.now() - guardrailStartedAt,
        })
        if (guardDecision.action === 'BLOCK' || guardDecision.action === 'REDIRECT_OFF_DOMAIN') {
          recordSalesAgentDebugEvent('guardrail.input.blocked', debugContext, {
            action: guardDecision.action,
            reasonCode: guardDecision.reasonCode,
          })
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
              send({ type: 'text_delta', delta: chunkBuffer, provisional: false })
              chunkBuffer = ''
              await new Promise((resolve) => setTimeout(resolve, 15))
            }
          }
          send({ type: 'turn_view', viewModel: safeViewModel })
          send({ type: 'done', provider: 'guardrail', model: 'defense-pipeline', finishReason: 'stop' })
          recordSalesAgentDebugEvent('turn.completed', debugContext, {
            outcome: 'GUARDRAIL_REDIRECT',
            provider: 'guardrail',
            model: 'defense-pipeline',
            finishReason: 'stop',
            toolCallsCount: 0,
            stepsCount: 0,
            elapsedMs: Date.now() - streamStartedAt,
          })
          recordSalesAgentDebugEvent('stream.completed', debugContext, {
            provider: 'guardrail',
            model: 'defense-pipeline',
            finishReason: 'stop',
            ttftMs: Date.now() - streamStartedAt,
            totalMs: Date.now() - streamStartedAt,
            provisionalDeltaCount: 0,
            resetCount: 0,
            guardrail: true,
          })
          return
        }

        const history = limitSalesAgentHistory(
          (payload.guestHistory ?? []).map((item) => ({
            ...item,
            content: redactSalesAgentInput(item.content),
          })),
        )

        recordSalesAgentDebugEvent('request.accepted', debugContext, {
          message: redactSalesAgentInput(payload.message),
          history,
        })

        const redactedUserText = redactSalesAgentInput(payload.message)

        const turnInput: SalesAgentTurnInput = interactionSelection
          ? {
              kind: 'INTERACTION_SUBMIT',
              interactionId: interactionSelection.payload.interactionId,
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
          trustedScope,
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
          ...(isSalesAgentProvisionalStreamEnabled()
            ? {
                onTextDelta: (delta: string, metadata: { provisional: true; attempt: number }) => {
                  if (request.signal?.aborted || !delta) return
                  provisionalDeltaCount += 1
                  firstProvisionalDeltaMs ??= Date.now() - streamStartedAt
                  send({ type: 'text_delta', delta, provisional: metadata.provisional, attempt: metadata.attempt })
                },
                onTextReset: (reason: 'retry' | 'final_reconciliation') => {
                  resetCount += 1
                  send({ type: 'text_reset', reason })
                },
              }
            : {}),
        })
        if (request.signal?.aborted) return

        const catalogSnapshot = catalogCacheEngine.getSnapshot()
        const catalogProducts = catalogSnapshot.products
          .filter((product) => product.productType !== 'ACCESSORY')
          .map((product) => ({ id: product.id, name: product.name, productType: product.productType }))

        const latestKnowledgeResult = typeof (turnResult.evidence as any)?.getLatestToolResult === 'function'
          ? (turnResult.evidence as any).getLatestToolResult('search_knowledge')
          : null
        const interaction = isSalesAgentScopeInteractionEnabled()
          ? buildSalesAgentScopeInteraction(latestKnowledgeResult, { conversationId, messageId })
          : null

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
          interaction: interaction ?? undefined,
        })

        recordSalesAgentDebugEvent('suggestion.generated', debugContext, {
          count: viewModel.suggestions.length,
          kinds: viewModel.suggestions.map((suggestion) => suggestion.kind).filter(Boolean),
          entityCount: viewModel.suggestions.reduce((count, suggestion) => count + (suggestion.entityIds?.length ?? 0), 0),
          catalogVersion: catalogSnapshot.lastRefreshedAt > 0 ? catalogSnapshot.lastRefreshedAt : undefined,
        })

        // 3. Post-LLM Output Guardrail (Secret Redaction & PII Solicitation Prevention)
        const outputGuardrail = evaluateOutputGuardrails(viewModel.answer.markdown)
        const { sanitized: safeMarkdown } = outputGuardrail
        viewModel.answer.markdown = safeMarkdown || 'FASTLANE chưa có nội dung đủ an toàn để hiển thị cho lượt này.'

        recordSalesAgentDebugEvent('turn.completed', debugContext, {
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
          outputGuardrail: {
            redactedCount: outputGuardrail.redactedCount,
            solicitedPii: outputGuardrail.solicitedPii,
          },
        })

        // The provisional stream is intentionally replaceable. The sanitized
        // turn_view is the canonical text persisted/displayed for later turns.
        send({ type: 'tool_status', tool: 'composing', status: 'running' })
        if (provisionalDeltaCount > 0) {
          resetCount += 1
          send({ type: 'text_reset', reason: 'final_reconciliation' })
        }
        firstFinalDeltaMs = Date.now() - streamStartedAt
        send({ type: 'text_delta', delta: viewModel.answer.markdown, provisional: false })
        send({ type: 'turn_view', viewModel })
        recordSalesAgentDebugEvent('stream.completed', debugContext, {
          ttftMs: firstProvisionalDeltaMs ?? firstFinalDeltaMs,
          firstProvisionalDeltaMs,
          firstFinalDeltaMs,
          totalMs: Date.now() - streamStartedAt,
          provisionalDeltaCount,
          resetCount,
          scopePreflightStatus: latestKnowledgeResult?.diagnostics?.retrieval?.scopePreflightStatus
            ?? latestKnowledgeResult?.diagnostics?.scope?.catalogStatus
            ?? latestKnowledgeResult?.diagnostics?.retrieval?.status,
        })
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
      recordSalesAgentDebugEvent('request.rejected', { requestId }, {
        phase: 'request_parse',
        reasonCode: 'INVALID_REQUEST',
        elapsedMs: Date.now() - requestStartedAt,
        error: { name: error.name, message: error.message },
      })
      return jsonWithRequestId({ error: { code: 'VALIDATION_ERROR', message: error.message } }, requestId, { status: 400 })
    }
    console.error('Sales Agent request setup failed', error)
    recordSalesAgentDebugEvent('request.failed', { requestId }, {
      phase: 'request_setup',
      reasonCode: 'PROVIDER_UNAVAILABLE',
      elapsedMs: Date.now() - requestStartedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return jsonWithRequestId({ error: { code: 'PROVIDER_UNAVAILABLE', message: error instanceof Error ? error.message : 'Agent tạm thời chưa thể trả lời.' } }, requestId, { status: 503 })
  }
}
