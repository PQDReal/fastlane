import type { SupabaseClient } from '@supabase/supabase-js'

type DepositOwnership = {
  id: string
  customer_id: string | null
  email: string | null
}

type CustomerIdentity = {
  id: string
  email: string
}

export function normalizeDepositOwnerEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

export function isSameDepositOwnerEmail(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = normalizeDepositOwnerEmail(left)
  return Boolean(normalizedLeft && normalizedLeft === normalizeDepositOwnerEmail(right))
}

/**
 * Claims a legacy/guest deposit once the owner signs in with the same verified
 * account email. The database command repeats the identity check under a row
 * lock; this client-side check only avoids unnecessary RPC calls.
 */
export async function claimGuestDepositOrder(
  supabase: SupabaseClient,
  order: DepositOwnership,
  customer: CustomerIdentity,
) {
  if (order.customer_id === customer.id) return false
  if (order.customer_id || !isSameDepositOwnerEmail(order.email, customer.email)) {
    throw new Error('DEPOSIT_CLAIM_FORBIDDEN')
  }

  const { error } = await supabase.rpc('claim_guest_deposit_order', {
    p_order_id: order.id,
    p_customer_id: customer.id,
    p_event_key: `DEPOSIT_ORDER_CLAIMED:${order.id}:${customer.id}`,
  })
  if (error) throw error
  return true
}
