import 'server-only'

import { randomUUID } from 'node:crypto'
import type { SalesAgentInteraction, InteractionField, InteractionOption } from '../contracts/interaction'
import type { ToolResult } from '../contracts'
import { interactionTokenPayloadFromInteraction, signSalesAgentInteractionToken, type InteractionTokenOption } from './token'

type ScopeOption = {
  optionId: string
  label: string
  field: 'vehicleModel' | 'modelYear'
  value: string
  metadata?: Record<string, string | number | boolean>
}

type ScopeField = {
  field: 'vehicleModel' | 'modelYear'
  label: string
  required: boolean
  dependsOn?: 'vehicleModel'
  options: ScopeOption[]
}

function toDisplayOption(option: ScopeOption): InteractionOption {
  return {
    optionId: option.optionId,
    label: option.label,
    field: option.field,
    value: option.value,
    ...(option.metadata ? { metadata: option.metadata } : {}),
  }
}

function optionKey(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/**
 * Older/degraded ambiguity results contain authoritative candidates but no
 * linked fields. Materialize the same signed form shape so a transient scope
 * catalog timeout never degrades the UI into an unclickable text question.
 */
function fieldsFromCandidates(data: any): ScopeField[] {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : []
  if (candidates.length === 0) return []

  const modelsByKey = new Map<string, string>(candidates.flatMap((candidate: any) => {
    const vehicleModel = typeof candidate?.vehicleModel === 'string'
      ? candidate.vehicleModel.trim()
      : ''
    return vehicleModel ? [[optionKey(vehicleModel), vehicleModel] as const] : []
  }))
  const models = [...modelsByKey.values()]

  if (data?.field === 'vehicleModel' && models.length > 0) {
    return [{
      field: 'vehicleModel',
      label: 'Dòng xe',
      required: true,
      options: models.map((vehicleModel) => ({
        optionId: `scope-model-${optionKey(vehicleModel)}`,
        label: vehicleModel,
        field: 'vehicleModel',
        value: vehicleModel,
      })),
    }]
  }

  if (data?.field !== 'modelYear' || models.length !== 1) return []
  const vehicleModel = models[0]
  const yearsSet = new Set<number>()
  for (const candidate of candidates) {
    if (Number.isInteger(candidate?.modelYear)) {
      yearsSet.add(Number(candidate.modelYear))
      continue
    }
    const from = Number.isInteger(candidate?.modelYearFrom) ? Number(candidate.modelYearFrom) : undefined
    const to = Number.isInteger(candidate?.modelYearTo) ? Number(candidate.modelYearTo) : undefined
    if (from != null && (to == null || to === from)) yearsSet.add(from)
    else if (to != null && from == null) yearsSet.add(to)
  }
  const years = [...yearsSet].sort((left, right) => left - right)
  if (years.length === 0) return []

  return [
    {
      field: 'vehicleModel',
      label: 'Dòng xe',
      required: true,
      options: [{
        optionId: `scope-model-${optionKey(vehicleModel)}`,
        label: vehicleModel,
        field: 'vehicleModel',
        value: vehicleModel,
      }],
    },
    {
      field: 'modelYear',
      label: 'Năm áp dụng',
      required: true,
      dependsOn: 'vehicleModel',
      options: years.map((year) => ({
        optionId: `scope-year-${optionKey(vehicleModel)}-${year}`,
        label: String(year),
        field: 'modelYear',
        value: String(year),
        metadata: { vehicleModel },
      })),
    },
  ]
}

/**
 * Materializes the server-owned scope preflight result into a signed form.
 * The values shown to the browser are hints; the token map is the authority
 * consumed by the route on submit.
 */
export function buildSalesAgentScopeInteraction(
  result: ToolResult | null | undefined,
  context: { conversationId: string; messageId: string },
): SalesAgentInteraction | null {
  if (!result || result.outcome !== 'NEEDS_INPUT' || result.tool !== 'search_knowledge') return null
  const data = result.data as any
  if (data?.kind !== 'KNOWLEDGE_SCOPE') return null

  const sourceFields: ScopeField[] = Array.isArray(data.fields) && data.fields.length > 0
    ? data.fields
    : fieldsFromCandidates(data)

  const fields: InteractionField[] = sourceFields
    .slice(0, 2)
    .map((field: ScopeField) => ({
      field: field.field,
      label: field.label,
      required: field.required !== false,
      ...(field.dependsOn ? { dependsOn: field.dependsOn } : {}),
      options: field.options.slice(0, 64).map(toDisplayOption),
    }))
    .filter((field: InteractionField) => field.options.length > 0)
  if (!fields.some((field) => field.field === 'vehicleModel')) return null

  const interactionId = randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const vehicleField = fields.find((field) => field.field === 'vehicleModel')!
  const interactionWithoutToken: SalesAgentInteraction = {
    interactionId,
    kind: 'CHOICE',
    slot: 'knowledge_scope',
    mode: 'MULTIPLE',
    title: 'Chọn phạm vi tài liệu',
    description: 'Chọn dòng xe và năm áp dụng (nếu cần) trong cùng một lần gửi.',
    minSelections: fields.filter((field) => field.required).length,
    maxSelections: fields.length,
    allowFreeText: false,
    submitLabel: 'Xác nhận phạm vi',
    // Keep the legacy top-level list populated for older clients. The linked
    // form uses fields, while the token contains every field option.
    options: vehicleField.options.slice(0, 8),
    fields,
    continuationToken: '',
    expiresAt,
  }

  const tokenOptions: Record<string, InteractionTokenOption> = {}
  for (const field of fields) {
    for (const option of field.options) {
      const metadata = option.metadata
        ? Object.fromEntries(Object.entries(option.metadata).filter(([, value]) => (
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ))) as Record<string, string | number | boolean>
        : undefined
      tokenOptions[option.optionId] = {
        label: option.label,
        value: option.value || option.label,
        kind: 'allowlist',
        field: option.field,
        ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
      }
    }
  }
  const continuationToken = signSalesAgentInteractionToken(
    interactionTokenPayloadFromInteraction(interactionWithoutToken, context.conversationId, context.messageId, tokenOptions),
  )
  return { ...interactionWithoutToken, continuationToken }
}
