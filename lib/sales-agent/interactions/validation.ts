import 'server-only'

import { getSalesAgentVehicleSnapshots } from '../catalog/context'
import type { SalesAgentInteractionTokenPayload } from './token'

type SelectedInteractionOption = {
  value: string
  kind: 'product' | 'allowlist'
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
  const snapshots = await getSalesAgentVehicleSnapshots(productIds)
  if (snapshots.length !== productIds.length) {
    throw new SalesAgentInteractionValidationError('Một hoặc nhiều mẫu xe đã ngừng bán hoặc không còn trong catalog active.')
  }
  if (payload.productType && snapshots.some((snapshot) => snapshot.productType !== payload.productType)) {
    throw new SalesAgentInteractionValidationError('Mẫu xe đã chọn không cùng loại với interaction này.')
  }
}
