type DepositOrderUpdate = Record<string, unknown>

type SupabaseLike = {
  from: (table: string) => {
    update: (payload: DepositOrderUpdate) => {
      eq: (column: string, value: string) => PromiseLike<{ error: any }>
    }
  }
}

const KYC_COLUMNS = new Set(['kyc_status', 'kyc_session_id'])

function withoutKycColumns(payload: DepositOrderUpdate): DepositOrderUpdate {
  return Object.fromEntries(
    Object.entries(payload).filter(([column]) => !KYC_COLUMNS.has(column)),
  )
}

/**
 * Persists a deposit order transition and its KYC snapshot together. During the
 * migration window, a legacy Supabase schema can still apply the order
 * transition without the two new KYC columns.
 */
export async function updateDepositOrderWithKycFallback(
  supabase: SupabaseLike,
  orderId: string,
  payload: DepositOrderUpdate,
) {
  const result = await supabase.from('deposit_orders').update(payload).eq('id', orderId)
  if (result.error?.code !== '42703') return result

  const legacyPayload = withoutKycColumns(payload)
  if (Object.keys(legacyPayload).length === 0) return { error: null }

  return supabase.from('deposit_orders').update(legacyPayload).eq('id', orderId)
}
