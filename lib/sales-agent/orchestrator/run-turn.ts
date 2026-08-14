import 'server-only'

import { generateText, isStepCount, tool, type ToolSet } from 'ai'
import { getSalesAgentLanguageModel } from '../providers/registry'
import { SALES_AGENT_PROMPT_MANIFEST } from '../prompt/manifest'
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

export type RunTurnOptions = {
  input: SalesAgentTurnInput
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  budget?: SalesAgentRunBudget
  selectedProvider?: string
  signal?: AbortSignal
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

  // Construct toolset dynamically from TOOL_CONTRACTS
  const tools: ToolSet = {}

  for (const [key, contract] of Object.entries(TOOL_CONTRACTS)) {
    const toolName = key as DataToolName
    tools[toolName] = tool({
      description: contract.description,
      inputSchema: contract.inputSchema,
      execute: async (args: any, context?: any) => {
        const toolCallId = context?.toolCallId || `call-${Date.now()}`
        toolCallsCount++
        options.onToolCall?.(toolName, toolCallId)

        // Apply bindings
        const bindingRes = bindings.applyBindings(args)
        if (bindingRes.conflict) {
          const obsId = `obs-conflict-${toolCallId}`
          const obs = {
            observationId: obsId,
            toolCallId,
            outcome: 'REJECTED' as const,
            issueCodes: ['CONSTRAINT_CONFLICT'],
            inputHash: JSON.stringify(args),
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

  // Extract user text
  const userText = options.input.kind === 'USER_MESSAGE'
    ? options.input.text
    : options.input.kind === 'SUGGESTION_SELECT'
      ? `Người dùng đã chọn gợi ý: ${options.input.suggestionId}`
      : options.input.kind === 'INTERACTION_SUBMIT'
        ? `Người dùng đã gửi lựa chọn: ${options.input.selectedOptionIds.join(', ')}`
        : `Người dùng kích hoạt hành động: ${options.input.actionId}`

  // Format messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(options.history ?? []).slice(-budget.maxHistoryTurns).map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userText },
  ]

  const response = await generateText({
    model: lm.model,
    system: SALES_AGENT_PROMPT_MANIFEST.systemPrompt,
    messages,
    tools,
    stopWhen: [isStepCount(budget.maxModelSteps)],
    abortSignal: options.signal,
    maxOutputTokens: budget.maxOutputTokens,
  })

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

  narrative.push({
    kind: 'ADVICE',
    markdown: response.text || 'Dưới đây là thông tin tư vấn theo catalog Fastlane.',
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
    suggestionIntents: [],
    actionIntents: [],
  }

  return {
    text: response.text,
    responsePlan,
    knownEntities,
    bindings,
    evidence,
    toolCallsCount,
    stepsCount: response.steps?.length ?? 1,
    finishReason: response.finishReason,
  }
}
