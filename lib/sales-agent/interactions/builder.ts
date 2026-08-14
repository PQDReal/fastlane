import 'server-only'

import { randomUUID } from 'node:crypto'

import { searchSalesAgentCatalog, type SalesAgentCatalogFact, type SalesAgentProductType } from '../catalog/context'
import { validateSalesAgentInteraction, SALES_AGENT_INTERACTION_MAX_OPTIONS, type SalesAgentInteraction, type SalesAgentInteractionSlot, type SalesAgentInteractionMode } from '../contracts/interaction'
import { salesAgentBudgetOptions } from './budget'
import { interactionTokenPayloadFromInteraction, signSalesAgentInteractionToken } from './token'

type ChoiceRequest = {
  slot: SalesAgentInteractionSlot
  mode: SalesAgentInteractionMode
  minSelections: number
  maxSelections: number
  allowFreeText?: boolean
  productType?: SalesAgentProductType
}

type OptionDraft = {
  label: string
  description?: string
  value: string
  kind: 'product' | 'allowlist'
  recommended?: boolean
}

const CRITERIA_OPTIONS: OptionDraft[] = [
  { value: 'battery_capacity_kwh', label: 'Dung lượng pin', kind: 'allowlist' },
  { value: 'top_speed_kmh', label: 'Tốc độ tối đa', kind: 'allowlist' },
  { value: 'range_km', label: 'Quãng đường', kind: 'allowlist' },
  { value: 'max_power_kw', label: 'Công suất', kind: 'allowlist' },
  { value: 'price', label: 'Giá bán', kind: 'allowlist' },
]

const USAGE_OPTIONS: OptionDraft[] = [
  { value: 'city_daily', label: 'Đi lại hằng ngày trong thành phố', kind: 'allowlist' },
  { value: 'family', label: 'Gia đình', kind: 'allowlist' },
  { value: 'long_distance', label: 'Đi xa thường xuyên', kind: 'allowlist' },
  { value: 'first_vehicle', label: 'Mua xe điện đầu tiên', kind: 'allowlist', recommended: true },
]

function vehicleDescription(item: SalesAgentCatalogFact) {
  return item.price !== null ? `Từ ${new Intl.NumberFormat('vi-VN').format(item.price)} đồng` : undefined
}

async function vehicleOptions(request: ChoiceRequest): Promise<OptionDraft[]> {
  const productTypes: SalesAgentProductType[] = request.productType === 'CAR' || request.productType === 'BIKE'
    ? [request.productType]
    : ['CAR', 'BIKE']
  const items = await searchSalesAgentCatalog({ productTypes, limit: SALES_AGENT_INTERACTION_MAX_OPTIONS })
  return items.map((item) => ({
    value: item.id,
    label: item.name,
    description: vehicleDescription(item),
    kind: 'product' as const,
  }))
}

function budgetOptions(productType?: SalesAgentProductType): OptionDraft[] {
  const type = productType === 'BIKE' || productType === 'ACCESSORY' ? productType : 'CAR'
  return salesAgentBudgetOptions(type).map((option) => ({ ...option, kind: 'allowlist' }))
}

function optionDrafts(request: ChoiceRequest, vehicles: OptionDraft[]) {
  if (request.slot === 'vehicles' || request.slot === 'vehicle') return vehicles
  if (request.slot === 'criteria') return CRITERIA_OPTIONS
  if (request.slot === 'budget') return budgetOptions(request.productType)
  return USAGE_OPTIONS
}

function titleFor(slot: SalesAgentInteractionSlot, mode: SalesAgentInteractionMode) {
  if (slot === 'vehicles') return 'Chọn mẫu xe cần so sánh'
  if (slot === 'vehicle') return 'Chọn mẫu xe bạn quan tâm'
  if (slot === 'criteria') return mode === 'multiple' ? 'Bạn muốn ưu tiên tiêu chí nào?' : 'Bạn muốn ưu tiên tiêu chí nào?'
  if (slot === 'budget') return 'Khoảng ngân sách của bạn là bao nhiêu?'
  return 'Bạn sử dụng xe chủ yếu như thế nào?'
}

export async function buildSalesAgentInteraction(request: ChoiceRequest, context: { conversationId: string; messageId: string }): Promise<SalesAgentInteraction> {
  const vehicles = request.slot === 'vehicles' || request.slot === 'vehicle' ? await vehicleOptions(request) : []
  const drafts = optionDrafts(request, vehicles).slice(0, SALES_AGENT_INTERACTION_MAX_OPTIONS)
  const allowFreeText = request.allowFreeText === true || drafts.length < request.minSelections
  const interactionId = randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const options = drafts.map((draft) => ({
    optionId: `opt_${randomUUID()}`,
    label: draft.label,
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.recommended ? { recommended: true } : {}),
  }))
  const interactionWithoutToken = {
    schemaVersion: '1.0' as const,
    interactionId,
    kind: 'choice' as const,
    slot: request.slot,
    mode: request.mode,
    ...(request.productType ? { productType: request.productType } : {}),
    title: titleFor(request.slot, request.mode),
    description: allowFreeText ? 'Bạn có thể chọn nhanh hoặc nhập câu trả lời riêng.' : undefined,
    minSelections: request.minSelections,
    maxSelections: request.maxSelections,
    allowFreeText,
    submitLabel: 'Tiếp tục',
    options,
    continuationToken: '',
    expiresAt,
  }
  const tokenOptions = Object.fromEntries(options.map((option, index) => [option.optionId, { label: option.label, value: drafts[index].value, kind: drafts[index].kind }]))
  const continuationToken = signSalesAgentInteractionToken(interactionTokenPayloadFromInteraction(interactionWithoutToken, context.conversationId, context.messageId, tokenOptions))
  return validateSalesAgentInteraction({ ...interactionWithoutToken, continuationToken })
}
