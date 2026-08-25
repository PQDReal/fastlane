import 'server-only'

import { isStepCount, streamText, tool, type ToolSet } from 'ai'
import { getAvailableFallbackLanguageModels, getSalesAgentLanguageModel } from '../providers/registry'
import { apiKeyPoolManager } from '../providers/key-pool'
import { createSalesAgentLanguageModel, type SalesAgentLanguageModel } from '../providers/ai-sdk'
import { getSalesAgentSystemPrompt } from '../prompt/manifest'
import { executeDataTool } from '../tools/definitions'
import {
  DEFAULT_RUN_BUDGET,
  TOOL_CONTRACTS,
  type AgentResponsePlan,
  type DataToolName,
  type FactPointer,
  type PlannedNarrativeItem,
  type SalesAgentRunBudget,
  type SalesAgentTurnInput,
  type ToolResult,
} from '../contracts'
import { KnownEntityLedger } from './ledgers/known-entities'
import { BindingLedger } from './ledgers/bindings'
import { EvidenceLedger } from './ledgers/evidence'
import { requiredAfterSalesLookup } from './after-sales-intent'
import { canonicalizeRequiredToolInput } from './required-tool-input'
import { requiresWarrantyKnowledgeLookup } from './warranty-intent'
import {
  findOfficialMotorbikeOwnerManual,
  MOTORBIKE_WARRANTY_INTERNAL_URL,
} from '@/lib/after-sales/motorbike-warranty-policy'
import { appendRequiredDataCitations } from '../response/canonical-citations'

export type RunTurnOptions = {
  input: SalesAgentTurnInput
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  budget?: SalesAgentRunBudget
  selectedProvider?: string
  signal?: AbortSignal
  onTextDelta?: (delta: string) => void
  onToolCall?: (toolName: string, callId: string) => void
  onToolResult?: (toolName: string, result: ToolResult) => void
}

export type RunTurnResult = {
  text: string
  responsePlan: AgentResponsePlan
  knownEntities: KnownEntityLedger
  bindings: BindingLedger
  evidence: EvidenceLedger
  toolCallsCount: number
  stepsCount: number
  finishReason: string
}

export async function runTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  const budget = options.budget ?? DEFAULT_RUN_BUDGET
  const knownEntities = new KnownEntityLedger()
  const bindings = new BindingLedger()
  const evidence = new EvidenceLedger()

  let toolCallsCount = 0
  const lm = await getSalesAgentLanguageModel(options.selectedProvider as any)
  const userText = options.input.kind === 'USER_MESSAGE'
    ? options.input.text
    : options.input.kind === 'SUGGESTION_SELECT'
      ? `Người dùng đã chọn gợi ý: ${options.input.suggestionId}`
      : options.input.kind === 'INTERACTION_SUBMIT'
        ? `Người dùng đã gửi lựa chọn: ${options.input.selectedOptionIds.join(', ')}`
        : `Người dùng kích hoạt hành động: ${options.input.actionId}`
  const afterSalesLookup = requiredAfterSalesLookup(userText)
  const officialManual = findOfficialMotorbikeOwnerManual(userText)
  const officialManualLookup = Boolean(officialManual)
  const warrantyKnowledgeLookup = requiresWarrantyKnowledgeLookup(userText)
  const turnRoutingPrompt = officialManual
    ? [
        '## ĐIỀU HƯỚNG BẮT BUỘC CHO LƯỢT HIỆN TẠI:',
        `- Câu hỏi đã khớp tài liệu PDF chính thức "${officialManual.label}" ở mức LINK_ONLY.`,
        '- Bước đầu tiên chỉ gọi search_user_manuals; không phát văn bản, không hỏi lại đời xe trước khi có kết quả tool.',
        '- Sau tool, tự soạn câu trả lời như bình thường: nêu đúng label, nói rõ nội dung chưa được hệ thống trích xuất, dùng nguyên sourceUrl và internalUrl tool trả về.',
      ].join('\n')
    : warrantyKnowledgeLookup
      ? [
          '## ĐIỀU HƯỚNG BẮT BUỘC CHO LƯỢT HIỆN TẠI:',
          '- Câu hỏi cần đối chiếu chính sách bảo hành pin xe máy điện đã xác minh.',
          '- Sau khi gọi search_knowledge, phải dùng đúng internalUrl trong snippet; canonical route của nguồn này là:',
          `  ${MOTORBIKE_WARRANTY_INTERNAL_URL}`,
        ].join('\n')
      : ''
  const turnSystemPrompt = [getSalesAgentSystemPrompt(), turnRoutingPrompt]
    .filter(Boolean)
    .join('\n\n')

  // Construct toolset dynamically from TOOL_CONTRACTS
  const tools: ToolSet = {}

  for (const [key, contract] of Object.entries(TOOL_CONTRACTS)) {
    const toolName = key as DataToolName
    tools[key] = tool({
      description: contract.description,
      inputSchema: contract.inputSchema,
      execute: async (input: any) => {
        const canonicalInput = canonicalizeRequiredToolInput(toolName, input, {
          userText,
          afterSalesLookup,
          officialManualLookup,
          warrantyKnowledgeLookup,
        })
        const toolCallId = `call-${toolName}-${Date.now()}-${++toolCallsCount}`
        options.onToolCall?.(toolName, toolCallId)

        // Apply bindings
        const bindingRes = bindings.applyBindings(canonicalInput)
        if (bindingRes.conflict) {
          const obsId = `obs-conflict-${toolCallId}`
          const obs = {
            observationId: obsId,
            toolCallId,
            outcome: 'REJECTED' as const,
            issueCodes: ['CONSTRAINT_CONFLICT'],
            inputHash: JSON.stringify(canonicalInput),
            readAt: new Date().toISOString(),
          }
          evidence.recordObservation(obs)
          return {
            schemaVersion: '2.0',
            outcome: 'REJECTED',
            tool: toolName,
            issues: [{
              code: 'CONSTRAINT_CONFLICT',
              message: `Tham số ${bindingRes.conflict.field} xung đột với ràng buộc đã xác nhận.`,
            }],
          }
        }

        const result = await executeDataTool(toolName, bindingRes.effectiveInput, toolCallId)
        evidence.recordToolResult(toolCallId, result)
        options.onToolResult?.(toolName, result)

        // Record known entities in ledger
        if (result.outcome === 'SUCCESS' && result.data) {
          if (toolName === 'browse_catalog' && Array.isArray(result.data.items)) {
            for (const item of result.data.items) {
              knownEntities.addEntity('PRODUCT', item.id, item.name, 'BROWSE', item.productType, {
                slug: item.slug,
                thumbnailUrl: item.thumbnailUrl,
                price: item.price,
                summary: item.summary,
              })
            }
          } else if (toolName === 'resolve_catalog_entities' && Array.isArray(result.data.resolutions)) {
            for (const res of result.data.resolutions) {
              if (res.outcome === 'RESOLVED') {
                knownEntities.addEntity(res.entity.kind, res.entity.id, res.entity.name, 'RESOLVER', res.entity.productType, {
                  slug: res.entity.slug,
                })
              }
            }
          } else if (toolName === 'get_product_details' && Array.isArray(result.data.products)) {
            for (const p of result.data.products) {
              knownEntities.addEntity('PRODUCT', p.productId, p.name, 'DETAILS', p.productType, {
                slug: p.slug,
                thumbnailUrl: p.thumbnailUrl,
                price: p.pricing?.from,
                summary: p.description,
              })
            }
          }
        }

        return {
          outcome: result.outcome,
          completeness: (result as any).completeness ?? 'FULL',
          data: result.data,
          issues: result.issues,
        }
      },
    })
  }

  // Format messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(options.history ?? []).slice(-budget.maxHistoryTurns).map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userText },
  ]

  // Multi-Provider & Multi-Key Failover Engine
  const candidateModels: SalesAgentLanguageModel[] = [lm]
  const fallbacks = await getAvailableFallbackLanguageModels(lm.provider)
  candidateModels.push(...fallbacks)

  let accumulatedText = ''
  let steps: any[] = []
  let finishReason = 'stop'
  let generationSucceeded = false
  let lastError: any = null

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const activeModel = candidateModels[mIdx]
    const availableKeys = apiKeyPoolManager.parseKeysFromEnv(activeModel.config.apiKeyEnv)
    const maxKeyAttempts = Math.max(1, availableKeys.length)

    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      try {
        const currentModel = keyAttempt === 0
          ? activeModel
          : createSalesAgentLanguageModel(activeModel.config)

        const streamResult = streamText({
          model: currentModel.model,
          system: turnSystemPrompt,
          messages,
          tools,
          prepareStep: ({ stepNumber }) => {
            if (stepNumber !== 0) return undefined
            if (afterSalesLookup) {
              return {
                activeTools: [afterSalesLookup.toolName],
                toolChoice: { type: 'tool', toolName: afterSalesLookup.toolName },
              }
            }
            if (warrantyKnowledgeLookup) {
              return {
                activeTools: ['search_knowledge'],
                toolChoice: { type: 'tool', toolName: 'search_knowledge' },
              }
            }
            if (officialManualLookup) {
              return {
                activeTools: ['search_user_manuals'],
                toolChoice: { type: 'tool', toolName: 'search_user_manuals' },
              }
            }
            return undefined
          },
          stopWhen: [isStepCount(budget.maxModelSteps)],
          abortSignal: options.signal,
          maxOutputTokens: budget.maxOutputTokens,
          providerOptions: {
            openai: {
              reasoningEffort: (process.env.SALES_AGENT_OPENAI_REASONING_EFFORT as any) || 'none',
              reasoningSummary: null,
            },
          },
        })

        let currentTurnText = ''
        for await (const delta of streamResult.textStream) {
          currentTurnText += delta
          options.onTextDelta?.(delta)
        }

        accumulatedText = currentTurnText
        const [resolvedSteps, resolvedFinishReason] = await Promise.all([
          streamResult.steps,
          streamResult.finishReason,
        ])

        steps = resolvedSteps || []
        finishReason = resolvedFinishReason || 'stop'
        apiKeyPoolManager.markKeySuccess(currentModel.provider, currentModel.usedApiKey)
        generationSucceeded = true
        break // Break key loop on success
      } catch (err: any) {
        lastError = err
        const usedKey = activeModel.usedApiKey
        apiKeyPoolManager.markKeyError(activeModel.provider, usedKey)
        console.warn(`[ORCHESTRATOR] Generation failed with provider "${activeModel.provider}" (Key: ${usedKey.slice(0, 4)}...): ${err?.message || err}. Attempting failover...`)

        // If tokens were already partially emitted, keep current stream
        if (accumulatedText.length > 0) {
          generationSucceeded = true
          break
        }
      }
    }

    if (generationSucceeded) break // Break provider loop on success
  }

  if (!generationSucceeded) {
    console.error('[ORCHESTRATOR] All primary and fallback language models failed:', lastError)
    accumulatedText = accumulatedText || 'Dạ hiện tại hệ thống kết nối AI đang bận hoặc quá tải. Quý khách vui lòng thử lại sau giây lát hoặc liên hệ hotline FASTLANE để được hỗ trợ trực tiếp.'
    if (options.onTextDelta && accumulatedText) {
      options.onTextDelta(accumulatedText)
    }
  }

  // Extract fact pointers from current turn evidence ledger
  const allEvidence = evidence.getAllEvidence()
  const currentTurnFactPointers: FactPointer[] = allEvidence.flatMap((ev) =>
    ev.facts.map((f) => ({
      factRef: f.factRef,
      evidenceId: ev.evidenceId,
      entityKind: ev.entity.kind,
      entityId: ev.entity.id,
      factPath: f.factPath,
    })),
  )

  const narrative: PlannedNarrativeItem[] = []

  if (currentTurnFactPointers.length > 0) {
    narrative.push({
      kind: 'FASTLANE_FACT',
      presentationKey: 'FACT_SUMMARY',
      facts: [currentTurnFactPointers[0], ...currentTurnFactPointers.slice(1)],
    })
  }

  let parsedSuggestions: any[] = []
  let finalMarkdown = accumulatedText || 'Dưới đây là thông tin tư vấn theo catalog Fastlane.'

  // Parse embedded JSON suggestion intents if the LLM output them at the end of the text
  const suggestionStartIndex = finalMarkdown.search(/\[\s*\{\s*"(label|intent)"/);
  if (suggestionStartIndex !== -1) {
    const possibleJson = finalMarkdown.substring(suggestionStartIndex);

    // 1. Try strict JSON parse first (handles escaped characters best if perfectly valid)
    try {
      const lastCloseBracket = possibleJson.lastIndexOf(']');
      if (lastCloseBracket !== -1) {
        const jsonStr = possibleJson.substring(0, lastCloseBracket + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          parsedSuggestions = parsed.filter(p => p.label && p.intent).map(p => ({ text: p.label, payload: p.intent })).slice(0, 5);
        }
      }
    } catch (e) {
      // Ignore strict parse errors, will fall back to regex
    }

    // 2. Fallback to regex if strict parse failed (e.g. cut-off string by max tokens)
    if (parsedSuggestions.length === 0) {
      const labels = [...possibleJson.matchAll(/"label"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
      const intents = [...possibleJson.matchAll(/"intent"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
      const count = Math.min(labels.length, intents.length, 5);
      for (let i = 0; i < count; i++) {
        parsedSuggestions.push({ text: labels[i], payload: intents[i] });
      }
    }

    // 3. Remove the JSON string (even if cut off) from the user-facing text
    finalMarkdown = finalMarkdown.substring(0, suggestionStartIndex).trim();
  }

  finalMarkdown = appendRequiredDataCitations(finalMarkdown, evidence.getAllToolResults(), {
    afterSalesLookup,
    warrantyKnowledgeLookup,
    officialManualLookup,
  })

  narrative.push({
    kind: 'ADVICE',
    markdown: finalMarkdown,
    subjects: knownEntities.toKnownRefs(),
    support: currentTurnFactPointers.slice(0, 5),
  })

  const allObservations = evidence.getAllObservations()
  const negativeObservations = allObservations.filter((o) => o.outcome === 'NO_MATCH' || o.outcome === 'REJECTED' || o.outcome === 'UNAVAILABLE')
  if (negativeObservations.length > 0) {
    narrative.push({
      kind: 'LIMITATION',
      observations: [negativeObservations[0], ...negativeObservations.slice(1)],
    })
  }

  const responsePlan: AgentResponsePlan = {
    schemaVersion: '2.0',
    outcome: negativeObservations.length > 0 && currentTurnFactPointers.length === 0 ? 'DEGRADED' : 'ANSWER',
    narrative,
    views: [],
    suggestionIntents: parsedSuggestions,
    actionIntents: [],
  }

  return {
    text: accumulatedText,
    responsePlan,
    knownEntities,
    bindings,
    evidence,
    toolCallsCount,
    stepsCount: steps?.length ?? 1,
    finishReason: finishReason || 'stop',
  }
}
