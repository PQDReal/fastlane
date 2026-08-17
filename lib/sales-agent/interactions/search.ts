import 'server-only'

import { randomUUID } from 'node:crypto'

import { browseCatalogRepository } from '../catalog/browse'
import type { ProductType } from '../contracts'
import { validateSalesAgentInteraction, type SalesAgentInteraction } from '../contracts/interaction'
import {
  interactionTokenPayloadFromInteraction,
  signSalesAgentInteractionToken,
  verifySalesAgentInteractionToken,
} from './token'

export type SalesAgentInteractionSearchInput = {
  continuationToken: string
  conversationId: string
  query?: string
  selectedOptionIds?: string[]
}

function productType(value: unknown): ProductType | undefined {
  return value === 'CAR' || value === 'BIKE' || value === 'ACCESSORY' ? value : undefined
}

function optionDescription(price: number | null) {
  return price === null ? undefined : `Từ ${new Intl.NumberFormat('vi-VN').format(price)} đồng`
}

/** Searches only the active/type-bound catalog and returns a fresh signed page token. */
export async function searchSalesAgentInteraction(input: SalesAgentInteractionSearchInput): Promise<SalesAgentInteraction> {
  const payload = verifySalesAgentInteractionToken(input.continuationToken)
  if (payload.conversationId !== input.conversationId) throw new Error('Interaction không thuộc cuộc hội thoại này.')
  if (payload.slot !== 'vehicles' && payload.slot !== 'vehicle') throw new Error('Interaction này không hỗ trợ tìm mẫu xe.')
  const selectedOptionIds = [...new Set(input.selectedOptionIds ?? [])]
  if (selectedOptionIds.length > payload.maxSelections) throw new Error('Số lựa chọn không hợp lệ.')
  const selectedOptions = selectedOptionIds.map((optionId) => {
    const option = payload.options[optionId]
    if (!option) throw new Error('Lựa chọn không thuộc interaction này.')
    return { optionId, label: option.label }
  })
  const type = productType(payload.productType)
  const browseRes = await browseCatalogRepository({
    ...(type ? { productTypes: [type] } : {}),
    page: { limit: Math.min(4, Math.max(0, 8 - selectedOptions.length)) },
  })
  const items = browseRes.outcome === 'SUCCESS' ? browseRes.data.items : []
  const optionDrafts = [
    ...items.map((item) => ({
      optionId: `opt_${randomUUID()}`,
      label: item.name,
      ...(optionDescription(item.price) ? { description: optionDescription(item.price) } : {}),
    })),
    ...selectedOptions.filter((selected) => !items.some((item) => item.name === selected.label)),
  ].slice(0, 8)
  const interactionWithoutToken = {
    schemaVersion: '2.0' as const,
    interactionId: payload.interactionId,
    kind: 'CHOICE' as const,
    slot: payload.slot,
    mode: payload.mode,
    ...(type ? { productType: type } : {}),
    title: payload.slot === 'vehicles' ? 'Chọn mẫu xe cần so sánh' : 'Chọn mẫu xe bạn quan tâm',
    description: 'Bạn có thể chọn nhanh hoặc nhập câu trả lời riêng.',
    minSelections: payload.minSelections,
    maxSelections: payload.maxSelections,
    allowFreeText: payload.allowFreeText || items.length < payload.minSelections,
    submitLabel: 'Tiếp tục',
    options: optionDrafts,
    continuationToken: '',
    expiresAt: payload.expiresAt,
  }
  const newOptionPayload = Object.fromEntries(items.map((item, index) => [interactionWithoutToken.options[index].optionId, { label: item.name, value: item.id, kind: 'product' as const }]))
  const selectedOptionPayload = Object.fromEntries(selectedOptions.map((selected) => [selected.optionId, payload.options[selected.optionId]]))
  const options = { ...newOptionPayload, ...selectedOptionPayload }
  const continuationToken = signSalesAgentInteractionToken(interactionTokenPayloadFromInteraction(interactionWithoutToken, input.conversationId, payload.messageId, options))
  return validateSalesAgentInteraction({ ...interactionWithoutToken, continuationToken })
}
