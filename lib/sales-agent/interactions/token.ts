import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { SalesAgentInteraction, SalesAgentInteractionResponse, SalesAgentInteractionSlot, SalesAgentInteractionMode, SalesAgentInteractionProductType, SalesAgentScopeField } from '../contracts/interaction'

export type InteractionTokenOption = {
  label: string
  value: string
  kind: 'product' | 'allowlist'
  field?: SalesAgentScopeField
  metadata?: Record<string, string | number | boolean>
}

export type SalesAgentInteractionTokenPayload = {
  schemaVersion: '1.0' | '2.0'
  interactionId: string
  conversationId: string
  messageId: string
  slot: SalesAgentInteractionSlot
  mode: SalesAgentInteractionMode
  productType?: SalesAgentInteractionProductType
  minSelections: number
  maxSelections: number
  allowFreeText: boolean
  expiresAt: string
  options: Record<string, InteractionTokenOption>
  requiredFields?: SalesAgentScopeField[]
}

function secret() {
  const value = process.env.SALES_AGENT_INTERACTION_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.AUTH0_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value) throw new Error('Sales Agent interaction secret chưa được cấu hình.')
  return value
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(payload: string) {
  return encode(createHmac('sha256', secret()).update(payload).digest())
}

export function signSalesAgentInteractionToken(payload: SalesAgentInteractionTokenPayload) {
  const encodedPayload = encode(JSON.stringify(payload))
  return `${encodedPayload}.${signature(encodedPayload)}`
}

export function verifySalesAgentInteractionToken(token: string): SalesAgentInteractionTokenPayload {
  const [encodedPayload, encodedSignature] = token.split('.')
  if (!encodedPayload || !encodedSignature || encodedPayload.length > 32_000 || encodedSignature.length > 256) throw new Error('Continuation token không hợp lệ.')
  const expected = signature(encodedPayload)
  const receivedBuffer = Buffer.from(encodedSignature)
  const expectedBuffer = Buffer.from(expected)
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) throw new Error('Continuation token không hợp lệ.')
  let payload: unknown
  try {
    payload = JSON.parse(decode(encodedPayload))
  } catch {
    throw new Error('Continuation token không hợp lệ.')
  }
  if (!payload || typeof payload !== 'object' || ((payload as Record<string, unknown>).schemaVersion !== '1.0' && (payload as Record<string, unknown>).schemaVersion !== '2.0')) throw new Error('Continuation token không hợp lệ.')
  const result = payload as SalesAgentInteractionTokenPayload
  const expiresAt = Date.parse(result.expiresAt)
  if (!result.interactionId || !result.conversationId || !result.messageId || !result.options || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('Interaction đã hết hạn hoặc không hợp lệ.')
  return result
}

const consumedTokens = new Set<string>()

export function validateSalesAgentInteractionResponse(response: SalesAgentInteractionResponse, conversationId: string) {
  const payload = verifySalesAgentInteractionToken(response.continuationToken)
  if (payload.conversationId !== conversationId || payload.interactionId !== response.interactionId) throw new Error('Interaction không thuộc cuộc hội thoại này.')
  if (consumedTokens.has(response.continuationToken)) throw new Error('Interaction đã được gửi trước đó.')
  const selected = [...new Set(response.selectedOptionIds)]
  if ((!selected.length && !payload.allowFreeText) || selected.length > payload.maxSelections || (!response.freeText && selected.length < payload.minSelections)) throw new Error('Số lựa chọn không hợp lệ.')
  if (!payload.allowFreeText && response.freeText) throw new Error('Interaction không nhận nội dung nhập thêm.')
  const selectedOptions = selected.map((optionId) => {
    const option = (payload.options as Record<string, InteractionTokenOption>)[optionId]
    if (!option) throw new Error('Lựa chọn không thuộc interaction này.')
    return { optionId, ...option }
  })
  if (payload.slot === 'knowledge_scope' || payload.requiredFields?.length) {
    const scopeOptions = selectedOptions.filter((option) => option.field)
    const requiredFields = payload.requiredFields ?? ['vehicleModel']
    const selectedFields = new Set(scopeOptions.map((option) => option.field))
    if (scopeOptions.length !== selectedOptions.length || requiredFields.some((field) => !selectedFields.has(field))) {
      throw new Error('Vui lòng chọn đủ phạm vi dòng xe và năm áp dụng.')
    }
    if (scopeOptions.some((option, index) => scopeOptions.findIndex((candidate) => candidate.field === option.field) !== index)) {
      throw new Error('Mỗi trường phạm vi chỉ được chọn một giá trị.')
    }
    const modelSelected = scopeOptions.some((option) => option.field === 'vehicleModel')
    if (!modelSelected && scopeOptions.some((option) => option.field === 'modelYear')) {
      throw new Error('Cần chọn dòng xe trước khi chọn năm áp dụng.')
    }
  }
  return { payload, selectedOptions, freeText: response.freeText }
}

export function consumeSalesAgentInteractionResponse(response: SalesAgentInteractionResponse, conversationId: string) {
  const result = validateSalesAgentInteractionResponse(response, conversationId)
  consumedTokens.add(response.continuationToken)
  if (consumedTokens.size > 10_000) consumedTokens.delete(consumedTokens.values().next().value as string)
  return result
}

export function interactionTokenPayloadFromInteraction(interaction: SalesAgentInteraction, conversationId: string, messageId: string, options: Record<string, InteractionTokenOption>): SalesAgentInteractionTokenPayload {
  return {
    schemaVersion: '1.0',
    interactionId: interaction.interactionId,
    conversationId,
    messageId,
    slot: interaction.slot,
    mode: interaction.mode,
    ...(interaction.productType ? { productType: interaction.productType } : {}),
    minSelections: interaction.minSelections,
    maxSelections: interaction.maxSelections,
    allowFreeText: interaction.allowFreeText,
    expiresAt: interaction.expiresAt,
    options,
    ...(interaction.fields?.length
      ? {
          requiredFields: interaction.fields.filter((field) => field.required).map((field) => field.field),
        }
      : {}),
  }
}
