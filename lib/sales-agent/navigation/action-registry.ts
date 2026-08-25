import type {
  NavigationActionKey,
  NavigationIntent,
  ProductType,
  SalesAgentAction,
} from '../contracts'
import { salesAgentProductUrl } from './paths'

export const ACTION_LABELS: Record<NavigationActionKey, string> = {
  BROWSE_CATALOG: 'Xem tất cả sản phẩm',
  VIEW_PRODUCT: 'Xem chi tiết xe',
  OPEN_COMPARE: 'So sánh các mẫu xe',
  OPEN_PROMOTIONS: 'Xem ưu đãi hiện có',
  DISCOVER_ACCESSORIES: 'Xem phụ kiện chính hãng',
  CONSULT_AGENT: 'Liên hệ tư vấn viên',
}

export function resolveActionHref(
  actionKey: NavigationActionKey,
  entityType?: ProductType,
  slug?: string,
): string {
  switch (actionKey) {
    case 'VIEW_PRODUCT':
      if (slug && entityType) {
        return salesAgentProductUrl(entityType as any, slug)
      }
      return '/cars'

    case 'BROWSE_CATALOG':
      if (entityType === 'BIKE') return '/bikes'
      if (entityType === 'ACCESSORY') return '/accessories'
      return '/cars'

    case 'OPEN_COMPARE':
      return '/compare'

    case 'OPEN_PROMOTIONS':
      return '/promotions'

    case 'DISCOVER_ACCESSORIES':
      return '/accessories'

    case 'CONSULT_AGENT':
      return '/support'

    default:
      return '/cars'
  }
}

export function resolveNavigationAction(
  intent: NavigationIntent,
  entitySlug?: string,
  customLabel?: string,
): SalesAgentAction {
  const href = resolveActionHref(intent.actionKey, intent.entityType, entitySlug)
  const label = customLabel || ACTION_LABELS[intent.actionKey] || 'Xem chi tiết'

  return {
    actionId: `action-${intent.actionKey}-${intent.entityId || 'default'}`,
    label,
    kind: intent.actionKey === 'VIEW_PRODUCT' || intent.actionKey === 'OPEN_COMPARE' ? 'PRIMARY' : 'SECONDARY',
    target: {
      type: 'ROUTE',
      href,
    },
    actionKey: intent.actionKey,
    entityId: intent.entityId,
  }
}
