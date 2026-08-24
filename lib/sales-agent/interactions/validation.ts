import 'server-only'

import { getProductDetailsRepository } from '../catalog/product-details'
import type { SalesAgentInteractionTokenPayload } from './token'
import type { KnowledgeScopeCatalogSnapshot } from '../knowledge/scope-catalog'
import type { KnowledgeScopeBinding } from '../knowledge/scope-context'

type SelectedInteractionOption = {
  optionId?: string
  value: string
  kind: 'product' | 'allowlist'
  field?: 'vehicleModel' | 'modelYear'
  metadata?: Record<string, unknown>
}

export class SalesAgentInteractionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesAgentInteractionValidationError'
  }
}

/** Re-checks catalog-backed interaction options at submit time. */
export async function validateSalesAgentInteractionProducts(
  payload: SalesAgentInteractionTokenPayload,
  selectedOptions: SelectedInteractionOption[],
) {
  const productOptions = selectedOptions.filter((option) => option.kind === 'product')
  if (!productOptions.length) return
  if (payload.slot !== 'vehicles' && payload.slot !== 'vehicle') {
    throw new SalesAgentInteractionValidationError('Interaction chứa lựa chọn xe không hợp lệ.')
  }

  const productIds = [...new Set(productOptions.map((option) => option.value))]
  const detailsRes = await getProductDetailsRepository({ productIds })
  const products = detailsRes.outcome === 'SUCCESS' ? detailsRes.data.products : []

  if (products.length !== productIds.length) {
    throw new SalesAgentInteractionValidationError('Một hoặc nhiều mẫu xe đã ngừng bán hoặc không còn trong catalog active.')
  }
  if (payload.productType && products.some((p) => p.productType !== payload.productType)) {
    throw new SalesAgentInteractionValidationError('Mẫu xe đã chọn không cùng loại với interaction này.')
  }
}

function normalizeScopeModel(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Validates a scope form against the current catalog epoch before consuming its token. */
export function validateSalesAgentScopeInteraction(
  payload: SalesAgentInteractionTokenPayload,
  selectedOptions: SelectedInteractionOption[],
  snapshot: KnowledgeScopeCatalogSnapshot,
): KnowledgeScopeBinding {
  if (payload.slot !== 'knowledge_scope') {
    throw new SalesAgentInteractionValidationError('Interaction phạm vi tài liệu không hợp lệ.')
  }
  if (snapshot.status !== 'READY') {
    throw new SalesAgentInteractionValidationError('Phạm vi tài liệu đã thay đổi hoặc hiện chưa sẵn sàng. Vui lòng gửi lại câu hỏi.')
  }
  const modelOption = selectedOptions.find((option) => option.field === 'vehicleModel')
  const yearOption = selectedOptions.find((option) => option.field === 'modelYear')
  if (!modelOption || selectedOptions.filter((option) => option.field === 'vehicleModel').length !== 1) {
    throw new SalesAgentInteractionValidationError('Vui lòng chọn đúng một dòng xe.')
  }
  if (selectedOptions.filter((option) => option.field === 'modelYear').length > 1) {
    throw new SalesAgentInteractionValidationError('Vui lòng chọn đúng một năm áp dụng.')
  }

  const matchingModelEntries = snapshot.entries.filter((entry) => (
    entry.vehicleModel && normalizeScopeModel(entry.vehicleModel) === normalizeScopeModel(modelOption.value)
  ))
  if (matchingModelEntries.length === 0) {
    throw new SalesAgentInteractionValidationError('Dòng xe đã chọn không còn trong phạm vi tài liệu hiện hành.')
  }

  let modelYear: number | undefined
  let modelYearPolicy: 'EXPLICIT' | 'ONLY_AVAILABLE' | 'LATEST' = 'ONLY_AVAILABLE'
  if (yearOption) {
    const requestedModelYear = Number(yearOption.value)
    modelYear = requestedModelYear
    modelYearPolicy = 'EXPLICIT'
    const yearModel = yearOption.metadata?.vehicleModel
    if (yearModel && normalizeScopeModel(yearModel) !== normalizeScopeModel(modelOption.value)) {
      throw new SalesAgentInteractionValidationError('Cặp dòng xe và năm áp dụng không hợp lệ.')
    }
    if (!Number.isInteger(requestedModelYear) || !matchingModelEntries.some((entry) => (
      (entry.modelYearFrom == null || requestedModelYear >= entry.modelYearFrom)
      && (entry.modelYearTo == null || requestedModelYear <= entry.modelYearTo)
    ))) {
      throw new SalesAgentInteractionValidationError('Năm áp dụng không thuộc dòng xe đã chọn hoặc đã trở nên lỗi thời.')
    }
  } else {
    const availableYears = new Set(matchingModelEntries.flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo]
      .filter((year): year is number => Number.isInteger(year))))
    modelYearPolicy = availableYears.size > 1 ? 'LATEST' : 'ONLY_AVAILABLE'
  }

  const bindingId = `scope-interaction-${payload.interactionId}`
  return {
    bindingId,
    vehicleModel: modelOption.value,
    modelYearPolicy,
    ...(modelYear == null ? {} : { modelYear }),
    sources: {
      vehicleModel: 'SIGNED_INTERACTION',
      ...(modelYear == null ? {} : { modelYear: 'SIGNED_INTERACTION' }),
    },
    sourceTexts: selectedOptions.map((option) => option.value).slice(0, 3),
  }
}
