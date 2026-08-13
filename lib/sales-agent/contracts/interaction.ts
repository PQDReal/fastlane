export const SALES_AGENT_INTERACTION_MAX_OPTIONS = 8
export const SALES_AGENT_INTERACTION_MAX_FREE_TEXT = 500

export type SalesAgentInteractionSlot = 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage'
export type SalesAgentInteractionMode = 'single' | 'multiple'

export type SalesAgentInteractionOption = {
  optionId: string
  label: string
  description?: string
  recommended?: boolean
}

export type SalesAgentInteraction = {
  schemaVersion: '1.0'
  interactionId: string
  kind: 'choice'
  slot: SalesAgentInteractionSlot
  mode: SalesAgentInteractionMode
  title: string
  description?: string
  minSelections: number
  maxSelections: number
  allowFreeText: boolean
  submitLabel: string
  options: SalesAgentInteractionOption[]
  continuationToken: string
  expiresAt: string
}

export type SalesAgentInteractionResponse = {
  interactionId: string
  selectedOptionIds: string[]
  freeText?: string
  continuationToken: string
}

export function validateSalesAgentInteraction(value: unknown): SalesAgentInteraction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Interaction không hợp lệ.')
  const input = value as Record<string, unknown>
  const mode = input.mode === 'single' || input.mode === 'multiple' ? input.mode : null
  const slot = ['vehicles', 'vehicle', 'criteria', 'budget', 'usage'].includes(String(input.slot)) ? input.slot as SalesAgentInteractionSlot : null
  const options = Array.isArray(input.options) ? input.options : null
  if (input.schemaVersion !== '1.0' || input.kind !== 'choice' || !mode || !slot || !options) throw new Error('Interaction schema không được hỗ trợ.')
  if (options.length > SALES_AGENT_INTERACTION_MAX_OPTIONS) throw new Error('Interaction vượt quá số lựa chọn cho phép.')
  if (mode === 'multiple' && Number(input.maxSelections) < 2) throw new Error('So sánh nhiều lựa chọn cần ít nhất hai option.')

  const optionIds = new Set<string>()
  const normalizedOptions = options.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Interaction option không hợp lệ.')
    const option = item as Record<string, unknown>
    const optionId = typeof option.optionId === 'string' ? option.optionId.trim() : ''
    const label = typeof option.label === 'string' ? option.label.trim() : ''
    if (!optionId || !label || optionId.length > 120 || label.length > 160 || optionIds.has(optionId)) throw new Error('Interaction option bị trùng hoặc không hợp lệ.')
    optionIds.add(optionId)
    return {
      optionId,
      label,
      ...(typeof option.description === 'string' && option.description.trim() ? { description: option.description.trim().slice(0, 300) } : {}),
      ...(option.recommended === true ? { recommended: true } : {}),
    }
  })

  const minSelections = Number(input.minSelections)
  const maxSelections = Number(input.maxSelections)
  const allowFreeText = input.allowFreeText === true
  if (!Number.isInteger(minSelections) || !Number.isInteger(maxSelections) || minSelections < 0 || maxSelections < minSelections || maxSelections > SALES_AGENT_INTERACTION_MAX_OPTIONS || mode === 'single' && (minSelections !== 1 || maxSelections !== 1)) {
    throw new Error('Giới hạn lựa chọn của interaction không hợp lệ.')
  }
  if (minSelections > normalizedOptions.length && !allowFreeText) throw new Error('Interaction không có đủ lựa chọn bắt buộc.')

  const interactionId = typeof input.interactionId === 'string' ? input.interactionId.trim() : ''
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const submitLabel = typeof input.submitLabel === 'string' ? input.submitLabel.trim() : ''
  const continuationToken = typeof input.continuationToken === 'string' ? input.continuationToken : ''
  const expiresAt = typeof input.expiresAt === 'string' ? input.expiresAt : ''
  if (!interactionId || !title || !submitLabel || !continuationToken || !expiresAt) throw new Error('Interaction thiếu metadata bắt buộc.')
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('Interaction đã hết hạn.')

  return {
    schemaVersion: '1.0',
    interactionId,
    kind: 'choice',
    slot,
    mode,
    title: title.slice(0, 160),
    ...(typeof input.description === 'string' && input.description.trim() ? { description: input.description.trim().slice(0, 400) } : {}),
    minSelections,
    maxSelections,
    allowFreeText,
    submitLabel: submitLabel.slice(0, 80),
    options: normalizedOptions,
    continuationToken,
    expiresAt,
  }
}
