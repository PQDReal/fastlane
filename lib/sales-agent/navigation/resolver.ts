import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const SALES_AGENT_NAVIGATION_ACTIONS = [
  'VIEW_PRODUCT',
  'BROWSE_CATALOG',
  'OPEN_COMPARE',
] as const

export type SalesAgentNavigationActionKey = (typeof SALES_AGENT_NAVIGATION_ACTIONS)[number]

export type SalesAgentNavigationIntent = {
  actionKey: SalesAgentNavigationActionKey
  entityType?: 'CAR' | 'BIKE' | 'ACCESSORY'
  entityId?: string
}

export type SalesAgentNavigationAction = SalesAgentNavigationIntent & {
  label: string
  href: string
}

export function requestsNavigation(message: string) {
  const normalized = normalizeProductSearchText(message)
  return ['link', 'url', 'duong dan', 'xem trang', 'mo trang', 'xem san pham', 'gui toi', 'truy cap']
    .some((phrase) => normalized.includes(phrase))
}

export async function resolveSalesAgentNavigation(intent: SalesAgentNavigationIntent): Promise<SalesAgentNavigationAction | null> {
  if (intent.actionKey === 'BROWSE_CATALOG') {
    if (intent.entityType === 'ACCESSORY') return { ...intent, label: 'Xem danh mục phụ kiện', href: '/accessories' }
    if (intent.entityType === 'BIKE') return { ...intent, label: 'Xem danh mục xe máy điện', href: '/bikes' }
    return { ...intent, label: 'Xem danh mục ô tô điện', href: '/cars' }
  }
  if (intent.actionKey === 'OPEN_COMPARE') return { ...intent, label: 'Mở trang so sánh xe', href: '/compare' }
  if (intent.actionKey !== 'VIEW_PRODUCT' || !intent.entityId || !intent.entityType) return null

  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select('id,name,slug,product_type')
    .eq('id', intent.entityId)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  const actualType = data.product_type === 'ACCESSORY' ? 'ACCESSORY' : data.product_type === 'BIKE' ? 'BIKE' : 'CAR'
  if (actualType !== intent.entityType) return null
  const prefix = actualType === 'ACCESSORY' ? '/accessories' : actualType === 'BIKE' ? '/bikes' : '/cars'
  return { ...intent, label: `Xem ${data.name}`, href: `${prefix}/${data.slug}` }
}

export function navigationActionMarkdown(action: SalesAgentNavigationAction) {
  const label = action.label.replace(/[\[\]\\]/g, '\\$&')
  return `[${label}](${action.href})`
}

export function stripUntrustedNavigation(value: string) {
  return value
    .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/gi, '$1')
    .replace(/https?:\/\/[^\s<>)]+/gi, '')
    .replace(/(^|\s)\/(?:cars|bikes|accessories)(?:\/[^\s<>)]+)?/gi, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
